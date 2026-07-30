import { describe, expect, test } from "bun:test"
import { crearSSE } from "../src/server/sse.ts"
import { crearZenkaiCoreServer } from "../src/server/router.ts"
import { ProviderOrchestrator } from "../src/provider/orchestrator.ts"
import type { Provider, ChatChunk, ChatResponse } from "../src/provider/types.ts"

function fake(name: string, content = "hola"): Provider {
  return {
    meta: { name, kind: "openai-compat", baseURL: "http://fake", supportsStream: true },
    chat: async (): Promise<ChatResponse> => ({
      provider: name, model: "m", content, latencyMs: 10,
      usage: { inputTokens: 5, outputTokens: 10, costUsd: 0 }, finishReason: "stop",
    }),
    stream: async function*(): AsyncIterable<ChatChunk> {
      yield { type: "text-delta", text: "hola " }
      yield { type: "text-delta", text: "mundo" }
      yield { type: "done", usage: { inputTokens: 5, outputTokens: 10, costUsd: 0 }, finishReason: "stop" }
    },
  }
}

describe("SSE emitter · Fase 5", () => {
  test("write y close cierran con [DONE]", async () => {
    const sse = crearSSE({ heartbeatMs: 999_999 })
    sse.write({ type: "text-delta", text: "hola" })
    sse.close()
    const reader = sse.stream.getReader()
    const decoder = new TextDecoder()
    let body = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      body += decoder.decode(value)
    }
    expect(body).toContain("text-delta")
    expect(body).toContain("hola")
    expect(body).toContain("[DONE]")
  })

  test("error() cierra con payload de error", async () => {
    const sse = crearSSE({ heartbeatMs: 999_999 })
    sse.error("boom")
    const reader = sse.stream.getReader()
    const decoder = new TextDecoder()
    let body = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      body += decoder.decode(value)
    }
    expect(body).toContain("boom")
    expect(body).toContain("[DONE]")
  })

  test("event IDs se incrementan", async () => {
    const sse = crearSSE({ heartbeatMs: 999_999 })
    sse.write({ type: "text-delta", text: "a" })
    sse.write({ type: "text-delta", text: "b" })
    sse.close()
    const reader = sse.stream.getReader()
    const decoder = new TextDecoder()
    let body = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      body += decoder.decode(value)
    }
    expect(body).toContain("id: 1")
    expect(body).toContain("id: 2")
  })

  test("cancel del cliente dispara clientSignal", async () => {
    const sse = crearSSE({ heartbeatMs: 999_999 })
    expect(sse.clientSignal.aborted).toBe(false)
    await sse.stream.cancel()
    expect(sse.clientSignal.aborted).toBe(true)
  })
})

describe("ZenkaiCoreServer · Fase 5", () => {
  test("GET /v1/models devuelve providers registrados", async () => {
    const o = new ProviderOrchestrator()
    o.register(fake("p1"))
    o.register(fake("p2"))
    const server = crearZenkaiCoreServer(o)
    const r = await server.handle(new Request("http://x/v1/models"))
    expect(r.status).toBe(200)
    const j = (await r.json()) as { data: Array<{ id: string }> }
    expect(j.data.some((m) => m.id === "auto")).toBe(true)
    expect(j.data.some((m) => m.id === "p1")).toBe(true)
    expect(j.data.some((m) => m.id === "p2")).toBe(true)
  })

  test("GET /v1/health devuelve engine zenkai-core", async () => {
    const o = new ProviderOrchestrator()
    o.register(fake("p1"))
    const server = crearZenkaiCoreServer(o)
    const r = await server.handle(new Request("http://x/v1/health"))
    expect(r.status).toBe(200)
    const j = (await r.json()) as { engine: string }
    expect(j.engine).toBe("zenkai-core")
  })

  test("POST /v1/chat/completions non-streaming", async () => {
    const o = new ProviderOrchestrator()
    o.register(fake("p1", "respuesta ok"))
    const server = crearZenkaiCoreServer(o)
    const r = await server.handle(new Request("http://x/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "x", messages: [], stream: false }),
    }))
    expect(r.status).toBe(200)
    const j = (await r.json()) as { choices: Array<{ message: { content: string } }>; provider: string }
    expect(j.choices[0]!.message.content).toBe("respuesta ok")
    expect(j.provider).toBe("p1")
  })

  test("POST /v1/chat/completions streaming SSE", async () => {
    const o = new ProviderOrchestrator()
    o.register(fake("p1"))
    const server = crearZenkaiCoreServer(o)
    const r = await server.handle(new Request("http://x/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "x", messages: [], stream: true }),
    }))
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toContain("text/event-stream")
    expect(r.headers.get("x-zenkai-engine")).toBe("core")
    const body = await r.text()
    expect(body).toContain("hola ")
    expect(body).toContain("mundo")
    expect(body).toContain("[DONE]")
  })

  test("404 en rutas desconocidas", async () => {
    const server = crearZenkaiCoreServer(new ProviderOrchestrator())
    const r = await server.handle(new Request("http://x/otra-cosa"))
    expect(r.status).toBe(404)
  })
})
