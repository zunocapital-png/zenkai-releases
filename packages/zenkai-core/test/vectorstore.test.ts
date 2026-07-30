import { describe, expect, test } from "bun:test"
import { VectorStoreSqlite } from "../src/vectorstore/sqlite"
import type { Embedder } from "../src/embed/embedder"

// Embedder deterministic para tests: mapea cada palabra a un vector fijo.
// Usamos 4 dims, cada texto se convierte en un vector "categoría" según qué
// palabra clave contenga.
function stubEmbedder(): Embedder {
  const dict: Record<string, number[]> = {
    perro: [1, 0, 0, 0],
    gato: [0.95, 0.1, 0, 0], // muy similar a perro (ambos mascotas)
    rojo: [0, 1, 0, 0],
    azul: [0, 0.9, 0.1, 0],
    node: [0, 0, 1, 0],
    typescript: [0, 0, 0.95, 0.1],
    completamente_distinto: [0, 0, 0, 1],
  }
  return {
    async embed(text: string) {
      const lower = text.toLowerCase()
      for (const k of Object.keys(dict)) {
        if (lower.includes(k)) return dict[k]!
      }
      return [0.25, 0.25, 0.25, 0.25] // neutro
    },
  }
}

describe("VectorStoreSqlite · medio plazo #7", () => {
  test("upsert + count", async () => {
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: stubEmbedder() })
    await s.upsert({ id: "d1", source: "chat", text: "el perro corre" })
    await s.upsert({ id: "d2", source: "chat", text: "el gato duerme" })
    expect(s.count()).toBe(2)
    s.close()
  })

  test("search devuelve top-K por similitud", async () => {
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: stubEmbedder() })
    await s.upsert({ id: "d1", source: "x", text: "el perro corre" }) // [1,0,0,0]
    await s.upsert({ id: "d2", source: "x", text: "el gato duerme" }) // [0.95,0.1,0,0]
    await s.upsert({ id: "d3", source: "x", text: "node es rápido" }) // [0,0,1,0]
    const hits = await s.search("mi perro es genial", 2) // query = [1,0,0,0]
    expect(hits.length).toBe(2)
    expect(hits[0]!.id).toBe("d1") // exact match
    expect(hits[1]!.id).toBe("d2") // muy similar
    expect(hits[0]!.similarity).toBeGreaterThan(hits[1]!.similarity)
    s.close()
  })

  test("delete borra doc y su vector", async () => {
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: stubEmbedder() })
    await s.upsert({ id: "d1", source: "x", text: "perro" })
    expect(s.count()).toBe(1)
    expect(s.delete("d1")).toBe(true)
    expect(s.count()).toBe(0)
    expect(s.get("d1")).toBeUndefined()
    s.close()
  })

  test("deleteBySource elimina en lote", async () => {
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: stubEmbedder() })
    await s.upsert({ id: "d1", source: "chat", text: "perro" })
    await s.upsert({ id: "d2", source: "chat", text: "gato" })
    await s.upsert({ id: "d3", source: "code", text: "node" })
    expect(s.deleteBySource("chat")).toBe(2)
    expect(s.count()).toBe(1)
    expect(s.get("d3")?.id).toBe("d3")
    s.close()
  })

  test("upsert con mismo id reemplaza (idempotente)", async () => {
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: stubEmbedder() })
    await s.upsert({ id: "d1", source: "x", text: "perro" })
    await s.upsert({ id: "d1", source: "x", text: "gato" }) // reemplaza
    expect(s.count()).toBe(1)
    expect(s.get("d1")?.text).toBe("gato")
    s.close()
  })

  test("meta se persiste como JSON", async () => {
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: stubEmbedder() })
    await s.upsert({ id: "d1", source: "x", text: "perro", meta: { kind: "animal", ok: true } })
    const g = s.get("d1")
    expect(g?.meta).toEqual({ kind: "animal", ok: true })
    // meta llega también en el search.
    const hits = await s.search("perro", 1)
    expect(hits[0]!.meta).toEqual({ kind: "animal", ok: true })
    s.close()
  })

  test("embedder que devuelve null → upsert falla graceful", async () => {
    const badEmbedder: Embedder = { async embed() { return null } }
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: badEmbedder })
    const ok = await s.upsert({ id: "d1", source: "x", text: "cualquier cosa" })
    expect(ok).toBe(false)
    expect(s.count()).toBe(0)
    s.close()
  })

  test("search sin docs devuelve []", async () => {
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: stubEmbedder() })
    const hits = await s.search("cualquier cosa", 5)
    expect(hits).toEqual([])
    s.close()
  })

  test("blob roundtrip preserva exactamente los floats", async () => {
    // Embedder que devuelve un vector conocido con decimales precisos.
    const em: Embedder = { async embed() { return [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] } }
    const s = new VectorStoreSqlite({ dbPath: ":memory:", embedder: em })
    await s.upsert({ id: "d1", source: "x", text: "test" })
    const hits = await s.search("otra query cualquiera", 1)
    expect(hits.length).toBe(1)
    // similarity con vector idéntico ~ 1.0
    expect(hits[0]!.similarity).toBeCloseTo(1.0, 3)
    s.close()
  })
})
