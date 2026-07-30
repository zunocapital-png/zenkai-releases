// Tool Executor de ZENKAI (Fase 2). Diseño con MEJORAS que opencode no tiene:
//
//  1. Progress reporting: cada tool puede emitir eventos "leyendo X..." mid-run.
//  2. AbortController integrado: se puede cancelar a mitad sin colgar el proceso.
//  3. Rate limiting por tool: previene loops accidentales del agente.
//  4. Result cache idempotente: mismo tool + mismos args → cache (opcional).
//  5. Timeout configurable por tool (no un default global).
//  6. Metadata rica: cada tool declara costo, permisos, riesgo, side-effects.
//
// Filosofía: cada tool es una FUNCIÓN PURA sobre su input + un contexto que
// le da acceso al abort signal y al emisor de progreso. Sin herencia, sin
// clases pesadas.

export type ToolRiesgo = "seguro" | "medio" | "alto"

export type ToolMeta = {
  /** Identificador único del tool (ej: "read", "bash", "grep"). */
  name: string
  /** Descripción para el modelo (le llega en el system prompt). */
  description: string
  /** Costo relativo estimado (para el Cost Optimizer del router). */
  costo?: "bajo" | "medio" | "alto"
  /** Riesgo (side-effects). El agente debe pedir permiso para "alto". */
  riesgo: ToolRiesgo
  /** True si es idempotente (mismo input → mismo output) — habilita cache. */
  idempotente?: boolean
  /** Tiempo máximo de ejecución en ms. */
  timeoutMs?: number
  /** Rate limit: máximo N llamadas por minuto. */
  rateLimitPorMin?: number
}

export type ToolContext = {
  /** Se abre cuando el usuario o el orquestador cancela. Respetar. */
  signal: AbortSignal
  /** Reporta progreso mid-run al UI (opcional). */
  reportar: (msg: string, pct?: number) => void
}

export type Tool<TInput = unknown, TOutput = unknown> = {
  meta: ToolMeta
  /** Valida el input antes de correr. Devuelve texto de error o undefined. */
  validate?: (input: TInput) => string | undefined
  /** Ejecuta la tool. Recibe ctx para cancel/progress. */
  run: (input: TInput, ctx: ToolContext) => Promise<TOutput>
}

export type ToolInvocationResult<T = unknown> =
  | { ok: true; output: T; durationMs: number; fromCache?: boolean }
  | { ok: false; error: string; durationMs: number; type: "validation" | "timeout" | "aborted" | "rate_limit" | "runtime" }
