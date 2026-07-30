// Entry point de @zenkai/core.
// Fase 1: SessionStore + tipos base.
// Fase 2: ToolExecutor con timeout/cancel/rate-limit/cache/progress/metrics.
// Fase 3: tools reales (read/write/bash/grep) con mejoras propietarias.
export * from "./types/index"
export { SessionStore } from "./session/store"
export type { SessionStoreOptions } from "./session/store"
export { ToolExecutor } from "./tools/executor"
export type { Tool, ToolMeta, ToolContext, ToolInvocationResult, ToolRiesgo } from "./tools/types"
export { readTool, writeTool, bashTool, grepTool, registrarBuiltins } from "./tools/index"
export type {
  ReadInput, ReadOutput,
  WriteInput, WriteOutput,
  BashInput, BashOutput,
  GrepInput, GrepOutput, GrepMatch,
} from "./tools/index"

// Fase 4: Provider adapter unificado + orchestrator con failover, cost tracking,
// health scores, adaptive timeout, racing, cache, budget.
export * from "./provider/index"

// Fase 5: server OpenAI-compatible + streaming SSE con backpressure, heartbeat,
// event IDs para reconnect, cancel bidireccional, metadata inline.
export * from "./server/index"

// Post-100% #1: Semantic cache con embeddings (dedup por similitud coseno).
export * from "./embed/index"

// Post-100% #2: Auto-repair loop harness (test fail → hipótesis → fix → retest).
export * from "./harness/index"
