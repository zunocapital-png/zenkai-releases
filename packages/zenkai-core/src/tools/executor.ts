import type { Tool, ToolContext, ToolInvocationResult, ToolMeta } from "./types.ts"

// ToolExecutor: registra tools, valida input, aplica rate limit, timeout, cache,
// y ejecuta. Todo con métricas para el Observability Center.

type CachedResult = { output: unknown; at: number }
type CallStamp = number[]

const CACHE_TTL_MS = 60_000 // 60s por default para resultados idempotentes

export class ToolExecutor {
  private tools = new Map<string, Tool>()
  private cache = new Map<string, CachedResult>()
  private calls = new Map<string, CallStamp>() // toolName -> timestamps (rolling)
  private metricas = new Map<string, { runs: number; ok: number; errors: number; totalMs: number }>()

  /** Registra una tool. Reemplaza si el nombre ya existe. */
  register<I, O>(tool: Tool<I, O>): void {
    this.tools.set(tool.meta.name, tool as Tool)
  }

  /** Lista de metas registradas (para el system prompt del agente). */
  listMetas(): ToolMeta[] {
    return Array.from(this.tools.values()).map((t) => t.meta)
  }

  hasTool(name: string): boolean {
    return this.tools.has(name)
  }

  /** Métricas de una tool específica. */
  getMetricas(name: string) {
    return this.metricas.get(name) ?? { runs: 0, ok: 0, errors: 0, totalMs: 0 }
  }

  /** Todas las métricas (para el Observability Center). */
  todasLasMetricas() {
    return Object.fromEntries(this.metricas.entries())
  }

  /** Ejecuta una tool con todas las salvaguardas. */
  async invoke<I = unknown, O = unknown>(
    name: string,
    input: I,
    opts: { signal?: AbortSignal; onProgress?: (msg: string, pct?: number) => void } = {},
  ): Promise<ToolInvocationResult<O>> {
    const t0 = Date.now()
    const tool = this.tools.get(name) as Tool<I, O> | undefined
    if (!tool) {
      return { ok: false, error: `Tool no registrada: ${name}`, durationMs: 0, type: "runtime" }
    }

    // 1. Validación de input.
    if (tool.validate) {
      const err = tool.validate(input)
      if (err) {
        this.trackError(name, Date.now() - t0)
        return { ok: false, error: `Input inválido: ${err}`, durationMs: Date.now() - t0, type: "validation" }
      }
    }

    // 2. Rate limit por minuto.
    if (tool.meta.rateLimitPorMin) {
      const ahora = Date.now()
      const ventana = 60_000
      const timestamps = (this.calls.get(name) ?? []).filter((ts) => ahora - ts < ventana)
      if (timestamps.length >= tool.meta.rateLimitPorMin) {
        this.trackError(name, 0)
        return {
          ok: false,
          error: `Rate limit alcanzado: ${tool.meta.rateLimitPorMin}/min para '${name}'`,
          durationMs: 0,
          type: "rate_limit",
        }
      }
      timestamps.push(ahora)
      this.calls.set(name, timestamps)
    }

    // 3. Cache idempotente.
    const cacheKey = tool.meta.idempotente ? `${name}::${JSON.stringify(input)}` : undefined
    if (cacheKey) {
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        this.trackOk(name, 0)
        return { ok: true, output: cached.output as O, durationMs: 0, fromCache: true }
      }
    }

    // 4. Timeout + AbortController combinado.
    const externalSignal = opts.signal
    const internalController = new AbortController()
    const timeoutMs = tool.meta.timeoutMs ?? 30_000
    const timer = setTimeout(() => internalController.abort(), timeoutMs)
    const composed = anySignal([externalSignal, internalController.signal])

    const ctx: ToolContext = {
      signal: composed,
      reportar: (msg, pct) => opts.onProgress?.(msg, pct),
    }

    // 5. Ejecución con captura de todos los errores.
    try {
      const output = await tool.run(input, ctx)
      const dur = Date.now() - t0
      if (cacheKey) this.cache.set(cacheKey, { output, at: Date.now() })
      this.trackOk(name, dur)
      return { ok: true, output, durationMs: dur }
    } catch (e) {
      const dur = Date.now() - t0
      const aborted = internalController.signal.aborted && !externalSignal?.aborted
      this.trackError(name, dur)
      if (aborted) return { ok: false, error: `Timeout tras ${timeoutMs}ms`, durationMs: dur, type: "timeout" }
      if (externalSignal?.aborted) return { ok: false, error: "Cancelado por el usuario", durationMs: dur, type: "aborted" }
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg, durationMs: dur, type: "runtime" }
    } finally {
      clearTimeout(timer)
    }
  }

  private trackOk(name: string, ms: number) {
    const m = this.metricas.get(name) ?? { runs: 0, ok: 0, errors: 0, totalMs: 0 }
    m.runs++
    m.ok++
    m.totalMs += ms
    this.metricas.set(name, m)
  }
  private trackError(name: string, ms: number) {
    const m = this.metricas.get(name) ?? { runs: 0, ok: 0, errors: 0, totalMs: 0 }
    m.runs++
    m.errors++
    m.totalMs += ms
    this.metricas.set(name, m)
  }
}

// Combina múltiples AbortSignals en uno solo. Se dispara cuando cualquiera de
// los inputs se aborta.
function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
  const c = new AbortController()
  const valid = signals.filter((s): s is AbortSignal => s !== undefined)
  for (const s of valid) {
    if (s.aborted) {
      c.abort()
      break
    }
    s.addEventListener("abort", () => c.abort(), { once: true })
  }
  return c.signal
}
