import type { ChatFn } from "../harness/reflector"
import type { Message } from "../types/index"

// Variaciones — probá el mismo prompt con N configuraciones distintas y
// compará outputs. Es la "prueba real automatizada" que respondí como
// pendiente: te permite iterar prompts contra tu modelo sin escribirlos
// a mano cada vez.
//
// Casos de uso:
//   - "¿este prompt anda igual con Qwen 7B y Qwen 32B?"
//   - "¿cambia si subo temperature de 0.3 a 0.7?"
//   - "¿de estas 3 formulaciones cuál produce el JSON más consistente?"

export type Variacion = {
  id: string
  prompt: string
  modelo?: string
  temperature?: number
  systemPrompt?: string
  candidateProviders?: string[]
}

export type ResultadoVariacion = {
  variacion: Variacion
  contenido: string
  ok: boolean
  error?: string
  latencyMs: number
  tokens?: { input: number; output: number }
  provider?: string
  model?: string
}

export type CompararOpts = {
  modeloDefault: string
  chat: ChatFn
  /** Ejecuciones por variación — sirve para medir consistencia. Default 1. */
  ejecucionesPorVariacion?: number
}

/** Corre todas las variaciones en paralelo y devuelve resultados. */
export async function correrVariaciones(
  variaciones: Variacion[],
  opts: CompararOpts,
): Promise<ResultadoVariacion[][]> {
  const N = opts.ejecucionesPorVariacion ?? 1
  const resultados = await Promise.all(
    variaciones.map(async (v) => {
      const ejecs: ResultadoVariacion[] = []
      for (let i = 0; i < N; i++) ejecs.push(await ejecutarUna(v, opts))
      return ejecs
    }),
  )
  return resultados
}

async function ejecutarUna(v: Variacion, opts: CompararOpts): Promise<ResultadoVariacion> {
  const t0 = Date.now()
  const model = v.modelo ?? opts.modeloDefault
  const messages: Message[] = []
  if (v.systemPrompt) messages.push({ id: "s", role: "system", parts: [{ type: "text", text: v.systemPrompt }], createdAt: 0 })
  messages.push({ id: "u", role: "user", parts: [{ type: "text", text: v.prompt }], createdAt: 0 })
  try {
    const res = await opts.chat({ model, messages, temperature: v.temperature ?? 0.7, cacheable: false }, v.candidateProviders)
    return {
      variacion: v,
      contenido: res.content,
      ok: true,
      latencyMs: Date.now() - t0,
      tokens: res.usage ? { input: res.usage.inputTokens, output: res.usage.outputTokens } : undefined,
      provider: res.provider,
      model: res.model,
    }
  } catch (e) {
    return {
      variacion: v,
      contenido: "",
      ok: false,
      error: String((e as Error).message),
      latencyMs: Date.now() - t0,
    }
  }
}

/**
 * Métrica de consistencia — si corriste N veces la misma variación,
 * devuelve % de outputs idénticos (útil para saber si el modelo es determinístico
 * con esos params).
 */
export function medirConsistencia(ejecs: ResultadoVariacion[]): {
  identicos: number
  total: number
  pct: number
  outputMasComun?: string
} {
  const okEjecs = ejecs.filter((e) => e.ok)
  if (okEjecs.length === 0) return { identicos: 0, total: 0, pct: 0 }
  const cuenta = new Map<string, number>()
  for (const e of okEjecs) {
    const k = e.contenido.trim()
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  const [outputMasComun, identicos] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]!
  return {
    identicos,
    total: okEjecs.length,
    pct: Math.round((identicos / okEjecs.length) * 100),
    outputMasComun,
  }
}

/**
 * Diff simple entre dos outputs — cuenta líneas distintas.
 * Sirve para "cuál variación es más parecida al output esperado".
 */
export function distanciaOutputs(a: string, b: string): number {
  const lA = new Set(a.split("\n").map((l) => l.trim()))
  const lB = new Set(b.split("\n").map((l) => l.trim()))
  let dist = 0
  for (const l of lA) if (!lB.has(l)) dist++
  for (const l of lB) if (!lA.has(l)) dist++
  return dist
}

/**
 * Reporte resumen — la UI lo pinta como tabla comparativa.
 */
export function resumirComparacion(resultados: ResultadoVariacion[][]): {
  variacion: string
  latenciaPromedio: number
  ok: boolean
  outputSample: string
  consistencia?: number
}[] {
  return resultados.map((ejecs) => {
    const consist = medirConsistencia(ejecs)
    const okEjecs = ejecs.filter((e) => e.ok)
    const latenciaPromedio = okEjecs.length > 0
      ? Math.round(okEjecs.reduce((sum, e) => sum + e.latencyMs, 0) / okEjecs.length)
      : 0
    return {
      variacion: ejecs[0]!.variacion.id,
      latenciaPromedio,
      ok: okEjecs.length > 0,
      outputSample: okEjecs[0]?.contenido.slice(0, 200) ?? ejecs[0]!.error ?? "",
      consistencia: ejecs.length > 1 ? consist.pct : undefined,
    }
  })
}
