import type { Message } from "../types/index"

// Fine-tune dataset builder: convierte sesiones + mensajes en formato JSONL
// listo para entrenar LoRAs con Ollama Modelfile (adapter) o Hugging Face
// (formato "conversations": [{from, value}]). Es la parte de PREPARACIÓN — el
// training real requiere GPU (unsloth, axolotl, llama-factory). ZENKAI hoy
// entrega el dataset limpio; el usuario corre el training donde tenga la GPU.
//
// Dos formatos soportados:
//   - "ollama"   : {"messages":[{"role":"user","content":"..."}, ...]}
//                  (para importar en Modelfile FROM+ADAPTER)
//   - "sharegpt" : {"conversations":[{"from":"human","value":"..."}, ...]}
//                  (formato estándar HF/axolotl/unsloth)

export type DatasetFormat = "ollama" | "sharegpt"

export type DatasetSample = { messages: Message[]; sessionId?: string }

export type DatasetBuildOpts = {
  format: DatasetFormat
  /** Si true, descarta pares que no incluyan al menos 1 user + 1 assistant. */
  requerirPar?: boolean
  /** Si se pasa, sólo incluye mensajes con role in set. Default: user + assistant. */
  rolesIncluidos?: Set<string>
}

/** Convierte partes complejas (tools, imágenes) a texto plano legible. */
function partsATexto(m: Message): string {
  return m.parts
    .map((p) => {
      if (p.type === "text") return p.text
      if (p.type === "tool-call") return `[usé tool ${p.toolName} con ${JSON.stringify(p.args).slice(0, 200)}]`
      if (p.type === "tool-result") return `[resultado: ${String(JSON.stringify(p.result)).slice(0, 300)}]`
      if (p.type === "image") return `[imagen adjunta: ${p.mimeType ?? "unknown"}]`
      return ""
    })
    .filter(Boolean)
    .join("\n")
    .trim()
}

/**
 * Construye 1 línea JSONL por sample. Devuelve el string completo listo para
 * `writeFileSync(path, ...)`. No hace I/O, la CLI que lo consume decide dónde.
 */
export function construirJsonl(samples: DatasetSample[], opts: DatasetBuildOpts): string {
  const roles = opts.rolesIncluidos ?? new Set(["user", "assistant"])
  const lines: string[] = []
  for (const s of samples) {
    const msgs = s.messages.filter((m) => roles.has(m.role))
    if (opts.requerirPar) {
      const tieneUser = msgs.some((m) => m.role === "user")
      const tieneAsst = msgs.some((m) => m.role === "assistant")
      if (!tieneUser || !tieneAsst) continue
    }
    if (msgs.length === 0) continue
    if (opts.format === "ollama") {
      const obj = {
        messages: msgs.map((m) => ({ role: m.role, content: partsATexto(m) })),
      }
      lines.push(JSON.stringify(obj))
    } else {
      const obj = {
        conversations: msgs.map((m) => ({
          from: m.role === "user" ? "human" : m.role === "assistant" ? "gpt" : m.role,
          value: partsATexto(m),
        })),
      }
      lines.push(JSON.stringify(obj))
    }
  }
  return lines.join("\n")
}

/** Estadística resumen de un dataset construido, para mostrar en UI. */
export function estadisticasDataset(samples: DatasetSample[]): {
  totalConversaciones: number
  totalTurnos: number
  turnosUser: number
  turnosAssistant: number
  caracteresTotales: number
  charsPromedioTurno: number
} {
  let turnos = 0
  let turnosUser = 0
  let turnosAssistant = 0
  let chars = 0
  for (const s of samples) {
    turnos += s.messages.length
    for (const m of s.messages) {
      if (m.role === "user") turnosUser++
      else if (m.role === "assistant") turnosAssistant++
      chars += partsATexto(m).length
    }
  }
  return {
    totalConversaciones: samples.length,
    totalTurnos: turnos,
    turnosUser,
    turnosAssistant,
    caracteresTotales: chars,
    charsPromedioTurno: turnos > 0 ? Math.round(chars / turnos) : 0,
  }
}

/**
 * Genera un Modelfile de Ollama listo para importar un LoRA entrenado.
 * El usuario corre `ollama create <name> -f Modelfile` una vez tiene el adapter.
 */
export function generarModelfileOllama(input: {
  baseModel: string
  adapterPath: string
  system?: string
  temperature?: number
}): string {
  const lines = [`FROM ${input.baseModel}`, `ADAPTER ${input.adapterPath}`]
  if (input.system) lines.push(`SYSTEM """${input.system.replace(/"/g, '\\"')}"""`)
  if (typeof input.temperature === "number") lines.push(`PARAMETER temperature ${input.temperature}`)
  return lines.join("\n") + "\n"
}
