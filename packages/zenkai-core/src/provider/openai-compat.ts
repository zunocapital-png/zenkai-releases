import type { Message, Part } from "../types/index"
import type { ChatRequest, ChatResponse, ChatChunk, Provider, ProviderContext, ProviderMeta } from "./types"

// Adapter OpenAI-compatible universal. Sirve para todo provider que expone
// /v1/chat/completions con el shape de OpenAI (que es la mayoría en 2026:
// OpenAI, DeepSeek, Groq, Together, OpenRouter, NVIDIA NIM, Ollama, LM Studio,
// Cerebras, Fireworks, Mistral, y todo lo que respete el estándar).

function toOpenAIMessages(messages: Message[]): Array<{ role: string; content: unknown }> {
  return messages.map((m) => {
    // Parts simples → content string; parts mixtos → content array (vision).
    if (m.parts.length === 1 && m.parts[0]?.type === "text") {
      return { role: m.role, content: (m.parts[0] as { type: "text"; text: string }).text }
    }
    const content = m.parts.map((p: Part) => {
      if (p.type === "text") return { type: "text", text: p.text }
      if (p.type === "image") return { type: "image_url", image_url: { url: p.url } }
      if (p.type === "tool-call") return { type: "text", text: `[tool ${p.toolName}(${JSON.stringify(p.args)})]` }
      if (p.type === "tool-result") return { type: "text", text: `[result: ${JSON.stringify(p.result)}]` }
      return { type: "text", text: "" }
    })
    return { role: m.role, content }
  })
}

export function crearProviderOpenAICompat(meta: ProviderMeta): Provider {
  return {
    meta,
    async chat(req: ChatRequest, ctx: ProviderContext): Promise<ChatResponse> {
      const t0 = Date.now()
      const headers: Record<string, string> = { "content-type": "application/json" }
      if (ctx.apiKey) headers["authorization"] = `Bearer ${ctx.apiKey}`

      const body = {
        model: req.model,
        messages: toOpenAIMessages(req.messages),
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens,
        tools: req.tools,
        stream: false,
      }

      const res = await fetch(`${meta.baseURL}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctx.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`Provider ${meta.name} HTTP ${res.status}: ${text.slice(0, 200)}`)
      }

      const data = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string
            tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
          }
          finish_reason?: string
        }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }

      const choice = data.choices?.[0]
      const usage = data.usage
      const inputTokens = usage?.prompt_tokens ?? 0
      const outputTokens = usage?.completion_tokens ?? 0
      const costUsd =
        ((meta.costPer1MInput ?? 0) * inputTokens) / 1_000_000 +
        ((meta.costPer1MOutput ?? 0) * outputTokens) / 1_000_000

      const toolCalls = choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id ?? crypto.randomUUID(),
        name: tc.function?.name ?? "",
        args: (() => {
          try { return JSON.parse(tc.function?.arguments ?? "{}") } catch { return {} }
        })(),
      }))

      return {
        provider: meta.name,
        model: req.model,
        content: choice?.message?.content ?? "",
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        usage: { inputTokens, outputTokens, costUsd },
        finishReason: mapFinish(choice?.finish_reason),
        latencyMs: Date.now() - t0,
      }
    },

    async *stream(req: ChatRequest, ctx: ProviderContext): AsyncIterable<ChatChunk> {
      const headers: Record<string, string> = { "content-type": "application/json" }
      if (ctx.apiKey) headers["authorization"] = `Bearer ${ctx.apiKey}`

      const res = await fetch(`${meta.baseURL}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: req.model,
          messages: toOpenAIMessages(req.messages),
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens,
          tools: req.tools,
          stream: true,
        }),
        signal: ctx.signal,
      })

      if (!res.ok || !res.body) {
        yield { type: "error", error: `HTTP ${res.status}` }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let inputTokens = 0
      let outputTokens = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // Formato SSE: lines "data: {...}\n"
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data: ")) continue
          const payload = trimmed.slice(6)
          if (payload === "[DONE]") {
            const costUsd =
              ((meta.costPer1MInput ?? 0) * inputTokens) / 1_000_000 +
              ((meta.costPer1MOutput ?? 0) * outputTokens) / 1_000_000
            yield { type: "done", usage: { inputTokens, outputTokens, costUsd } }
            return
          }
          try {
            const data = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string; tool_calls?: unknown } }>
              usage?: { prompt_tokens?: number; completion_tokens?: number }
            }
            if (data.usage) {
              inputTokens = data.usage.prompt_tokens ?? inputTokens
              outputTokens = data.usage.completion_tokens ?? outputTokens
            }
            const delta = data.choices?.[0]?.delta
            if (delta?.content) yield { type: "text-delta", text: delta.content }
          } catch {
            // Line no-JSON: skip.
          }
        }
      }
    },
  }
}

function mapFinish(fr?: string): ChatResponse["finishReason"] {
  if (fr === "stop") return "stop"
  if (fr === "length") return "length"
  if (fr === "tool_calls") return "tool_calls"
  if (fr) return "error"
  return undefined
}
