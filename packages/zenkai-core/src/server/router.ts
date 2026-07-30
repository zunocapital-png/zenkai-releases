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

      return new Response("Not found", { status: 404 })
    },
  }
}
