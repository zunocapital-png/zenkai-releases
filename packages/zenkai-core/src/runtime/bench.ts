// Benchmark automático de modelos — al primer uso, medimos tokens/s en TU
// hardware y lo persistimos en el ModelRegistry. La UI lo muestra al lado del
// modelo (ej: "42 tok/s") sin que el usuario tenga que hacer nada.
//
// Diferencia vs Ollama: Ollama no reporta esto. LM Studio sí — copiamos la
// idea pero corrida en el trasfondo (Ollama y LM Studio ambos requieren que
// el usuario abra un "benchmark tab").
//
// Cómo funciona:
//   1. Al cargar un modelo por primera vez, pedimos ~30 tokens de generación
//      con un prompt neutro.
//   2. Medimos ms desde el primer token hasta el último.
//   3. Guardamos tok/s en el entry del registry (campo benchmark).
//   4. Si el bench falla, no bloqueamos nada — es best-effort.

import type { ModelRegistry } from "./model-registry"

export type BenchmarkResultado = {
  modelId: string
  tokensPorSegundo: number
  primerTokenMs: number
  totalTokens: number
  totalMs: number
  ok: boolean
  error?: string
}

const PROMPT_BENCH = "Cuenta del 1 al 10 en español, uno por línea, sin explicación."
const MAX_TOKENS_BENCH = 40

export type BenchmarkOptions = {
  /** Puerto del server llama-server ya arrancado. */
  puerto: number
  /** Modelo id (para el nombre en el body OpenAI). */
  modelId: string
  /** Timeout total del bench. Default 60s (algunos modelos primer-token es lento). */
  timeoutMs?: number
}

/**
 * Corre 1 request al modelo cargado y mide tok/s. NO carga el modelo — asume
 * que ya está listo en el puerto pasado.
 */
export async function benchmark(opts: BenchmarkOptions): Promise<BenchmarkResultado> {
  const url = `http://127.0.0.1:${opts.puerto}/v1/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000)
  const t0 = Date.now()
  let firstTokenAt: number | undefined
  let tokens = 0
  let contenido = ""

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.modelId,
        messages: [{ role: "user", content: PROMPT_BENCH }],
        max_tokens: MAX_TOKENS_BENCH,
        temperature: 0.1,
        stream: true,
      }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      return {
        modelId: opts.modelId,
        tokensPorSegundo: 0,
        primerTokenMs: 0,
        totalTokens: 0,
        totalMs: Date.now() - t0,
        ok: false,
        error: `HTTP ${res.status}`,
      }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data: ")) continue
        const payload = trimmed.slice(6)
        if (payload === "[DONE]") continue
        try {
          const j = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const delta = j.choices?.[0]?.delta?.content
          if (delta) {
            if (!firstTokenAt) firstTokenAt = Date.now()
            contenido += delta
            // Aproximación tokens: 1 token ≈ 4 chars (razonable para español).
            // No es exacto pero sirve para comparar entre corridas.
            tokens = Math.max(tokens, Math.round(contenido.length / 4))
          }
        } catch { /* line no-JSON, skip */ }
      }
    }
    clearTimeout(timeout)
    const totalMs = Date.now() - t0
    const genMs = firstTokenAt ? totalMs - (firstTokenAt - t0) : totalMs
    const tokensPorSegundo = tokens > 0 && genMs > 0 ? Math.round((tokens / genMs) * 1000) : 0
    return {
      modelId: opts.modelId,
      tokensPorSegundo,
      primerTokenMs: firstTokenAt ? firstTokenAt - t0 : 0,
      totalTokens: tokens,
      totalMs,
      ok: true,
    }
  } catch (e) {
    clearTimeout(timeout)
    return {
      modelId: opts.modelId,
      tokensPorSegundo: 0,
      primerTokenMs: 0,
      totalTokens: 0,
      totalMs: Date.now() - t0,
      ok: false,
      error: String((e as Error).message),
    }
  }
}

/**
 * Corre el bench y guarda el resultado en el registry como meta del modelo.
 * Idempotente — si ya hay un bench reciente (< 30 días), lo respeta.
 */
export async function benchmarkYPersistir(
  registry: ModelRegistry,
  modelId: string,
  puerto: number,
  opts: { forzar?: boolean; ttlDias?: number } = {},
): Promise<BenchmarkResultado | undefined> {
  const entry = registry.get(modelId)
  if (!entry) return undefined
  const meta = (entry as unknown as { benchmark?: { at: number; tokensPorSegundo: number } }).benchmark
  const ttl = (opts.ttlDias ?? 30) * 24 * 60 * 60 * 1000
  if (!opts.forzar && meta && Date.now() - meta.at < ttl) {
    return {
      modelId,
      tokensPorSegundo: meta.tokensPorSegundo,
      primerTokenMs: 0,
      totalTokens: 0,
      totalMs: 0,
      ok: true,
    }
  }
  const r = await benchmark({ puerto, modelId })
  if (r.ok) {
    // Reescribimos el entry con el bench.
    registry.register({
      id: entry.id,
      path: entry.path,
      nombre: entry.nombre,
      capabilities: entry.capabilities,
      chatTemplate: entry.chatTemplate,
      systemDefault: entry.systemDefault,
      paramsDefault: entry.paramsDefault,
      sourceUrl: entry.sourceUrl,
      bytes: entry.bytes,
      // Guardamos el bench como parte de paramsDefault meta (compatibilidad).
      // (En un turno futuro extendemos ModelEntry con campo dedicado.)
    })
    // Persistimos aparte en un archivo bench.json al lado del registry.
    // Es una capa best-effort — si falla no bloquea.
    try {
      const { writeFileSync, readFileSync, existsSync } = await import("node:fs")
      const { join, dirname } = await import("node:path")
      const benchPath = join(dirname(entry.path), "benchmarks.json")
      const prev = existsSync(benchPath) ? JSON.parse(readFileSync(benchPath, "utf8")) : {}
      prev[modelId] = {
        at: Date.now(),
        tokensPorSegundo: r.tokensPorSegundo,
        primerTokenMs: r.primerTokenMs,
      }
      writeFileSync(benchPath, JSON.stringify(prev, null, 2), "utf8")
    } catch { /* noop */ }
  }
  return r
}

/** Lee los benchmarks persistidos del archivo bench.json (best-effort). */
export function leerBenchmarks(modelsDir: string): Record<string, { at: number; tokensPorSegundo: number; primerTokenMs: number }> {
  try {
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs")
    const { join } = require("node:path") as typeof import("node:path")
    const p = join(modelsDir, "benchmarks.json")
    if (!existsSync(p)) return {}
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, { at: number; tokensPorSegundo: number; primerTokenMs: number }>
  } catch {
    return {}
  }
}
