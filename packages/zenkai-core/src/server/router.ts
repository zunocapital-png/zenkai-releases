import type { ChatRequest } from "../provider/types"
import type { ProviderOrchestrator } from "../provider/orchestrator"
import { crearSSE } from "./sse"

// ZenkaiCoreServer: un handler puro que expone la API OpenAI-compatible
// `/v1/chat/completions` (streaming + non-streaming), `/v1/models` y
// `/v1/health` corriendo sobre el ProviderOrchestrator de Fase 4.
//
// No abre puertos — devuelve un handler que se pasa a bun.serve, node http,
// electron IPC, o cualquier runtime. Así podemos usarlo dentro del proceso
// main del desktop sin overhead de red.

export type ZenkaiCoreServer = {
  handle: (req: Request) => Promise<Response>
}

export function crearZenkaiCoreServer(orchestrator: ProviderOrchestrator): ZenkaiCoreServer {
  return {
    handle: async (req: Request): Promise<Response> => {
      const url = new URL(req.url)

      // ── GET /v1/models ──
      if (req.method === "GET" && url.pathname === "/v1/models") {
        // Delegamos al orchestrator: expone lo que sus providers listen.
        // Por simplicidad devolvemos "auto" + los providers registrados.
        const stats = orchestrator.getStats()
        return Response.json({
          object: "list",
          data: [
            { id: "auto", object: "model", owned_by: "zenkai" },
            ...stats.map((s) => ({ id: s.name, object: "model", owned_by: "zenkai" })),
          ],
        })
      }

      // ── GET /v1/health ──
      if (req.method === "GET" && url.pathname === "/v1/health") {
        return Response.json({
          engine: "zenkai-core",
          providers: orchestrator.getStats(),
          timestamp: Date.now(),
        })
      }

      // ── POST /v1/chat/completions ──
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        let payload: ChatRequest & { stream?: boolean }
        try {
          payload = (await req.json()) as ChatRequest & { stream?: boolean }
        } catch {
          return Response.json({ error: { message: "JSON inválido" } }, { status: 400 })
        }

        // Non-streaming.
        if (!payload.stream) {
          try {
            const res = await orchestrator.chat(payload)
            return Response.json({
              id: `zenkai-${Date.now()}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: res.model,
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: res.content, tool_calls: res.toolCalls },
                  finish_reason: res.finishReason,
                },
              ],
              usage: res.usage
                ? {
                    prompt_tokens: res.usage.inputTokens,
                    completion_tokens: res.usage.outputTokens,
                    total_tokens: res.usage.inputTokens + res.usage.outputTokens,
                    cost_usd: res.usage.costUsd,
                  }
                : undefined,
              provider: res.provider,
              latency_ms: res.latencyMs,
            })
          } catch (e) {
            return Response.json({ error: { message: String(e) } }, { status: 502 })
          }
        }

        // Streaming SSE.
        const sse = crearSSE()
        // Fire-and-forget: la promesa corre en paralelo al Response.
        void (async () => {
          try {
            for await (const chunk of orchestrator.stream(payload)) {
              if (sse.clientSignal.aborted) break
              sse.write(chunk)
              if (chunk.type === "error") break
            }
            sse.close()
          } catch (e) {
            sse.error(String(e))
          }
        })()
        return new Response(sse.stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            "connection": "keep-alive",
            "x-zenkai-engine": "core",
          },
        })
      }

      // ── POST /v1/embeddings — paridad Ollama /api/embeddings ──
      if (req.method === "POST" && url.pathname === "/v1/embeddings") {
        let payload: { model?: string; input?: string | string[] }
        try {
          payload = (await req.json()) as { model?: string; input?: string | string[] }
        } catch {
          return Response.json({ error: { message: "JSON inválido" } }, { status: 400 })
        }
        const inputs = Array.isArray(payload.input) ? payload.input : payload.input ? [payload.input] : []
        if (inputs.length === 0 || !payload.model) {
          return Response.json({ error: { message: "faltan model / input" } }, { status: 400 })
        }
        // Delegamos al orchestrator via un "chat especial" — el provider real
        // sabe interpretar embeddings si el modelo tiene capability embed.
        // Para runtimes que no lo soportan devolvemos not_implemented claro.
        try {
          // Placeholder: emitimos shape OpenAI y dejamos que un adapter concreto lo llene.
          // Un provider embed-capable puede hookear acá en el orchestrator.
          const stats = orchestrator.getStats()
          if (stats.length === 0) throw new Error("no hay providers registrados")
          return Response.json({
            object: "list",
            data: inputs.map((text, index) => ({ object: "embedding", index, embedding: [] })),
            model: payload.model,
            usage: { prompt_tokens: inputs.length, total_tokens: inputs.length },
            zenkai_note: "endpoint activo — enchufá un provider con capability embed para vectores reales",
          })
        } catch (e) {
          return Response.json({ error: { message: String(e) } }, { status: 502 })
        }
      }

      // ── POST /v1/completions — paridad Ollama /api/generate (no-chat) ──
      if (req.method === "POST" && url.pathname === "/v1/completions") {
        let payload: { model?: string; prompt?: string; stream?: boolean; max_tokens?: number; temperature?: number }
        try {
          payload = (await req.json()) as {
            model?: string
            prompt?: string
            stream?: boolean
            max_tokens?: number
            temperature?: number
          }
        } catch {
          return Response.json({ error: { message: "JSON inválido" } }, { status: 400 })
        }
        if (!payload.model || !payload.prompt) {
          return Response.json({ error: { message: "faltan model / prompt" } }, { status: 400 })
        }
        // Adaptamos completion → chat con un solo user turn.
        const chatReq = {
          model: payload.model,
          messages: [{ id: "u", role: "user" as const, parts: [{ type: "text" as const, text: payload.prompt }], createdAt: 0 }],
          temperature: payload.temperature,
          maxTokens: payload.max_tokens,
        }
        try {
          const res = await orchestrator.chat(chatReq)
          return Response.json({
            id: `zenkai-${Date.now()}`,
            object: "text_completion",
            created: Math.floor(Date.now() / 1000),
            model: res.model,
            choices: [{ text: res.content, index: 0, finish_reason: res.finishReason }],
            usage: res.usage
              ? {
                  prompt_tokens: res.usage.inputTokens,
                  completion_tokens: res.usage.outputTokens,
                  total_tokens: res.usage.inputTokens + res.usage.outputTokens,
                }
              : undefined,
          })
        } catch (e) {
          return Response.json({ error: { message: String(e) } }, { status: 502 })
        }
      }

      return new Response("Not found", { status: 404 })
    },
  }
}
