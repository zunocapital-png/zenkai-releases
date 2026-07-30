import type { ChatChunk, ChatRequest, ChatResponse, Provider, ProviderStats } from "./types.ts"

// ProviderOrchestrator: capa sobre múltiples providers con las 10 mejoras del
// diseño de Fase 4. Es lo que sale del router zenkai — el UI habla acá, no con
// los providers directo.

type CachedResponse = { response: ChatResponse; at: number }

const CACHE_TTL_MS = 5 * 60_000
const P95_WINDOW = 20

export type OrchestratorOptions = {
  /** API keys por nombre de provider. */
  apiKeys?: Record<string, string>
  /** Presupuesto máximo en USD por provider. Al alcanzarlo, se saltea. */
  budgetsUsd?: Record<string, number>
  /** Región preferida (privacy-first). Los providers de OTRA región van al final. */
  regionPreferida?: string
  /** Timeout base en ms (se ajusta adaptativo por p95). */
  timeoutBaseMs?: number
}

export class ProviderOrchestrator {
  private providers = new Map<string, Provider>()
  private latencias = new Map<string, number[]>() // rolling window para p95
  private stats = new Map<string, ProviderStats>()
  private cache = new Map<string, CachedResponse>()
  private opts: OrchestratorOptions

  constructor(opts: OrchestratorOptions = {}) {
    this.opts = opts
  }

  register(p: Provider): void {
    this.providers.set(p.meta.name, p)
    this.stats.set(p.meta.name, {
      name: p.meta.name,
      requests: 0,
      errors: 0,
      totalLatencyMs: 0,
      totalCostUsd: 0,
      p95LatencyMs: 0,
      healthScore: 100,
      budgetSpentUsd: 0,
      budgetLimitUsd: this.opts.budgetsUsd?.[p.meta.name],
    })
  }

  /** Orden de intento según preferencia + health + región + budget. */
  private orderProviders(candidateNames?: string[]): Provider[] {
    const names = candidateNames ?? Array.from(this.providers.keys())
    const list = names.map((n) => this.providers.get(n)).filter((p): p is Provider => !!p)
    return list
      .filter((p) => {
        const s = this.stats.get(p.meta.name)!
        if (s.budgetLimitUsd && s.budgetSpentUsd >= s.budgetLimitUsd) return false // budget agotado
        return true
      })
      .sort((a, b) => {
        const sa = this.stats.get(a.meta.name)!
        const sb = this.stats.get(b.meta.name)!
        // Región preferida primero.
        const region = this.opts.regionPreferida
        if (region) {
          const ra = a.meta.region === region ? 0 : 1
          const rb = b.meta.region === region ? 0 : 1
          if (ra !== rb) return ra - rb
        }
        // Después por health desc.
        return sb.healthScore - sa.healthScore
      })
  }

  /** Chat con failover automático y todas las mejoras. */
  async chat(req: ChatRequest, candidateNames?: string[]): Promise<ChatResponse> {
    // 1. Cache lookup (si el request es cacheable).
    const cacheKey = req.cacheable ? this.claveCache(req) : undefined
    if (cacheKey) {
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return { ...cached.response, fromCache: true }
      }
    }

    const providers = this.orderProviders(candidateNames)
    if (providers.length === 0) {
      throw new Error("No hay providers disponibles (todos agotaron budget o no están registrados)")
    }

    let lastError: unknown
    for (const p of providers) {
      const apiKey = this.opts.apiKeys?.[p.meta.name]
      const timeout = this.adaptiveTimeout(p.meta.name)
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), timeout)
      try {
        const res = await p.chat(req, { signal: controller.signal, apiKey })
        clearTimeout(t)
        this.record(p.meta.name, res.latencyMs, res.usage?.costUsd ?? 0, false)
        if (cacheKey) this.cache.set(cacheKey, { response: res, at: Date.now() })
        return res
      } catch (e) {
        clearTimeout(t)
        this.record(p.meta.name, 0, 0, true)
        lastError = e
        // Sigue con el próximo provider (failover).
      }
    }
    throw new Error(`Todos los providers fallaron. Último error: ${String(lastError)}`)
  }

  /** Race: mismo prompt a N providers en paralelo, devuelve el más rápido. */
  async chatRacing(req: ChatRequest, candidateNames: string[]): Promise<ChatResponse> {
    const providers = this.orderProviders(candidateNames)
    if (providers.length === 0) throw new Error("Sin providers para racing")
    const controllers: AbortController[] = []
    const promesas = providers.map((p) => {
      const controller = new AbortController()
      controllers.push(controller)
      const apiKey = this.opts.apiKeys?.[p.meta.name]
      return p.chat(req, { signal: controller.signal, apiKey }).then((r) => {
        this.record(p.meta.name, r.latencyMs, r.usage?.costUsd ?? 0, false)
        return r
      }).catch((e) => {
        this.record(p.meta.name, 0, 0, true)
        throw e
      })
    })
    try {
      // Promise.any devuelve el primer resuelto (no importa el rechazado).
      const ganador = await Promise.any(promesas)
      // Cancelar el resto para no gastar en calls que ya no necesitamos.
      controllers.forEach((c) => c.abort())
      return ganador
    } catch (e) {
      throw new Error(`Todos los racers fallaron: ${String(e)}`)
    }
  }

  /** Streaming con failover y fallback mid-stream. */
  async *stream(req: ChatRequest, candidateNames?: string[]): AsyncIterable<ChatChunk> {
    const providers = this.orderProviders(candidateNames).filter((p) => !!p.stream)
    if (providers.length === 0) {
      yield { type: "error", error: "Ningún provider soporta streaming" }
      return
    }
    for (const p of providers) {
      const apiKey = this.opts.apiKeys?.[p.meta.name]
      const controller = new AbortController()
      const timeout = this.adaptiveTimeout(p.meta.name)
      const t = setTimeout(() => controller.abort(), timeout)
      const t0 = Date.now()
      let cerroOk = false
      let costo = 0
      try {
        const iter = p.stream!(req, { signal: controller.signal, apiKey })
        for await (const chunk of iter) {
          if (chunk.type === "done" && chunk.usage) costo = chunk.usage.costUsd
          yield chunk
          if (chunk.type === "done" || chunk.type === "error") break
        }
        clearTimeout(t)
        this.record(p.meta.name, Date.now() - t0, costo, false)
        cerroOk = true
        return
      } catch (e) {
        clearTimeout(t)
        this.record(p.meta.name, Date.now() - t0, 0, true)
        // Si es el último, propagamos error final. Si hay otro provider,
        // seguimos con failover mid-stream.
        if (!cerroOk && p === providers[providers.length - 1]) {
          yield { type: "error", error: String(e) }
        }
      }
    }
  }

  /** Snapshot de estadísticas — para el Observability Center. */
  getStats(): ProviderStats[] {
    return Array.from(this.stats.values())
  }

  private adaptiveTimeout(name: string): number {
    const base = this.opts.timeoutBaseMs ?? 30_000
    const lats = this.latencias.get(name) ?? []
    if (lats.length < 5) return base
    // p95 aprox: sort + slice.
    const sorted = [...lats].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? base
    // Timeout = 3× p95, con piso de base y techo de 5min.
    return Math.max(base, Math.min(p95 * 3, 5 * 60_000))
  }

  private record(name: string, latencyMs: number, costUsd: number, error: boolean): void {
    const s = this.stats.get(name)!
    s.requests++
    if (error) s.errors++
    s.totalLatencyMs += latencyMs
    s.totalCostUsd += costUsd
    s.budgetSpentUsd += costUsd
    // Rolling latency window.
    const lats = this.latencias.get(name) ?? []
    lats.push(latencyMs)
    while (lats.length > P95_WINDOW) lats.shift()
    this.latencias.set(name, lats)
    const sorted = [...lats].sort((a, b) => a - b)
    s.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    // Health score: 100 - (error rate × 100), clamp [0,100].
    const rate = s.requests > 0 ? s.errors / s.requests : 0
    s.healthScore = Math.max(0, Math.round(100 - rate * 100))
  }

  private claveCache(req: ChatRequest): string {
    return JSON.stringify({ m: req.model, msgs: req.messages, t: req.temperature })
  }
}
