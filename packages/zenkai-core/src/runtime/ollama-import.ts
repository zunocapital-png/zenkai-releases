import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join } from "node:path"
import { inferirCapabilities, type ModelRegistry } from "./model-registry"

// Ollama importer — descubre modelos ya descargados por Ollama y los agrega
// al ModelRegistry propio SIN duplicar el .gguf en disco.
//
// Estrategia:
//   1. Encuentra la carpeta ~/.ollama/models (o env OLLAMA_MODELS si está seteado).
//   2. Lee manifests/registry.ollama.ai/library/<modelo>/<tag>
//   3. El manifest apunta a un blob sha256:xxx en /blobs — ese blob ES el GGUF.
//   4. Registramos el modelo en Zenkai apuntando al mismo blob (path shared).
//
// Ollama guarda cada blob con su sha256 como nombre. Multiple tags que comparten
// el mismo blob (ej. `qwen2.5:7b` y `qwen2.5:7b-instruct`) apuntan al mismo archivo.
// Nosotros deduplicamos por sha256 del blob — importamos cada blob una sola vez.

export type OllamaManifest = {
  layers?: Array<{ mediaType?: string; digest?: string; size?: number }>
}

export type ModeloImportado = {
  id: string
  ollamaName: string // "qwen2.5:7b"
  path: string      // path al blob GGUF
  bytes: number
  capabilities: NonNullable<ReturnType<typeof inferirCapabilities>>
}

/** Devuelve el directorio de modelos de Ollama según OS + env. */
export function ollamaModelsDir(): string {
  if (process.env.OLLAMA_MODELS) return process.env.OLLAMA_MODELS
  const home = homedir()
  if (platform() === "win32") {
    // Windows Ollama default: %USERPROFILE%\.ollama\models
    return join(home, ".ollama", "models")
  }
  return join(home, ".ollama", "models")
}

/** Chequea rápido si Ollama tiene modelos instalados. */
export function ollamaEstaInstalado(): boolean {
  const dir = ollamaModelsDir()
  const manifests = join(dir, "manifests", "registry.ollama.ai")
  return existsSync(manifests)
}

/**
 * Descubre todos los modelos que Ollama tiene descargados.
 * Devuelve la lista SIN registrarlos — el caller decide qué importar.
 */
export function descubrirModelosOllama(): ModeloImportado[] {
  const base = ollamaModelsDir()
  const manifestsRoot = join(base, "manifests", "registry.ollama.ai")
  if (!existsSync(manifestsRoot)) return []

  const encontrados: ModeloImportado[] = []
  const visitados = new Set<string>() // dedupe por digest blob

  // Recorre <registry>/library/<modelo>/<tag>
  const scopes = safeReaddir(manifestsRoot)
  for (const scope of scopes) {
    const scopeDir = join(manifestsRoot, scope)
    if (!isDir(scopeDir)) continue
    const modelos = safeReaddir(scopeDir)
    for (const modelo of modelos) {
      const modeloDir = join(scopeDir, modelo)
      if (!isDir(modeloDir)) continue
      const tags = safeReaddir(modeloDir)
      for (const tag of tags) {
        const manifestPath = join(modeloDir, tag)
        if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) continue
        try {
          const raw = readFileSync(manifestPath, "utf8")
          const manifest = JSON.parse(raw) as OllamaManifest
          // El layer con mediaType "application/vnd.ollama.image.model" ES el GGUF.
          const modelLayer = manifest.layers?.find((l) =>
            l.mediaType?.includes("ollama.image.model") || l.mediaType?.endsWith(".gguf"),
          )
          const digest = modelLayer?.digest
          if (!digest) continue
          // Path físico del blob: /blobs/sha256-<hex>  (Ollama usa "-" en vez de ":").
          const digestFile = digest.replace(":", "-")
          const blobPath = join(base, "blobs", digestFile)
          if (!existsSync(blobPath)) continue
          if (visitados.has(digest)) continue // dedupe
          visitados.add(digest)
          const ollamaName = `${modelo}:${tag}`
          const id = normalizarIdOllama(modelo, tag)
          encontrados.push({
            id,
            ollamaName,
            path: blobPath,
            bytes: modelLayer.size ?? statSync(blobPath).size,
            capabilities: inferirCapabilities(ollamaName),
          })
        } catch { /* manifest corrupto: skip */ }
      }
    }
  }
  return encontrados
}

/**
 * Importa TODOS los modelos de Ollama al registry Zenkai en 1 sola pasada.
 * NO copia archivos — apunta al mismo blob. Idempotente.
 * Devuelve el número importados/actualizados y skippeados.
 */
export function importarOllamaAlRegistry(registry: ModelRegistry): { importados: number; skippeados: number; total: number } {
  const modelos = descubrirModelosOllama()
  let importados = 0
  let skippeados = 0
  for (const m of modelos) {
    const existente = registry.get(m.id)
    if (existente && existente.path === m.path) {
      skippeados++
      continue
    }
    registry.register({
      id: m.id,
      path: m.path,
      nombre: prettyOllamaName(m.ollamaName),
      capabilities: m.capabilities,
      sourceUrl: `ollama://${m.ollamaName}`,
    })
    importados++
  }
  return { importados, skippeados, total: modelos.length }
}

/** Convierte `qwen2.5:7b-instruct` → `qwen2.5-7b-instruct` (id-safe). */
export function normalizarIdOllama(modelo: string, tag: string): string {
  return `${modelo}-${tag}`.toLowerCase().replace(/[^a-z0-9.-]/g, "-")
}

/** `qwen2.5:7b-instruct` → `Qwen 2.5 7B Instruct` — informativo. */
export function prettyOllamaName(ollamaName: string): string {
  return ollamaName
    .replace(":", " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(\d+)([bBmM])(\b|[A-Z])/g, (_, n, b, rest) => `${n}${b.toUpperCase()} ${rest}`)
}

function safeReaddir(p: string): string[] {
  try { return readdirSync(p) } catch { return [] }
}
function isDir(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}
