import { describe, expect, test } from "bun:test"
import { ProviderOrchestrator } from "../src/provider/orchestrator.ts"
import type { Provider, ChatRequest, ChatResponse } from "../src/provider/types.ts"

function fakeProvider(name: string, opts: {
  latencyMs?: number
  fail?: boolean
  content?: string
  region?: "local" | "us" | "eu"
  costPer1MInput?: number
  costPer1MOutput?: number
} = {}): Provider {
  return {
    meta: {
      name,
      kind: "openai-compat",
      baseURL: "http://fake",
      supportsTools: true,
      supportsStream: true,
      region: opts.region ?? "us",
      costPer1MInput: opts.costPer1MInput,
      costPer1MOutput: opts.costPer1MOutput,
    },
    chat: async (_req: ChatRequest): Promise<ChatResponse> => {
      if (opts.latencyMs) await Bun.sleep(opts.latencyMs)
      if (opts.fail) throw new Error(`fake ${name} boom`)
      return {
        provider: name,
        model: "fake-model",
        content: opts.content ?? `hola desde ${name}`,
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          costUsd:
            ((opts.costPer1MInput ?? 0) * 10) / 1_000_000 +
            ((opts.costPer1MOutput ?? 0) * 20) / 1_000_000,
        },
        finishReason: "stop",
        latencyMs: opts.latencyMs ?? 0,
      }
    },
  }
}

describe("ProviderOrchestrator · Fase 4", () => {
  test("chat básico", async () => {
    const o = new ProviderOrchestrator()
    o.register(fakeProvider("p1"))
    const r = await o.chat({ model: "x", messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }], createdAt: 0 }] })
    expect(r.content).toBe("hola desde p1")
    expect(r.provider).toBe("p1")
  })

  test("failover: si p1 falla, va a p2", async () => {
    const o = new ProviderOrchestrator()
    o.register(fakeProvider("p1", { fail: true }))
    o.register(fakeProvider("p2", { content: "backup ok" }))
    const r = await o.chat({ model: "x", messages: [] })
    expect(r.provider).toBe("p2")
    expect(r.content).toBe("backup ok")
  })

  test("todos fallan → error", async () => {
    const o = new ProviderOrchestrator()
    o.register(fakeProvider("a", { fail: true }))
    o.register(fakeProvider("b", { fail: true }))
    await expect(o.chat({ model: "x", messages: [] })).rejects.toThrow()
  })

  test("región preferida ordena", async () => {
    const o = new ProviderOrchestrator({ regionPreferida: "local" })
    o.register(fakeProvider("cloud", { region: "us" }))
    o.register(fakeProvider("localone", { region: "local" }))
    const r = await o.chat({ model: "x", messages: [] })
    expect(r.provider).toBe("localone")
  })

  test("cost tracking suma correcto", async () => {
    const o = new ProviderOrchestrator()
    o.register(fakeProvider("p1", { costPer1MInput: 1000, costPer1MOutput: 2000 }))
    await o.chat({ model: "x", messages: [] })
    await o.chat({ model: "x", messages: [] })
    const s = o.getStats().find((x) => x.name === "p1")!
    // Cada call: (1000*10)/1M + (2000*20)/1M = 0.01 + 0.04 = 0.05 USD.
    // Dos calls = 0.10 USD.
    expect(s.totalCostUsd).toBeCloseTo(0.1, 4)
    expect(s.requests).toBe(2)
  })

  test("budget agotado → skipea", async () => {
    const o = new ProviderOrchestrator({ budgetsUsd: { p1: 0.03 } })
    o.register(fakeProvider("p1", { costPer1MInput: 1000, costPer1MOutput: 2000 }))
    o.register(fakeProvider("p2", { content: "backup" }))
    // Primera call gasta 0.05 → excede 0.03.
    await o.chat({ model: "x", messages: [] })
    // Segunda call debería ir a p2 porque p1 ya excedió budget.
    const r = await o.chat({ model: "x", messages: [] })
    expect(r.provider).toBe("p2")
  })

  test("cache: request cacheable devuelve fromCache la 2da vez", async () => {
    const o = new ProviderOrchestrator()
    o.register(fakeProvider("p1"))
    const req: ChatRequest = { model: "x", messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "cacheable" }], createdAt: 0 }], cacheable: true }
    const r1 = await o.chat(req)
    const r2 = await o.chat(req)
    expect(r1.fromCache).toBeUndefined()
    expect(r2.fromCache).toBe(true)
  })

  test("racing: gana el más rápido", async () => {
    const o = new ProviderOrchestrator()
    o.register(fakeProvider("lento", { latencyMs: 100, content: "L" }))
    o.register(fakeProvider("rapido", { latencyMs: 10, content: "R" }))
    const r = await o.chatRacing({ model: "x", messages: [] }, ["lento", "rapido"])
    expect(r.provider).toBe("rapido")
  })

  test("health score baja tras errores", async () => {
    const o = new ProviderOrchestrator()
    o.register(fakeProvider("p1", { fail: true }))
    o.register(fakeProvider("p2"))
    try { await o.chat({ model: "x", messages: [] }, ["p1"]) } catch { /* esperado */ }
    try { await o.chat({ model: "x", messages: [] }, ["p1"]) } catch { /* esperado */ }
    const s = o.getStats().find((x) => x.name === "p1")!
    expect(s.errors).toBe(2)
    expect(s.healthScore).toBe(0)
  })
})
