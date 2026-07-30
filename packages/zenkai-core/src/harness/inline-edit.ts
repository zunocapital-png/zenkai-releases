import type { ChatFn } from "./reflector"
import type { Message } from "../types/index"

// Inline edit (Cursor Cmd-K style) — el usuario selecciona un fragmento de
// código y pide una modificación en lenguaje natural. Zenkai devuelve SOLO
// el fragmento reemplazado (no toda la explicación), listo para aplicar.
//
// Diferencia vs chat normal:
//   - Prompt tuneado para outputs quirúrgicos, sin prosa.
//   - Detecta y extrae SOLO el código.
//   - Devuelve además un diff generado para preview con hunks.

export type InlineEditInput = {
  /** Fragmento original que el usuario tiene seleccionado. */
  seleccion: string
  /** Instrucción en lenguaje natural. Ej: "añadí validación de null". */
  instruccion: string
  /** Lenguaje del código — sirve al modelo para no cambiar sintaxis. */
  lenguaje: string
  /** Contexto opcional — código alrededor de la selección para que el modelo entienda. */
  contextoAntes?: string
  contextoDespues?: string
  modelo: string
  candidateProviders?: string[]
}

export type InlineEditResultado = {
  ok: boolean
  seleccionOriginal: string
  seleccionNueva: string
  diff: string
  cambios: number
  motivo?: string
  latencyMs: number
}

const PROMPT_INLINE = `Sos un editor de código quirúrgico. Recibís UN FRAGMENTO y una INSTRUCCIÓN.
Devolvés SOLO el fragmento modificado, dentro de un bloque \`\`\`<lenguaje> ... \`\`\`.

Reglas:
- Nada de explicación previa ni posterior. Solo el bloque de código.
- Preservá indentación exacta del fragmento original (no cambiés tabs por spaces ni viceversa).
- Si la instrucción no requiere cambios reales, devolvé el fragmento original tal cual.
- No agregues imports/require salvo que la instrucción lo pida explícito.
- El fragmento modificado debe ser DROP-IN — reemplaza exactamente al original.`

export async function inlineEdit(input: InlineEditInput, chat: ChatFn): Promise<InlineEditResultado> {
  const t0 = Date.now()
  const user = [
    input.contextoAntes ? `CONTEXTO ANTES:\n\`\`\`${input.lenguaje}\n${input.contextoAntes}\n\`\`\`\n` : "",
    `FRAGMENTO SELECCIONADO:\n\`\`\`${input.lenguaje}\n${input.seleccion}\n\`\`\``,
    input.contextoDespues ? `\nCONTEXTO DESPUÉS:\n\`\`\`${input.lenguaje}\n${input.contextoDespues}\n\`\`\`\n` : "",
    `\nINSTRUCCIÓN: ${input.instruccion}`,
  ].filter(Boolean).join("\n")

  const messages: Message[] = [
    { id: "s", role: "system", parts: [{ type: "text", text: PROMPT_INLINE }], createdAt: 0 },
    { id: "u", role: "user", parts: [{ type: "text", text: user }], createdAt: 0 },
  ]

  try {
    const res = await chat({ model: input.modelo, messages, temperature: 0.2, cacheable: false }, input.candidateProviders)
    const nueva = extraerCodigoLimpio(res.content, input.lenguaje) ?? input.seleccion
    const diff = generarDiffSimple(input.seleccion, nueva)
    const cambios = contarCambios(input.seleccion, nueva)
    return {
      ok: true,
      seleccionOriginal: input.seleccion,
      seleccionNueva: nueva,
      diff,
      cambios,
      latencyMs: Date.now() - t0,
    }
  } catch (e) {
    return {
      ok: false,
      seleccionOriginal: input.seleccion,
      seleccionNueva: input.seleccion,
      diff: "",
      cambios: 0,
      motivo: String((e as Error).message),
      latencyMs: Date.now() - t0,
    }
  }
}

export function extraerCodigoLimpio(texto: string, lang: string): string | undefined {
  // Fence con el lang preciso.
  const re = new RegExp("```" + escapeRe(lang) + "\\s*\\n([\\s\\S]*?)```", "i")
  const m = re.exec(texto)
  if (m?.[1]) return m[1].replace(/\n$/, "")
  // Fence genérico.
  const generic = /```(?:[a-z0-9+.-]+)?\s*\n([\s\S]*?)```/i.exec(texto)
  if (generic?.[1]) return generic[1].replace(/\n$/, "")
  return undefined
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Diff estilo unified minimal — línea por línea. Suficiente para UI de preview.
 */
export function generarDiffSimple(original: string, nueva: string): string {
  const linesA = original.split("\n")
  const linesB = nueva.split("\n")
  const salida: string[] = []
  const maxLen = Math.max(linesA.length, linesB.length)
  for (let i = 0; i < maxLen; i++) {
    const a = linesA[i]
    const b = linesB[i]
    if (a === undefined && b !== undefined) salida.push(`+${b}`)
    else if (a !== undefined && b === undefined) salida.push(`-${a}`)
    else if (a !== b) {
      salida.push(`-${a}`)
      salida.push(`+${b}`)
    } else salida.push(` ${a}`)
  }
  return salida.join("\n")
}

/** Cuenta líneas modificadas (adds + removes). */
export function contarCambios(original: string, nueva: string): number {
  const linesA = original.split("\n")
  const linesB = nueva.split("\n")
  const setA = new Set(linesA)
  const setB = new Set(linesB)
  let cambios = 0
  for (const l of linesA) if (!setB.has(l)) cambios++
  for (const l of linesB) if (!setA.has(l)) cambios++
  return cambios
}
