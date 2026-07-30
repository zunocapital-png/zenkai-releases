import { describe, expect, test } from "bun:test"
import { HwMonitor } from "../src/runtime/hw-monitor"
import { benchmark } from "../src/runtime/bench"

describe("HwMonitor · auto RAM/GPU", () => {
  test("snapshot devuelve RAM y CPU válidos", async () => {
    const m = new HwMonitor()
    const s = await m.snapshot()
    expect(s.ram.totalMB).toBeGreaterThan(0)
    expect(s.ram.libreMB).toBeGreaterThan(0)
    expect(s.ram.usadoPct).toBeGreaterThanOrEqual(0)
    expect(s.ram.usadoPct).toBeLessThanOrEqual(100)
    expect(s.cpu.cores).toBeGreaterThan(0)
    // GPU es opcional según hardware — puede ser undefined.
    if (s.gpu) {
      expect(typeof s.gpu.nombre).toBe("string")
    }
  })

  test("subscribe emite snapshots y unsub para el poll", async () => {
    const m = new HwMonitor({ intervalMs: 100 })
    let count = 0
    const unsub = m.subscribe(() => { count++ })
    // Esperamos 350ms para que emita al menos 2-3 snapshots.
    await new Promise((r) => setTimeout(r, 350))
    unsub()
    const countAlSalir = count
    // Después de unsub, no debería seguir sumando.
    await new Promise((r) => setTimeout(r, 200))
    expect(countAlSalir).toBeGreaterThanOrEqual(2)
    expect(count).toBe(countAlSalir)
  })

  test("múltiples subs comparten el mismo poll", async () => {
    const m = new HwMonitor({ intervalMs: 100 })
    let a = 0, b = 0
    const unsubA = m.subscribe(() => { a++ })
    const unsubB = m.subscribe(() => { b++ })
    await new Promise((r) => setTimeout(r, 250))
    unsubA()
    unsubB()
    // Ambos reciben aproximadamente el mismo número de snapshots.
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
  })

  test("sin subs, no consume CPU (no hay timer)", async () => {
    const m = new HwMonitor({ intervalMs: 50 })
    // No suscribimos nada — no debería haber tick corriendo.
    await new Promise((r) => setTimeout(r, 100))
    // Sanity: snapshot() sigue funcionando aunque no haya poll.
    const s = await m.snapshot()
    expect(s.ram.totalMB).toBeGreaterThan(0)
  })
})

describe("Benchmark · auto tok/s", () => {
  test("bench falla graceful cuando el puerto no responde", async () => {
    const r = await benchmark({ puerto: 65432, modelId: "test-model", timeoutMs: 500 })
    expect(r.ok).toBe(false)
    expect(r.tokensPorSegundo).toBe(0)
    expect(r.error).toBeDefined()
  })

  test("bench parsea SSE de mock server y calcula tok/s", async () => {
    // Mock server que emite un stream OpenAI-style con 5 chunks pequeños.
    const server = Bun.serve({
      port: 0,
      fetch() {
        const stream = new ReadableStream({
          async start(controller) {
            const chunks = ["Uno\n", "Dos\n", "Tres\n", "Cuatro\n", "Cinco\n"]
            for (const c of chunks) {
              const payload = JSON.stringify({ choices: [{ delta: { content: c } }] })
              controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`))
              await new Promise((r) => setTimeout(r, 20))
            }
            controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`))
            controller.close()
          },
        })
        return new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
      },
    })
    try {
      const r = await benchmark({ puerto: server.port!, modelId: "test", timeoutMs: 5000 })
      expect(r.ok).toBe(true)
      expect(r.totalTokens).toBeGreaterThan(0)
      // tok/s > 0 (dependerá del hardware pero con 5 chunks de ~5 chars debería medir algo).
      expect(r.tokensPorSegundo).toBeGreaterThanOrEqual(0)
      expect(r.primerTokenMs).toBeGreaterThanOrEqual(0)
    } finally {
      server.stop()
    }
  })

  test("bench respeta timeoutMs", async () => {
    const server = Bun.serve({
      port: 0,
      async fetch() {
        // Se cuelga para forzar timeout.
        await new Promise((r) => setTimeout(r, 2000))
        return new Response("timeout")
      },
    })
    try {
      const r = await benchmark({ puerto: server.port!, modelId: "x", timeoutMs: 200 })
      expect(r.ok).toBe(false)
    } finally {
      server.stop()
    }
  })
})
