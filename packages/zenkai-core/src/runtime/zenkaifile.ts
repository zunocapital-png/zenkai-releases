import { readFileSync } from "node:fs"
import type { ModelRegistry, ModelEntry } from "./model-registry"

// ZenkaiFile: equivalente mejorado del Modelfile de Ollama.
// Formato simple, texto plano, línea por línea. Permite personalizar un
// modelo BASE con system prompt, parámetros, template de chat y adapter LoRA.
//
// Ejemplo:
//   FROM qwen2.5-coder-7b
//   SYSTEM Sos un asistente de código conciso. Respondé en español.
//   PARAMETER temperature 0.2
//   PARAMETER top_p 0.9
//   PARAMETER ctx_size 8192
//   PARAMETER n_gpu_layers 99
//   TEMPLATE chatml
//   ADAPTER /path/to/lora.gguf
//
// Diferencias vs Modelfile de Ollama:
//   - CAPABILITY: podés declarar capabilities extras (útil si Zenkai no las infiere).
//   - MEMORY: notas persistentes que se inyectan al system automáticamente.
//   - TOOLS: lista de tools que el modelo puede usar (whitelist explícita).
//   - Sintaxis case-insensitive de la clave, valores multiline con """.

export type ZenkaiFileDirective =
  | { tipo: "FROM"; valor: string }
  | { tipo: "SYSTEM"; valor: string }
  | { tipo: "PARAMETER"; clave: string; valor: string }
  | { tipo: "TEMPLATE"; valor: string }
  | { tipo: "ADAPTER"; valor: string }
  | { tipo: "CAPABILITY"; valor: string }
  | { tipo: "MEMORY"; valor: string }
  | { tipo: "TOOLS"; valor: string[] }

export type ZenkaiFileParsed = {
  base: string
  system?: string
  parameters: Record<string, string | number>
  template?: string
  adapter?: string
  capabilities: string[]
  memory: string[]
  tools: string[]
}

const CLAVES_VALIDAS = new Set(["FROM", "SYSTEM", "PARAMETER", "TEMPLATE", "ADAPTER", "CAPABILITY", "MEMORY", "TOOLS"])

/** Parsea el contenido de un ZenkaiFile. Lanza error si no tiene FROM. */
export function parseZenkaiFile(contenido: string): ZenkaiFileParsed {
  const result: ZenkaiFileParsed = {
    base: "",
    parameters: {},
    capabilities: [],
    memory: [],
    tools: [],
  }

  // Split por líneas, respetando """multi-line""".
  const lineas = tokenizarConHeredoc(contenido)

  for (const linea of lineas) {
    const trimmed = linea.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = /^(\w+)\s+(.+)$/s.exec(trimmed)
    if (!match) continue
    const clave = match[1]!.toUpperCase()
    const valor = match[2]!.trim()
    if (!CLAVES_VALIDAS.has(clave)) continue

    switch (clave) {
      case "FROM":
        result.base = valor
        break
      case "SYSTEM":
        result.system = quitarComillasTriples(valor)
        break
      case "PARAMETER": {
        const partes = valor.split(/\s+/, 2)
        if (partes.length < 2 || !partes[0]) break
        const val = valor.slice(partes[0].length).trim()
        const num = Number(val)
        result.parameters[partes[0]] = Number.isFinite(num) && String(num) === val ? num : val
        break
      }
      case "TEMPLATE":
        result.template = valor.toLowerCase()
        break
      case "ADAPTER":
        result.adapter = valor
        break
      case "CAPABILITY":
        result.capabilities.push(valor.toLowerCase())
        break
      case "MEMORY":
        result.memory.push(quitarComillasTriples(valor))
        break
      case "TOOLS":
        result.tools.push(...valor.split(",").map((s) => s.trim()).filter(Boolean))
        break
    }
  }

  if (!result.base) throw new Error("ZenkaiFile requiere FROM <modelo-base>")
  return result
}

export function parseZenkaiFileFromDisk(path: string): ZenkaiFileParsed {
  return parseZenkaiFile(readFileSync(path, "utf8"))
}

/**
 * Crea un modelo custom en el registry basado en un ZenkaiFile.
 * `id` es el nuevo alias (ej. "mi-coder-personalizado"), `base` es el modelo
 * FROM. El .gguf físico se comparte con el base (no se duplica).
 * Devuelve el nuevo entry, o lanza si el base no existe.
 */
export function crearModeloDesdeZenkaiFile(
  registry: ModelRegistry,
  newId: string,
  spec: ZenkaiFileParsed,
): ModelEntry {
  const base = registry.get(spec.base)
  if (!base) throw new Error(`modelo base '${spec.base}' no está en el registry`)

  const systemFinal = componerSystem(spec.system, spec.memory)
  const params: NonNullable<ModelEntry["paramsDefault"]> = {}
  if (typeof spec.parameters.temperature === "number") params.temperature = spec.parameters.temperature
  if (typeof spec.parameters.top_p === "number") params.top_p = spec.parameters.top_p
  if (typeof spec.parameters.ctx_size === "number") params.ctx_size = spec.parameters.ctx_size
  if (typeof spec.parameters.n_gpu_layers === "number") params.n_gpu_layers = spec.parameters.n_gpu_layers

  return registry.register({
    id: newId,
    path: base.path, // shared con el base — cero duplicación
    nombre: `${base.nombre} (custom)`,
    chatTemplate: spec.template as ModelEntry["chatTemplate"] | undefined,
    systemDefault: systemFinal,
    paramsDefault: Object.keys(params).length > 0 ? params : undefined,
    capabilities: (spec.capabilities.length > 0 ? spec.capabilities : base.capabilities) as ModelEntry["capabilities"],
    sourceUrl: base.sourceUrl,
    bytes: base.bytes,
  })
}

/** Une el system prompt principal con las memorias declaradas. */
function componerSystem(system: string | undefined, memory: string[]): string | undefined {
  if (!system && memory.length === 0) return undefined
  const partes: string[] = []
  if (system) partes.push(system)
  if (memory.length > 0) {
    partes.push("\n--- Memoria persistente ---")
    for (const m of memory) partes.push(`• ${m}`)
  }
  return partes.join("\n")
}

/** Tokeniza respetando `"""..."""` como valor multiline. */
function tokenizarConHeredoc(contenido: string): string[] {
  const salida: string[] = []
  let buffer = ""
  let enHeredoc = false
  for (const c of contenido) {
    if (buffer.endsWith('"""') && !enHeredoc) {
      enHeredoc = true
    } else if (enHeredoc && buffer.endsWith('"""')) {
      enHeredoc = false
    }
    if (c === "\n" && !enHeredoc) {
      salida.push(buffer)
      buffer = ""
    } else {
      buffer += c
    }
  }
  if (buffer) salida.push(buffer)
  return salida
}

function quitarComillasTriples(s: string): string {
  const m = /^"""([\s\S]*?)"""$/.exec(s.trim())
  return m ? m[1]!.trim() : s
}

/** Serializa un ZenkaiFileParsed de vuelta a texto — útil para editor. */
export function serializarZenkaiFile(spec: ZenkaiFileParsed): string {
  const lineas: string[] = [`FROM ${spec.base}`]
  if (spec.system) lineas.push(`SYSTEM """${spec.system}"""`)
  for (const [k, v] of Object.entries(spec.parameters)) lineas.push(`PARAMETER ${k} ${v}`)
  if (spec.template) lineas.push(`TEMPLATE ${spec.template}`)
  if (spec.adapter) lineas.push(`ADAPTER ${spec.adapter}`)
  for (const c of spec.capabilities) lineas.push(`CAPABILITY ${c}`)
  for (const m of spec.memory) lineas.push(`MEMORY """${m}"""`)
  if (spec.tools.length > 0) lineas.push(`TOOLS ${spec.tools.join(", ")}`)
  return lineas.join("\n") + "\n"
}
