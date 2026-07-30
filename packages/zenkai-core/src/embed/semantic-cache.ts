import { cosineSim, type Embedder } from "./embedder"

// SemanticCache: cache que dedupliqua por SIMILITUD del contenido (embeddings),
// no por hash exacto. Con esto, dos requests "distintos pero equivalentes"
// comparten respuesta. Ejemplo: "resumime este PR" y "hacé un resumen del PR"
// hoy son cache-miss; con similitud coseno >= 0.92 son cache-hit.
//
// Falla graceful: si el embedder está caído, el put/get funcionan por hash
// exacto (fallback). Nunca rompe el flow.

export type SemanticCacheEntry<V> = {
  key: string
  embedding: number[] | null
  value: V
  at: number
}

export type SemanticCacheOptions = {
  embedder?: Embedder
  /** Umbral de similitud para hit semántico. Default 0.92. */
  threshold?: number
  /** TTL en ms. Default 5 min. */
  ttlMs?: number
  /** Máximo de entradas. LRU al superar. Default 500. */
  maxEntries?: number
}

export class SemanticCache<V> {
  private entries: SemanticCacheEntry<V>[] = []
  private opts: Required<Pick<SemanticCacheOptions, "threshold" | "ttlMs" | "maxEntries">> & { embedder?: Embedder }

  constructor(opts: SemanticCacheOptions = {}) {
    this.opts = {
      embedder: opts.embedder,
      threshold: opts.threshold ?? 0.92,
      ttlMs: opts.ttlMs ?? 5 * 60_000,
      maxEntries: opts.maxEntries ?? 500,
    }
  }

  async get(key: string): Promise<{ value: V; similarity: number; exactHit: boolean } | undefined> {
    this.podar()
    // 1. Hit exacto por key.
    const exact = this.entries.find((e) => e.key === key)
    if (exact) return { value: exact.value, similarity: 1, exactHit: true }

    // 2. Hit semántico si hay embedder disponible.
    if (!this.opts.embedder) return undefined
    const queryEmb = await this.opts.embedder.embed(key)
    if (!queryEmb) return undefined

    let bestSim = 0
    let best: SemanticCacheEntry<V> | undefined
    for (const e of this.entries) {
      if (!e.embedding) continue
      const sim = cosineSim(queryEmb, e.embedding)
      if (sim > bestSim) {
        bestSim = sim
        best = e
      }
    }
    if (best && bestSim >= this.opts.threshold) {
      return { value: best.value, similarity: bestSim, exactHit: false }
    }
    return undefined
  }

  async set(key: string, value: V): Promise<void> {
    // Removemos si ya existe (evitamos duplicados exactos).
    this.entries = this.entries.filter((e) => e.key !== key)
    const embedding = this.opts.embedder ? await this.opts.embedder.embed(key) : null
    this.entries.push({ key, embedding, value, at: Date.now() })
    // LRU: si superamos maxEntries, tiramos el más viejo.
    while (this.entries.length > this.opts.maxEntries) {
      this.entries.shift()
    }
  }

  size(): number {
    this.podar()
    return this.entries.length
  }

  clear(): void {
    this.entries = []
  }

  private podar(): void {
    const ahora = Date.now()
    this.entries = this.entries.filter((e) => ahora - e.at < this.opts.ttlMs)
  }
}
