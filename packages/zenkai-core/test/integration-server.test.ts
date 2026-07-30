import { describe, expect, test } from "bun:test"
import { crearZenkaiCoreServer } from "../src/server/router"
import { ProviderOrchestrator } from "../src/provider/orchestrator"
import type { Provider } from "../src/provider/types"

// Integration test end-to-end del server + orchestrator.
// Levanta el server en un port random y hace requests reales.

function stubProvider(name = "stub"): Provider {
  return {
    meta: { name, kind: "openai-compat", baseURL: "http://noop" },
    async chat(req) {
      return {
        provider: name,
        model: req.model,
        content: `respuesta a: ${req.messages[req.messages.length - 1]?.parts[0] && (req.messages[req.messages.length - 1]!.parts[0] as { text?: string }).text}`,
        usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
        latencyMs: 5,
      }
    },
    async *stream(req) {
      yield { type: "text-delta", text: "hola " }
      yield { type: "text-delta", text: "mundo" }
      yield { type: "done", usage: { inputTokens: 5, outputTokens: 2, costUsd: 0.0005 } }
    },
  }
}

describe("Server integration end-to-end", () => {
  test("GET /v1/models devuelve providers registrados", async () => {
    const orch = new ProviderOrchestrator()
    orch.register(stubProvider("test-provider"))
    const app = crearZenkaiCoreServer(orch)
    const res = await app.handle(new Request("http://x/v1/models"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { object?: string; data?: unknown[]; choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } }
    expect(body.object).toBe("list")
    expect(Array.isArray(body.data)).toBe(true)
  })

  test("POST /v1/chat/completions non-stream devuelve respuesta OpenAI-shape", async () => {
    const orch = new ProviderOrchestrator()
    orch.register(stubProvider("test"))
    const app = crearZenkaiCoreServer(orch)
    const res = await app.handle(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hola" }], createdAt: 0 }],
          stream: false,
        }),
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { object?: string; data?: unknown[]; choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } }
    expect(body.choices?.[0]?.message?.content).toContain("respuesta a: hola")
    expect(body.usage?.total_tokens).toBeGreaterThan(0)
  })

  test("POST /v1/chat/completions stream=true devuelve SSE", async () => {
    const orch = new ProviderOrchestrator()
    orch.register(stubProvider("test"))
    const app = crearZenkaiCoreServer(orch)
    const res = await app.handle(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hola" }], createdAt: 0 }],
          stream: true,
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    // Leemos algunos chunks del stream.
    const reader = res.body!.getReader()
    let accumulated = ""
    let count = 0
    while (count < 10) {
      const { done, value } = await reader.read()
      if (done) break
      accumulated += new TextDecoder().decode(value)
      count++
      if (accumulated.includes("[DONE]")) break
    }
    expect(accumulated).toContain("data: ")
    expect(accumulated).toContain("hola")
  })

  test("404 en ruta desconocida", async () => {
    const orch = new ProviderOrchestrator()
    const app = crearZenkaiCoreServer(orch)
    const res = await app.handle(new Request("http://x/v1/inexistente"))
    expect(res.status).toBe(404)
  })
})
