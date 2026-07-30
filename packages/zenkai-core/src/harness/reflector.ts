import type { ChatRequest, ChatResponse } from "../provider/types"
import type { Message } from "../types/index"

// Reflector: sub-agente cognitivo real. Toma una respuesta del assistant, la
// re-lee con otro modelo (o el mismo con temperatura distinta) y devuelve un
// veredicto + mejora sugerida.
//
// A diferencia de Reflexion papers académicos, este es minimalista y funcional:
// - Inyectable: recibe una función `chat` (típicamente `orchestrator.chat.bind(orchestrator)`)
// - No hace loops infinitos: 1 pasada.
// - Devuelve estructurado, no prosa suelta.

export type ReflexionInput = {
  /** Pregunta original del usuario. */
  pregunta: string
  /** Respuesta del assistant que queremos evaluar. */
  respuesta: string
  /** Contexto adicional opcional (system prompt, contexto del proyecto). */
  contexto?: string
  /** Modelo a usar para reflexionar. Ideal: distinto al que produjo la respuesta. */
  modelo: string
}

export type ReflexionVeredicto = {
  /** Puntaje 0-10 de qué tan bueno fue el output original. */
  puntaje: number
  /** True si el reflector detectó algo mal (factual, técnico, tono). */
  problemasDetectados: boolean
  /** Lista corta de problemas (vacía si no hay). */
  problemas: string[]
  /** Sugerencia concreta de mejora (si aplica). Prosa breve. */
  sugerencia?: string
  /** Respuesta re-escrita completa (opcional, si el usuario pidió correcciones). */
  respuestaMejorada?: string
  /** Modelo que ejecutó la reflexión. */
  modeloReflector: string
  /** Latencia total del reflector en ms. */
  latencyMs: number
}

export type ChatFn = (req: ChatRequest, candidateNames?: string[]) => Promise<ChatResponse>

const PROMPT_REFLECTOR = `Eres un revisor senior evaluando la respuesta de otra IA.

Tu tarea:
1. Detecta problemas: errores factuales, código con bugs, respuestas incompletas, tono inadecuado.
2. Puntúa de 0 a 10 la calidad.
3. Si hay problemas, sugiere una mejora concreta.
4. Si se pide mejorar (mejorar=true), reescribe la respuesta completa corrigiendo lo detectado.

Responde SOLO en JSON válido con este shape exacto:
{
  "puntaje": <number 0-10>,
  "problemasDetectados": <boolean>,
  "problemas": [<string>, ...],
  "sugerencia": <string | null>,
  "respuestaMejorada": <string | null>
}

Nada más. Sin markdown, sin explicaciones fuera del JSON.`

export async function reflexionar(
  input: ReflexionInput,
  chat: ChatFn,
  opts: { mejorar?: boolean; candidateProviders?: string[] } = {},
): Promise<ReflexionVeredicto> {
  const t0 = Date.now()
  const mejorar = opts.mejorar ?? false

  const userContent = [
    input.contexto ? `CONTEXTO:\n${input.contexto}\n` : "",
    `PREGUNTA ORIGINAL:\n${input.pregunta}\n`,
    `RESPUESTA A EVALUAR:\n${input.respuesta}\n`,
    mejorar
      ? "\nInstrucción: mejorar=true. Si problemasDetectados, reescribe respuestaMejorada."
      : "\nInstrucción: mejorar=false. Deja respuestaMejorada en null.",
  ]
    .filter(Boolean)
    .join("\n")

  const messages: Message[] = [
    {
      id: "sys",
      role: "system",
      parts: [{ type: "text", text: PROMPT_REFLECTOR }],
      createdAt: 0,
    },
    {
      id: "u",
      role: "user",
      parts: [{ type: "text", text: userContent }],
      createdAt: 0,
    },
  ]

  const res = await chat(
    {
      model: input.modelo,
      messages,
      temperature: 0.2,
      cacheable: false,
    },
    opts.candidateProviders,
  )

  const parsed = parseVeredicto(res.content)
  return {
    puntaje: clampScore(parsed.puntaje),
    problemasDetectados: !!parsed.problemasDetectados,
    problemas: Array.isArray(parsed.problemas) ? parsed.problemas.filter((x) => typeof x === "string") : [],
    sugerencia: typeof parsed.sugerencia === "string" ? parsed.sugerencia : undefined,
    respuestaMejorada: typeof parsed.respuestaMejorada === "string" ? parsed.respuestaMejorada : undefined,
    modeloReflector: `${res.provider}/${res.model}`,
    latencyMs: Date.now() - t0,
  }
}

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number.parseFloat(String(n))
  if (!Number.isFinite(v)) return 5
  return Math.max(0, Math.min(10, v))
}

/**
 * Parser robusto: acepta JSON limpio, JSON dentro de ```json ... ```, o
 * el primer bloque {...} encontrado. Si nada funciona, devuelve un shape
 * conservador que no rompe.
 */
function parseVeredicto(text: string): {
  puntaje?: unknown
  problemasDetectados?: unknown
  problemas?: unknown[]
  sugerencia?: unknown
  respuestaMejorada?: unknown
} {
  // 1. JSON limpio.
  const tryDirect = safeJson(text)
  if (tryDirect) return tryDirect
  // 2. Fenced code block.
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence?.[1]) {
    const p = safeJson(fence[1])
    if (p) return p
  }
  // 3. Primer objeto {...} balanceado.
  const obj = extraerPrimerObjeto(text)
  if (obj) {
    const p = safeJson(obj)
    if (p) return p
  }
  // 4. Fallback: puntaje 5, sin problemas.
  return { puntaje: 5, problemasDetectados: false, problemas: [] }
}

function safeJson(s: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(s.trim())
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function extraerPrimerObjeto(text: string): string | undefined {
  const start = text.indexOf("{")
  if (start < 0) return undefined
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]!
    if (escape) {
      escape = false
      continue
    }
    if (c === "\\") {
      escape = true
      continue
    }
    if (c === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return undefined
}
