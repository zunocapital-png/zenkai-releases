// Provider Adapter de ZENKAI (Fase 4). Interfaz unificada sobre TODOS los
// proveedores OpenAI-compatible (OpenAI, Anthropic, DeepSeek, Groq, Together,
// OpenRouter, NVIDIA NIM, Google, Mistral, Cerebras, Ollama, LM Studio, etc.).
//
// SUPERSET de todo lo que existe hoy — cosas que ni Codex/Cursor/opencode/
// OpenRouter tienen:
//
//   1. Cost tracking real por request en USD (fórmula: tokens × precio del provider).
//   2. Health score por provider (últimas N latencias + tasa de error).
//   3. Adaptive timeout (aprende la latencia p95 y ajusta el timeout dinámico).
//   4. Semantic dedup de requests (con embeddings, comparte respuesta si coincide).
//   5. Parallel racing: mismo prompt a N providers, devuelve el más rápido.
//   6. Budget-aware failover: si un provider excede su budget, salta al siguiente.
//   7. Region-aware routing (privacy-first: preferir local o EU si el usuario lo pide).
//   8. Vendor fingerprinting: detecta cuando el provider está cacheando internamente.
//   9. Fallback graceful mid-stream: si el stream corta, retomamos en otro provider.
//  10. Content moderation local opcional (regex de secretos, PII).
//
// Se sostiene con abstracciones MÍNIMAS: cada provider implementa `chat` (y
// opcionalmente `stream`). El orquestador hace lo demás.

import type { Message } from "../types/index"

export type ProviderRegion = "local" | "us" | "eu" | "asia" | "unknown"
export type ProviderKind = "openai-compat" | "anthropic" | "google" | "custom"

export type ProviderMeta = {
  name: string
  kind: ProviderKind
  baseURL: string
  /** Nombre de la env var con la API key (undefined si no requiere). */
  keyEnvVar?: string
  /** Precio en USD por 1M tokens de input (opcional). */
  costPer1MInput?: number
  /** Precio en USD por 1M tokens de output. */
  costPer1MOutput?: number
  supportsTools?: boolean
  supportsVision?: boolean
  supportsStream?: boolean
  /** Región del provider — sirve para el policy engine (privacidad). */
  region?: ProviderRegion
  /** Requests máximos por minuto (rate limit del provider). */
  rpmLimit?: number
}

export type ChatRequest = {
  model: string
  messages: Message[]
  temperature?: number
  maxTokens?: number
  tools?: unknown[]
  /** Si true, la respuesta es determinista → apta para cache. */
  cacheable?: boolean
}

export type ChatUsage = {
  inputTokens: number
  outputTokens: number
  /** Costo estimado en USD (input + output según precio del provider). */
  costUsd: number
}

export type ChatResponse = {
  provider: string
  model: string
  content: string
  toolCalls?: Array<{ id: string; name: string; args: unknown }>
  usage?: ChatUsage
  finishReason?: "stop" | "length" | "tool_calls" | "error"
  latencyMs: number
  /** Marcamos si vino de cache (nuestro, no del provider). */
  fromCache?: boolean
}

export type ChatChunk =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | { type: "done"; usage?: ChatUsage; finishReason?: ChatResponse["finishReason"] }
  | { type: "error"; error: string }

export type ProviderContext = {
  signal: AbortSignal
  apiKey?: string
}

export type Provider = {
  meta: ProviderMeta
  chat: (req: ChatRequest, ctx: ProviderContext) => Promise<ChatResponse>
  stream?: (req: ChatRequest, ctx: ProviderContext) => AsyncIterable<ChatChunk>
}

/** Estadísticas por provider — expuestas al Observability Center. */
export type ProviderStats = {
  name: string
  requests: number
  errors: number
  totalLatencyMs: number
  totalCostUsd: number
  p95LatencyMs: number
  healthScore: number // 0-100
  budgetSpentUsd: number
  budgetLimitUsd?: number
}
