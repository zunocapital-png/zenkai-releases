import { describe, expect, test } from "bun:test"
import { ToolExecutor } from "../src/tools/executor.ts"
import type { Tool } from "../src/tools/types.ts"

const echoTool: Tool<{ msg: string }, { echoed: string }> = {
  meta: { name: "echo", description: "Devuelve lo que recibe", riesgo: "seguro", idempotente: true },
  run: async (input) => ({ echoed: input.msg }),
}

const slowTool: Tool<{ ms: number }, "hecho"> = {
  meta: { name: "slow", description: "Duerme N ms", riesgo: "seguro", timeoutMs: 200 },
  run: async (input, ctx) => {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, input.ms)
      ctx.signal.addEventListener("abort", () => {
        clearTimeout(t)
        reject(new Error("aborted"))
      })
    })
    return "hecho"
  },
}

const boomTool: Tool<undefined, never> = {
  meta: { name: "boom", description: "Explota", riesgo: "seguro" },
  run: async () => {
    throw new Error("kaboom")
  },
}

describe("ToolExecutor · Fase 2", () => {
  test("register + invoke básico", async () => {
    const ex = new ToolExecutor()
    ex.register(echoTool)
    const r = await ex.invoke("echo", { msg: "hola" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.output).toEqual({ echoed: "hola" })
  })

  test("tool inexistente", async () => {
    const ex = new ToolExecutor()
    const r = await ex.invoke("noexiste", {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.type).toBe("runtime")
      expect(r.error).toContain("no registrada")
    }
  })

  test("timeout dispara error tipo 'timeout'", async () => {
    const ex = new ToolExecutor()
    ex.register(slowTool)
    const r = await ex.invoke("slow", { ms: 500 }) // timeout es 200ms
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.type).toBe("timeout")
  })

  test("cancel externo (AbortController)", async () => {
    const ex = new ToolExecutor()
    ex.register(slowTool)
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 30)
    const r = await ex.invoke("slow", { ms: 100 }, { signal: ac.signal })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.type).toBe("aborted")
  })

  test("cache idempotente (misma input → segundo call fromCache)", async () => {
    const ex = new ToolExecutor()
    ex.register(echoTool)
    const r1 = await ex.invoke("echo", { msg: "cacheado" })
    const r2 = await ex.invoke("echo", { msg: "cacheado" })
    expect(r1.ok && r2.ok).toBe(true)
    if (r2.ok) expect(r2.fromCache).toBe(true)
  })

  test("rate limit dispara cuando se excede", async () => {
    const rateTool: Tool<undefined, "ok"> = {
      meta: { name: "rated", description: "test", riesgo: "seguro", rateLimitPorMin: 2 },
      run: async () => "ok",
    }
    const ex = new ToolExecutor()
    ex.register(rateTool)
    const a = await ex.invoke("rated", undefined)
    const b = await ex.invoke("rated", undefined)
    const c = await ex.invoke("rated", undefined)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(c.ok).toBe(false)
    if (!c.ok) expect(c.type).toBe("rate_limit")
  })

  test("error runtime se captura", async () => {
    const ex = new ToolExecutor()
    ex.register(boomTool)
    const r = await ex.invoke("boom", undefined)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.type).toBe("runtime")
      expect(r.error).toContain("kaboom")
    }
  })

  test("validación de input", async () => {
    const validado: Tool<{ n: number }, number> = {
      meta: { name: "cuadrado", description: "n al cuadrado", riesgo: "seguro" },
      validate: (i) => (typeof i.n === "number" ? undefined : "n debe ser number"),
      run: async (i) => i.n * i.n,
    }
    const ex = new ToolExecutor()
    ex.register(validado)
    const bad = await ex.invoke("cuadrado", { n: "hola" as unknown as number })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.type).toBe("validation")
    const good = await ex.invoke("cuadrado", { n: 5 })
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.output).toBe(25)
  })

  test("progress reporting", async () => {
    const msgs: string[] = []
    const progressTool: Tool<undefined, string> = {
      meta: { name: "progress", description: "reporta", riesgo: "seguro" },
      run: async (_, ctx) => {
        ctx.reportar("paso 1", 33)
        ctx.reportar("paso 2", 66)
        ctx.reportar("paso 3", 100)
        return "done"
      },
    }
    const ex = new ToolExecutor()
    ex.register(progressTool)
    await ex.invoke("progress", undefined, { onProgress: (m) => msgs.push(m) })
    expect(msgs).toEqual(["paso 1", "paso 2", "paso 3"])
  })

  test("métricas se acumulan", async () => {
    const ex = new ToolExecutor()
    ex.register(echoTool)
    ex.register(boomTool)
    await ex.invoke("echo", { msg: "a" })
    await ex.invoke("echo", { msg: "b" })
    await ex.invoke("boom", undefined)
    const echo = ex.getMetricas("echo")
    const boom = ex.getMetricas("boom")
    expect(echo.runs).toBe(2)
    expect(echo.ok).toBe(2)
    expect(boom.runs).toBe(1)
    expect(boom.errors).toBe(1)
  })
})
