// Tipos base del core ZENKAI. Diseñados para ser SIMPLES y compatibles con
// OpenAI-compatible providers y con el shape que espera la UI actual (mapeable
// desde/hacia opencode). No estamos casados con este shape para siempre — es
// el mínimo viable de Fase 1.

/** Rol de un mensaje en la conversación. */
export type Role = "user" | "assistant" | "system" | "tool"

/** Parte de un mensaje (texto, tool-call, tool-result, imagen). */
export type Part =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-result"; toolCallId: string; result: unknown; isError?: boolean }
  | { type: "image"; url: string; mimeType?: string }

/** Un mensaje dentro de una sesión. */
export type Message = {
  id: string
  role: Role
  parts: Part[]
  createdAt: number
  /** Optional: modelo que generó este mensaje (solo assistant). */
  model?: string
  /** Optional: total tokens consumidos. */
  tokens?: { input: number; output: number }
}

/** Una sesión (conversación completa con la IA). */
export type Session = {
  id: string
  title?: string
  createdAt: number
  updatedAt: number
  directory?: string
  /** Modelo pinned a la sesión (si el usuario lo cambió explícitamente). */
  modelPinned?: string
  /** Metadata libre para extensiones (policy engine, digital twin, etc.). */
  meta?: Record<string, unknown>
}

/** Estado interno del store — expuesto solo para tests. */
export type SessionStoreState = {
  sessions: Map<string, Session>
  messages: Map<string, Message[]> // sessionId -> lista
}
