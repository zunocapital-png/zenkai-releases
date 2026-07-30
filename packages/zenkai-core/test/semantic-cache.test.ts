import { describe, expect, test } from "bun:test"
import { cosineSim } from "../src/embed/embedder"
import { SemanticCache } from "../src/embed/semantic-cache"
import type { Embedder } from "../src/embed/embedder"

/** Embedder fake determinístico: cuenta caracteres únicos como vector. */
function fakeEmbedder(): Embedder {
  return {
    embed: async (text: string) => {
      const vec = new Array(26).fill(0) as number[]
      for (const ch of text.toLowerCase()) {
        const i = ch.charCodeAt(0) - 97
        if (i >= 0 && i < 26) vec[i]!++
      }
      return vec
    },
  }
}

/** Embedder que siempre devuelve null (simula Ollama caído). */
function embedderRoto(): Embedder {
  return { embed: async () => null }
}

describe("cosineSim", () => {
  test("mismo vector = 1", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
  })
  test("vectores ortogonales = 0", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })
  test("dims distintas = 0", () => {
    expect(cosineSim([1, 2], [1, 2, 3])).toBe(0)
  })
})

describe("SemanticCache", () => {
  test("hit exacto por key", async () => {
    const c = new SemanticCache<string>({ embedder: fakeEmbedder() })
    await c.set("hola", "respuesta hola")
    const r = await c.get("hola")
    expect(r).toBeDefined()
    expect(r!.value).toBe("respuesta hola")
    expect(r!.exactHit).toBe(true)
    expect(r!.similarity).toBe(1)
  })

  test("hit semántico por similitud alta", async () => {
    const c = new SemanticCache<string>({ embedder: fakeEmbedder(), threshold: 0.9 })
    await c.set("hola mundo", "saludo")
    const r = await c.get("hola mundos") // similar en composición de letras
    expect(r).toBeDefined()
    expect(r!.exactHit).toBe(false)
    expect(r!.similarity).toBeGreaterThan(0.9)
  })

  test("miss cuando similitud es baja", async () => {
    const c = new SemanticCache<string>({ embedder: fakeEmbedder(), threshold: 0.99 })
    await c.set("aaaa", "A")
    const r = await c.get("zzzz")
    expect(r).toBeUndefined()
  })

  test("fallback: sin embedder solo hit exacto", async () => {
    const c = new SemanticCache<string>()
    await c.set("k", "v")
    expect((await c.get("k"))?.value).toBe("v")
    expect(await c.get("k2")).toBeUndefined()
  })

  test("embedder roto: hit exacto sigue funcionando", async () => {
    const c = new SemanticCache<string>({ embedder: embedderRoto() })
    await c.set("hola", "respuesta")
    expect((await c.get("hola"))?.value).toBe("respuesta")
    expect(await c.get("chau")).toBeUndefined()
  })

  test("TTL: entrada vencida se ignora", async () => {
    const c = new SemanticCache<string>({ ttlMs: 30 })
    await c.set("k", "v")
    await Bun.sleep(50)
    expect(await c.get("k")).toBeUndefined()
    expect(c.size()).toBe(0)
  })

  test("LRU: max entries respetado", async () => {
    const c = new SemanticCache<string>({ maxEntries: 2 })
    await c.set("a", "A")
    await c.set("b", "B")
    await c.set("c", "C")
    expect(c.size()).toBe(2)
    expect(await c.get("a")).toBeUndefined()
    expect((await c.get("c"))?.value).toBe("C")
  })

  test("set duplicado reemplaza", async () => {
    const c = new SemanticCache<string>()
    await c.set("k", "v1")
    await c.set("k", "v2")
    expect(c.size()).toBe(1)
    expect((await c.get("k"))?.value).toBe("v2")
  })

  test("clear vacía todo", async () => {
    const c = new SemanticCache<string>()
    await c.set("a", "A")
    await c.set("b", "B")
    c.clear()
    expect(c.size()).toBe(0)
  })
})
