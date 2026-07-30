import { readFileSync, statSync } from "node:fs"
import { relative, join, extname } from "node:path"
import { VectorStoreSqlite } from "../vectorstore/sqlite"
import type { Embedder } from "../embed/embedder"

// Codebase indexer (Continue.dev / Cursor style) — camina el árbol del proyecto,
// trocea los archivos en chunks semánticos, y los mete al vector store para
// búsqueda posterior. Todo local, sin subir código a la nube.
//
// Estrategia de chunking simple pero efectiva:
//   - .ts/.js/.py/.rs/.go: chunks por función/clase detectados por regex chato.
//   - .md/.txt: chunks por párrafo (double newline).
//   - Todo lo demás: chunks fijos de ~1500 chars.
//
// Diseño consciente: NO usamos AST — es demasiado dep-heavy y frágil entre
// lenguajes. Regex + heurísticas cubren 90% y son 0-dep.

export type IndexerOptions = {
  rootDir: string
  vectorStore: VectorStoreSqlite
  /** Extensiones a incluir. Default: código común + docs. */
  extensiones?: string[]
  /** Paths a ignorar (glob simple por prefijo). */
  ignorar?: string[]
  /** Máximo bytes por archivo. Archivos más grandes se skip. Default 500 KB. */
  maxBytes?: number
  /** Callback progreso. */
  onProgress?: (info: { procesados: number; total: number; archivo: string }) => void
}

export type IndexResultado = {
  archivos: number
  chunks: number
  errores: Array<{ path: string; error: string }>
  duracionMs: number
}

const EXTENSIONES_DEFAULT = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".kt", ".swift",
  ".c", ".cc", ".cpp", ".h", ".hpp",
  ".rb", ".php", ".lua",
  ".md", ".txt", ".mdx",
  ".json", ".yaml", ".yml", ".toml",
  ".sh", ".ps1",
  ".sql", ".graphql",
]
const IGNORAR_DEFAULT = [
  "node_modules", ".git", "dist", "build", ".next", "out",
  "target", ".venv", "venv", "__pycache__",
  ".idea", ".vscode", ".zed", ".ollama", ".DS_Store",
  "coverage", ".turbo", ".cache",
]

const CHUNK_TARGET_CHARS = 1500

export async function indexarCodebase(opts: IndexerOptions): Promise<IndexResultado> {
  const t0 = Date.now()
  const rootDir = opts.rootDir
  const extensiones = new Set(opts.extensiones ?? EXTENSIONES_DEFAULT)
  const ignorar = opts.ignorar ?? IGNORAR_DEFAULT
  const maxBytes = opts.maxBytes ?? 500_000
  const errores: IndexResultado["errores"] = []

  const archivos = descubrirArchivos(rootDir, extensiones, ignorar, maxBytes)
  let procesados = 0
  let chunks = 0

  // Reemplazamos todos los docs de source="codebase" para reindex limpio.
  opts.vectorStore.deleteBySource("codebase")

  for (const path of archivos) {
    try {
      const rel = relative(rootDir, path).replace(/\\/g, "/")
      const contenido = readFileSync(path, "utf8")
      const trozos = chunkArchivo(contenido, extname(path))
      for (let i = 0; i < trozos.length; i++) {
        const trozo = trozos[i]!
        const id = `codebase:${rel}:${i}`
        const ok = await opts.vectorStore.upsert({
          id,
          source: "codebase",
          text: `[${rel}]\n${trozo}`,
          meta: { path: rel, chunk: i, total: trozos.length },
        })
        if (ok) chunks++
      }
    } catch (e) {
      errores.push({ path, error: String((e as Error).message) })
    }
    procesados++
    opts.onProgress?.({ procesados, total: archivos.length, archivo: path })
  }

  return { archivos: procesados, chunks, errores, duracionMs: Date.now() - t0 }
}

/** Recorre el árbol filtrando extensiones + tamaño + patterns ignorados. */
export function descubrirArchivos(
  rootDir: string,
  extensiones: Set<string>,
  ignorar: string[],
  maxBytes: number,
): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs")
  const salida: string[] = []
  const cola: string[] = [rootDir]
  while (cola.length > 0) {
    const dir = cola.shift()!
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { continue }
    for (const entry of entries) {
      // Skip dot-directories no-código.
      if (ignorar.some((ig) => entry === ig)) continue
      const full = join(dir, entry)
      try {
        const s = statSync(full)
        if (s.isDirectory()) {
          cola.push(full)
        } else if (s.isFile()) {
          if (!extensiones.has(extname(entry))) continue
          if (s.size > maxBytes) continue
          salida.push(full)
        }
      } catch { /* skip */ }
    }
  }
  return salida
}

/** Trocea un archivo según su extensión. Devuelve al menos 1 chunk. */
export function chunkArchivo(contenido: string, ext: string): string[] {
  if (contenido.length <= CHUNK_TARGET_CHARS) return [contenido]

  if ([".md", ".mdx", ".txt"].includes(ext)) {
    return chunkPorParrafos(contenido)
  }
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rs", ".go", ".java", ".kt"].includes(ext)) {
    return chunkPorFuncion(contenido, ext)
  }
  return chunkPorTamano(contenido)
}

function chunkPorParrafos(contenido: string): string[] {
  const parrafos = contenido.split(/\n{2,}/)
  const chunks: string[] = []
  let buffer = ""
  for (const p of parrafos) {
    if ((buffer + "\n\n" + p).length > CHUNK_TARGET_CHARS && buffer) {
      chunks.push(buffer)
      buffer = p
    } else {
      buffer = buffer ? `${buffer}\n\n${p}` : p
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks.length > 0 ? chunks : [contenido]
}

function chunkPorFuncion(contenido: string, ext: string): string[] {
  // Regex por lenguaje. Chato pero funcional.
  const patrones: Record<string, RegExp> = {
    ".ts": /^(export\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum)\s+\w+/gm,
    ".py": /^(async\s+)?(def|class)\s+\w+/gm,
    ".rs": /^(pub\s+)?(fn|struct|enum|trait|impl|mod)\s+\w+/gm,
    ".go": /^(func|type)\s+\w+/gm,
  }
  const key = ext in patrones ? ext : ".ts"
  const patron = patrones[key]!
  const puntos = Array.from(contenido.matchAll(patron), (m) => m.index ?? 0)
  if (puntos.length === 0) return chunkPorTamano(contenido)
  puntos.push(contenido.length)
  const chunks: string[] = []
  let buffer = ""
  for (let i = 0; i < puntos.length - 1; i++) {
    const trozo = contenido.slice(puntos[i]!, puntos[i + 1]!)
    if ((buffer + trozo).length > CHUNK_TARGET_CHARS && buffer) {
      chunks.push(buffer)
      buffer = trozo
    } else {
      buffer += trozo
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks
}

function chunkPorTamano(contenido: string): string[] {
  const chunks: string[] = []
  for (let i = 0; i < contenido.length; i += CHUNK_TARGET_CHARS) {
    chunks.push(contenido.slice(i, i + CHUNK_TARGET_CHARS))
  }
  return chunks
}

/**
 * Busca en el codebase indexado por semantic query.
 * Wrapper conveniente que ya filtra por source="codebase".
 */
export async function buscarEnCodebase(vectorStore: VectorStoreSqlite, query: string, topK = 8) {
  const hits = await vectorStore.search(query, topK * 3) // pedimos más y filtramos
  return hits.filter((h) => h.source === "codebase").slice(0, topK)
}
