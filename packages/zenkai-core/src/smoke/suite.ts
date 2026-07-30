// Smoke test suite — dogfooding automatizado.
// Corre endpoints reales de la app y reporta OK/FAIL. Es lo que respondí
// como "hace falta rodaje real" en el análisis — este módulo cierra ese
// gap automatizando la verificación end-to-end.
//
// Ejecutable desde la app (dialog /smoke) o desde CLI para CI/CD.

export type SmokeCheck = {
  id: string
  descripcion: string
  ejecutar: () => Promise<{ ok: boolean; detalle?: string; ms?: number }>
}

export type SmokeResultado = {
  check: SmokeCheck
  ok: boolean
  detalle?: string
  ms: number
}

export type SmokeReporte = {
  totalOk: number
  totalFail: number
  duracionMs: number
  resultados: SmokeResultado[]
}

export type SuiteOpts = {
  baseUrl?: string
  fetchFn?: typeof fetch
  /** Timeout por check (ms). Default 15s. */
  timeoutMs?: number
}

/** Corre todos los checks en paralelo y devuelve reporte. */
export async function correrSmoke(checks: SmokeCheck[]): Promise<SmokeReporte> {
  const t0 = Date.now()
  const resultados = await Promise.all(
    checks.map(async (check): Promise<SmokeResultado> => {
      const t1 = Date.now()
      try {
        const r = await check.ejecutar()
        return { check, ok: r.ok, detalle: r.detalle, ms: r.ms ?? Date.now() - t1 }
      } catch (e) {
        return { check, ok: false, detalle: String((e as Error).message), ms: Date.now() - t1 }
      }
    }),
  )
  const totalOk = resultados.filter((r) => r.ok).length
  return {
    totalOk,
    totalFail: resultados.length - totalOk,
    duracionMs: Date.now() - t0,
    resultados,
  }
}

/**
 * Suite predefinida contra los endpoints /v2/* del router local.
 * Cubre TODOS los endpoints con requests que no rompen nada (GET + valores neutros).
 */
export function crearSuiteZenkai(opts: SuiteOpts = {}): SmokeCheck[] {
  const base = opts.baseUrl ?? "http://localhost:20128"
  const fetchFn = opts.fetchFn ?? fetch
  const timeoutMs = opts.timeoutMs ?? 15_000

  const get = (path: string) => async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const r = await fetchFn(`${base}${path}`, { signal: controller.signal })
      clearTimeout(timer)
      return { ok: r.ok, detalle: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status} ${await r.text().catch(() => "")}` }
    } catch (e) {
      clearTimeout(timer)
      return { ok: false, detalle: (e as Error).message }
    }
  }

  return [
    { id: "health", descripcion: "GET /health responde 200", ejecutar: get("/") },
    { id: "v1-models", descripcion: "GET /v1/models lista modelos", ejecutar: get("/v1/models") },
    { id: "v1-health", descripcion: "GET /v1/health muestra estado breaker", ejecutar: get("/v1/health") },
    { id: "v2-hw", descripcion: "GET /v2/hw snapshot RAM/CPU/GPU", ejecutar: get("/v2/hw") },
    { id: "v2-engine-status", descripcion: "GET /v2/engine/status status engine", ejecutar: get("/v2/engine/status") },
    { id: "v2-engine-models", descripcion: "GET /v2/engine/models catálogo + instalados", ejecutar: get("/v2/engine/models") },
    { id: "v2-engine-benchmarks", descripcion: "GET /v2/engine/benchmarks tok/s persistidos", ejecutar: get("/v2/engine/benchmarks") },
    { id: "v2-engine-diagnostico", descripcion: "GET /v2/engine/diagnostico recomendaciones HW", ejecutar: get("/v2/engine/diagnostico") },
    { id: "v2-tts-status", descripcion: "GET /v2/tts/status disponibilidad Piper + voces", ejecutar: get("/v2/tts/status") },
    { id: "v2-docker-status", descripcion: "GET /v2/docker/status disponibilidad Docker", ejecutar: get("/v2/docker/status") },
    { id: "v2-train-gpu", descripcion: "GET /v2/train/gpu detección GPU", ejecutar: get("/v2/train/gpu") },
    { id: "v2-ollama-status", descripcion: "GET /v2/ollama/status estado importer opcional", ejecutar: get("/v2/ollama/status") },
  ]
}

/**
 * Reporte legible en texto — la UI lo muestra pero también sirve como log.
 */
export function reporteATexto(reporte: SmokeReporte): string {
  const lineas: string[] = [
    `Smoke suite — ${reporte.totalOk}/${reporte.totalOk + reporte.totalFail} pasan (${reporte.duracionMs}ms)`,
    "",
  ]
  for (const r of reporte.resultados) {
    const icon = r.ok ? "✓" : "✗"
    lineas.push(`  ${icon} ${r.check.id.padEnd(28)} ${r.ms}ms  ${r.detalle ?? ""}`)
  }
  if (reporte.totalFail > 0) {
    lineas.push("")
    lineas.push(`FAIL en ${reporte.totalFail} checks — revisá si el router está corriendo (localhost:20128).`)
  }
  return lineas.join("\n")
}
