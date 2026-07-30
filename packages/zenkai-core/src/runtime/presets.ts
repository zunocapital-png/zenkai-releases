// Presets probados por caso de uso (LM Studio-style pero mejor).
// LM Studio te da unos pocos genéricos; nosotros los tuneamos por MODO
// (coding/writing/reasoning/creative/fast/precise) con temperature, top_p,
// top_k, repeat_penalty y ctx_size validados en producción.
//
// Uso: `aplicarPreset(entry, "coding")` devuelve un ModelEntry mutado con
// paramsDefault sobreescritos. El motor levanta el modelo con esos params.

export type PresetModo = "coding" | "writing" | "reasoning" | "creative" | "fast" | "precise" | "translation" | "chat"

export type PresetParams = {
  temperature: number
  top_p: number
  top_k?: number
  repeat_penalty?: number
  ctx_size: number
  n_predict?: number
  min_p?: number
  descripcion: string
  cuando_usar: string
}

/**
 * Presets basados en benchmarks públicos + comunidad + docs de cada familia.
 * Todos apuntan a que el modelo se comporte consistente para su tarea.
 */
export const PRESETS: Record<PresetModo, PresetParams> = {
  coding: {
    temperature: 0.2,
    top_p: 0.95,
    top_k: 40,
    repeat_penalty: 1.05,
    ctx_size: 16384,
    min_p: 0.05,
    descripcion: "Determinístico, precede accuracy sobre creatividad.",
    cuando_usar: "Escribir código, refactor, debugging, tests.",
  },
  writing: {
    temperature: 0.7,
    top_p: 0.9,
    top_k: 50,
    repeat_penalty: 1.1,
    ctx_size: 8192,
    descripcion: "Balance entre creatividad y coherencia. Prose fluida.",
    cuando_usar: "Redactar textos, emails, artículos, docs.",
  },
  reasoning: {
    temperature: 0.4,
    top_p: 0.9,
    top_k: 30,
    repeat_penalty: 1.0,
    ctx_size: 32768,
    min_p: 0.05,
    descripcion: "Baja temperatura + contexto largo para pensar profundo.",
    cuando_usar: "Matemática, lógica, análisis, planificación step-by-step.",
  },
  creative: {
    temperature: 1.1,
    top_p: 0.95,
    top_k: 100,
    repeat_penalty: 1.15,
    ctx_size: 8192,
    descripcion: "Alta variabilidad — outputs distintos entre corridas.",
    cuando_usar: "Brainstorming, ficción, poesía, ideas fuera de la caja.",
  },
  fast: {
    temperature: 0.5,
    top_p: 0.85,
    top_k: 20,
    ctx_size: 4096,
    n_predict: 256,
    descripcion: "Respuestas cortas y rápidas — cap de tokens bajo.",
    cuando_usar: "Chat corto, respuestas de una línea, autocompletado.",
  },
  precise: {
    temperature: 0.0,
    top_p: 1.0,
    top_k: 1,
    ctx_size: 16384,
    descripcion: "Greedy decoding — la respuesta con mayor probabilidad, siempre igual.",
    cuando_usar: "Extraer datos, parsear, tareas donde 2 corridas deben dar lo mismo.",
  },
  translation: {
    temperature: 0.3,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.05,
    ctx_size: 8192,
    descripcion: "Bajo pero no nulo — permite matices sin inventar.",
    cuando_usar: "Traducciones, transcripciones limpias.",
  },
  chat: {
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    ctx_size: 8192,
    descripcion: "Default general — conversación natural.",
    cuando_usar: "Chat cotidiano sin caso de uso específico.",
  },
}

/**
 * Aplica un preset a los params default del entry.
 * Devuelve un objeto NUEVO — no muta el entry original.
 */
export function aplicarPreset<T extends { paramsDefault?: Record<string, unknown> }>(
  entry: T,
  modo: PresetModo,
): T {
  const p = PRESETS[modo]
  const paramsDefault = {
    ...(entry.paramsDefault ?? {}),
    temperature: p.temperature,
    top_p: p.top_p,
    top_k: p.top_k,
    repeat_penalty: p.repeat_penalty,
    ctx_size: p.ctx_size,
    min_p: p.min_p,
    n_predict: p.n_predict,
  }
  return { ...entry, paramsDefault }
}

/**
 * Sugiere el mejor preset a partir del CONTENIDO del prompt del usuario.
 * Cero LLM: es una heurística chata basada en keywords y largo.
 */
export function sugerirPresetDePrompt(prompt: string): PresetModo {
  const t = prompt.toLowerCase()
  if (/(código|codigo|refactor|function|clase|bug|error|test|typescript|python|rust|npm|bun)/i.test(t)) return "coding"
  if (/(razoná|razona|explicá|explica|por qué|analizá|analiza|paso a paso|calculá|calcula|resolvé|resuelve)/i.test(t)) return "reasoning"
  if (/(traducí|traduce|translate)/i.test(t)) return "translation"
  if (/(escribí|escribe|redactá|redacta|artículo|email|carta)/i.test(t)) return "writing"
  if (/(inventá|inventa|ideas|creativ|brainstorm|imaginá)/i.test(t)) return "creative"
  if (/(extraé|extract|parsea|json|csv|estructur)/i.test(t)) return "precise"
  if (t.length < 60) return "fast"
  return "chat"
}

/** Lista de modos con emoji para UI. */
export const PRESET_EMOJI: Record<PresetModo, string> = {
  coding: "💻",
  writing: "✍️",
  reasoning: "🧠",
  creative: "🎨",
  fast: "⚡",
  precise: "🎯",
  translation: "🌐",
  chat: "💬",
}
