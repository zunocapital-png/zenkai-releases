// Entry point de @zenkai/core.
// Fase 1: SessionStore + tipos base.
// Fase 2: ToolExecutor con timeout/cancel/rate-limit/cache/progress/metrics.
// Fase 3: tools reales (read/write/bash/grep) con mejoras propietarias.
export * from "./types/index.ts"
export { SessionStore } from "./session/store.ts"
export type { SessionStoreOptions } from "./session/store.ts"
export { ToolExecutor } from "./tools/executor.ts"
export type { Tool, ToolMeta, ToolContext, ToolInvocationResult, ToolRiesgo } from "./tools/types.ts"
export { readTool, writeTool, bashTool, grepTool, registrarBuiltins } from "./tools/index.ts"
export type {
  ReadInput, ReadOutput,
  WriteInput, WriteOutput,
  BashInput, BashOutput,
  GrepInput, GrepOutput, GrepMatch,
} from "./tools/index.ts"

// Fase 4: Provider adapter unificado + orchestrator con failover, cost tracking,
// health scores, adaptive timeout, racing, cache, budget.
export * from "./provider/index.ts"
