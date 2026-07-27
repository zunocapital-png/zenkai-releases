import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./study_folder.txt"
import path from "path"
import fs from "fs/promises"

export const Parameters = Schema.Struct({
  path: Schema.String.annotate({
    description: "Ruta absoluta de la carpeta a estudiar (documentacion, un proyecto de referencia, etc.)",
  }),
  query: Schema.optional(Schema.String).annotate({
    description:
      "Que buscar dentro de la carpeta. Si se omite, devuelve un resumen del contenido (archivos y estructura).",
  }),
  maxResults: Schema.optional(Schema.Number).annotate({
    description: "Cuantos fragmentos relevantes devolver (default 8)",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

type Metadata = {
  path: string
  filesScanned: number
  mode: string
  [key: string]: unknown
}

// Extensiones de texto/codigo que vale la pena estudiar.
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".swift",
  ".md", ".mdx", ".txt", ".json", ".jsonc", ".yaml", ".yml", ".toml",
  ".css", ".scss", ".html", ".vue", ".svelte", ".sql", ".sh", ".env",
  ".xml", ".ini", ".cfg", ".conf", ".gradle", ".dart", ".lua", ".r",
])

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".cache",
  "coverage", "target", "vendor", "__pycache__", ".venv", "venv", ".idea",
])

const MAX_FILES = 800
const MAX_FILE_BYTES = 250 * 1024
const CHUNK_LINES = 40

type Chunk = { file: string; startLine: number; text: string }

async function scanFolder(root: string): Promise<{ files: string[]; chunks: Chunk[]; truncated: boolean }> {
  const files: string[] = []
  const chunks: Chunk[] = []
  let truncated = false

  async function walk(dir: string) {
    if (files.length >= MAX_FILES) {
      truncated = true
      return
    }
    let entries: import("fs").Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true
        return
      }
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue
        await walk(full)
      } else if (entry.isFile()) {
        if (!TEXT_EXT.has(path.extname(entry.name).toLowerCase())) continue
        try {
          const stat = await fs.stat(full)
          if (stat.size > MAX_FILE_BYTES || stat.size === 0) continue
          const content = await fs.readFile(full, "utf-8")
          files.push(full)
          const lines = content.split("\n")
          for (let i = 0; i < lines.length; i += CHUNK_LINES) {
            const slice = lines.slice(i, i + CHUNK_LINES).join("\n").trim()
            if (slice) chunks.push({ file: full, startLine: i + 1, text: slice })
          }
        } catch {
          // unreadable / binary — skip
        }
      }
    }
  }

  await walk(root)
  return { files, chunks, truncated }
}

function scoreChunk(text: string, terms: string[]): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const term of terms) {
    let idx = 0
    while ((idx = lower.indexOf(term, idx)) !== -1) {
      score += 1
      idx += term.length
    }
  }
  return score
}

export const StudyFolderTool = Tool.define(
  "study_folder",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "read",
            patterns: [params.path],
            always: ["*"],
            metadata: { path: params.path },
          })

          const root = params.path
          const scan = yield* Effect.tryPromise({
            try: () => scanFolder(root),
            catch: (e) => new Error(`No se pudo leer la carpeta: ${e instanceof Error ? e.message : String(e)}`),
          })

          if (scan.files.length === 0) {
            return {
              title: `Estudiar ${path.basename(root)}`,
              output: `No se encontraron archivos de texto/codigo en:\n${root}`,
              metadata: { path: root, filesScanned: 0, mode: "overview" },
            }
          }

          // Modo OVERVIEW — sin query, describe el contenido.
          if (!params.query || !params.query.trim()) {
            const byExt = new Map<string, number>()
            for (const f of scan.files) {
              const ext = path.extname(f).toLowerCase() || "(sin ext)"
              byExt.set(ext, (byExt.get(ext) ?? 0) + 1)
            }
            const extSummary = [...byExt.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([ext, n]) => `  ${ext}: ${n} archivo(s)`)
              .join("\n")
            const sample = scan.files.slice(0, 30).map((f) => `  ${path.relative(root, f)}`).join("\n")

            return {
              title: `Estudiar ${path.basename(root)}`,
              output: [
                `Carpeta estudiada: ${root}`,
                `Archivos indexados: ${scan.files.length}${scan.truncated ? " (limite alcanzado, hay mas)" : ""}`,
                `Fragmentos: ${scan.chunks.length}`,
                "",
                "Tipos de archivo:",
                extSummary,
                "",
                "Archivos (primeros 30):",
                sample,
                "",
                'Para buscar dentro, vuelve a llamar con el parametro "query".',
              ].join("\n"),
              metadata: { path: root, filesScanned: scan.files.length, mode: "overview" },
            }
          }

          // Modo SEARCH — con query, devuelve fragmentos relevantes.
          const terms = params.query
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length >= 2)
          const max = params.maxResults && params.maxResults > 0 ? Math.min(params.maxResults, 25) : 8

          const ranked = scan.chunks
            .map((c) => ({ ...c, score: scoreChunk(c.text, terms) }))
            .filter((c) => c.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, max)

          if (ranked.length === 0) {
            return {
              title: `Buscar "${params.query}"`,
              output: `No se encontraron fragmentos relevantes para "${params.query}" en ${scan.files.length} archivos.`,
              metadata: { path: root, filesScanned: scan.files.length, mode: "search" },
            }
          }

          const results = ranked
            .map(
              (c, i) =>
                `### ${i + 1}. ${path.relative(root, c.file)}:${c.startLine} (relevancia ${c.score})\n${c.text}`,
            )
            .join("\n\n")

          return {
            title: `Buscar "${params.query}"`,
            output: [
              `${ranked.length} fragmentos relevantes en ${scan.files.length} archivos:`,
              "",
              results,
            ].join("\n"),
            metadata: { path: root, filesScanned: scan.files.length, mode: "search" },
          }
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
