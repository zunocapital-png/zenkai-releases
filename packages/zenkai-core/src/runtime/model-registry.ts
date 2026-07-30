import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

// Registry local de modelos GGUF instalados. Reemplaza `ollama list/rm`.
//
// Guarda una entrada por modelo con: id lógico (alias corto), path físico al
// GGUF, tamaño, template de chat, parámetros default, fecha de descarga.
//
// El registry es un JSON en el modelsDir/registry.json — cross-app y auditable.

export type ModelEntry = {
  /** Alias corto — cómo lo pide el usuario en el chat (ej. "qwen2.5-coder-7b"). */
  id: string
  /** Path absoluto al archivo .gguf. */
  path: string
  /** Bytes en disco (informativo). */
  bytes: number
  /** Nombre human-readable. */
  nombre: string
  /** Template de chat (chatml, llama3, mistral, none). */
  chatTemplate?: "chatml" | "llama3" | "mistral" | "gemma" | "none"
  /** System prompt default a inyectar. */
  systemDefault?: string
  /** Parámetros default (temperature, top_p, etc). */
  paramsDefault?: {
    temperature?: number
    top_p?: number
    ctx_size?: number
    n_gpu_layers?: number
  }
  /** Capabilities declaradas. Ollama tiene esto — lo replicamos. */
  capabilities?: Array<"tools" | "vision" | "embed" | "completion">
  /** URL de origen (para redownload). */
  sourceUrl?: string
  /** Fecha de instalación. */
  installedAt: number
}

export type ModelRegistrySnapshot = { version: 1; models: ModelEntry[] }

export type ModelRegistryOptions = {
  /** Directorio raíz donde viven los .gguf y el registry.json. */
  modelsDir: string
}

export class ModelRegistry {
  private path: string
  private modelsDir: string
  private state: ModelRegistrySnapshot

  constructor(opts: ModelRegistryOptions) {
    this.modelsDir = opts.modelsDir
    this.path = join(opts.modelsDir, "registry.json")
    if (!existsSync(this.modelsDir)) mkdirSync(this.modelsDir, { recursive: true })
    this.state = this.cargar()
  }

  private cargar(): ModelRegistrySnapshot {
    if (!existsSync(this.path)) return { version: 1, models: [] }
    try {
      const p = JSON.parse(readFileSync(this.path, "utf8")) as ModelRegistrySnapshot
      if (p?.version === 1 && Array.isArray(p.models)) return p
    } catch { /* corrupt */ }
    return { version: 1, models: [] }
  }

  private guardar() {
    writeFileSync(this.path, JSON.stringify(this.state, null, 2), "utf8")
  }

  /** Registra un modelo GGUF ya descargado. */
  register(input: Omit<ModelEntry, "installedAt" | "bytes"> & { bytes?: number }): ModelEntry {
    if (!existsSync(input.path)) throw new Error(`modelo GGUF no existe en ${input.path}`)
    const bytes = input.bytes ?? statSync(input.path).size
    const entry: ModelEntry = { ...input, bytes, installedAt: Date.now() }
    const idx = this.state.models.findIndex((m) => m.id === entry.id)
    if (idx >= 0) this.state.models[idx] = entry
    else this.state.models.push(entry)
    this.guardar()
    return entry
  }

  /** Lista todos los modelos registrados. */
  list(): ModelEntry[] { return [...this.state.models] }

  /** Búsqueda por id exacto. */
  get(id: string): ModelEntry | undefined {
    return this.state.models.find((m) => m.id === id)
  }

  /** Busca modelos que matchean por prefijo. Útil para "auto-select". */
  search(prefix: string): ModelEntry[] {
    return this.state.models.filter((m) => m.id.startsWith(prefix))
  }

  /**
   * Quita el modelo del registry Y opcionalmente borra el .gguf del disco.
   * Devuelve true si se removió del registry.
   */
  remove(id: string, opts: { borrarArchivo?: boolean } = {}): boolean {
    const m = this.get(id)
    if (!m) return false
    if (opts.borrarArchivo) {
      try { unlinkSync(m.path) } catch { /* ignore */ }
    }
    this.state.models = this.state.models.filter((x) => x.id !== id)
    this.guardar()
    return true
  }

  /** Path por default donde guardar un modelo nuevo. */
  defaultPath(id: string): string {
    return join(this.modelsDir, `${id}.gguf`)
  }

  /** Chequea que todos los archivos del registry siguen existiendo; borra huérfanos del index. */
  async gc(): Promise<{ huerfanos: number }> {
    let huerfanos = 0
    const validos: ModelEntry[] = []
    for (const m of this.state.models) {
      if (existsSync(m.path)) validos.push(m)
      else huerfanos++
    }
    this.state.models = validos
    if (huerfanos > 0) this.guardar()
    return { huerfanos }
  }

  /** Filtra por capability — replica de `ollama /api/tags` con tools filter. */
  byCapability(cap: "tools" | "vision" | "embed" | "completion"): ModelEntry[] {
    return this.state.models.filter((m) => m.capabilities?.includes(cap))
  }
}

// Helper: infiere capabilities a partir del nombre del modelo. Best-effort.
// Ollama las tiene declaradas en el manifest; nosotros no siempre.
export function inferirCapabilities(nombre: string): NonNullable<ModelEntry["capabilities"]> {
  const n = nombre.toLowerCase()
  const caps: NonNullable<ModelEntry["capabilities"]> = []
  if (/embed|nomic|bge/i.test(n)) caps.push("embed")
  else {
    caps.push("completion")
    if (/instruct|chat|coder|it$/.test(n)) caps.push("tools")
    if (/vl|vision|llava|moondream/i.test(n)) caps.push("vision")
  }
  return caps
}

/** Helper para saber si un id apunta a un archivo GGUF válido dentro del dir. */
export function pathBelongsToDir(path: string, dir: string): boolean {
  const abs = require("node:path").resolve(path)
  const absDir = require("node:path").resolve(dir)
  return abs.startsWith(absDir)
}

/** No expuesto — para tests. */
export function _forceUnlink(path: string): void {
  try { unlinkSync(path) } catch { /* ignore */ }
}
export function _ensureDir(p: string): void {
  const d = dirname(p)
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}
