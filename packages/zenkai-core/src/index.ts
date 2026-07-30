// Entry point de @zenkai/core.
// Fase 1: SessionStore + tipos base.
// Fase 2: ToolExecutor con timeout/cancel/rate-limit/cache/progress/metrics.
// Fase 3: tools reales (read/write/bash/grep) con mejoras propietarias.
export * from "./types/index"
export { SessionStore } from "./session/store"
export type { SessionStoreOptions } from "./session/store"
export { SessionStoreSqlite } from "./session/store-sqlite"
export type { SessionStoreSqliteOptions } from "./session/store-sqlite"
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

// Post-100% #4: Vision attach validado — normalizador file/http/data URI.
export * from "./vision/index"

// Medio plazo #7: Vector store SQLite persistente para memoria semántica.
export * from "./vectorstore/index"

// Medio plazo #8: Fine-tune dataset builder (JSONL ollama/sharegpt + Modelfile).
export * from "./finetune/index"

// Medio plazo #9: Plugin registry con checksum + sync remoto.
export * from "./plugins/index"

// Medio plazo #10: Collab hub (transport-agnostic broadcast + presence).
export * from "./collab/index"

// Largo plazo #11-#13: AIOS Kernel (event bus + sandbox + parliament).
export * from "./aios/index"

// Largo plazo #14: Skill Store distribuido (registry local + remote + rating).
export * from "./skills/index"

// Post-v1.21: Runtime propio (llama-server wrapper + GGUF downloader) — reemplaza Ollama.
export * from "./runtime/index"

// Post-v1.21: Voz duplex (VAD energy-based + TTS Piper local).
export * from "./voice/index"

// v1.25: Diff hunks (Cursor-style apply con confirmar/rechazar).
export * from "./diff/index"

// v1.25: Codebase indexer (Continue.dev/AnythingLLM-style).
export * from "./indexer/index"

// v1.25: App scaffold generator (Bolt.new/Replit-style).
export * from "./scaffold/index"

// v1.25: App catalog (Pinokio-style).
export * from "./catalog/index"

// v1.27: Tutoriales in-app, presets probados, smoke suite, sync export/import.
export * from "./docs/index"
export * from "./smoke/index"
export * from "./sync/index"

// v1.29: Onboarding wizard 30s con modelo tiny bundleado.
export * from "./onboarding/index"
