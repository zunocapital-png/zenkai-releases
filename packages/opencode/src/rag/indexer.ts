import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import crypto from "crypto"

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".md",
])

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "__pycache__",
  "target",
  ".cache",
  "coverage",
])

const CHUNK_LINES = 500

export interface IndexChunk {
  filePath: string
  startLine: number
  endLine: number
  content: string
  lastModified: number
}

function projectHash(projectPath: string): string {
  return crypto.createHash("sha256").update(projectPath).digest("hex").slice(0, 16)
}

function indexDir(projectPath: string): string {
  const home = process.env.USERPROFILE || process.env.HOME || ""
  return path.join(home, ".config", "opencode", "rag-index", projectHash(projectPath))
}

async function walkDir(dir: string, files: string[]): Promise<void> {
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && IGNORE_DIRS.has(entry.name)) continue
    if (IGNORE_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDir(full, files)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SOURCE_EXTENSIONS.has(ext)) {
        files.push(full)
      }
    }
  }
}

function splitIntoChunks(filePath: string, content: string, lastModified: number): IndexChunk[] {
  const lines = content.split(/\r?\n/)
  const chunks: IndexChunk[] = []
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    const end = Math.min(i + CHUNK_LINES, lines.length)
    chunks.push({
      filePath,
      startLine: i + 1,
      endLine: end,
      content: lines.slice(i, end).join("\n"),
      lastModified,
    })
  }
  return chunks
}

export async function indexProject(projectPath: string): Promise<number> {
  const absProject = path.resolve(projectPath)
  const outDir = indexDir(absProject)
  await fsp.mkdir(outDir, { recursive: true })

  // Clear previous index
  try {
    const existing = await fsp.readdir(outDir)
    for (const f of existing) {
      await fsp.unlink(path.join(outDir, f))
    }
  } catch {
    // first run
  }

  const files: string[] = []
  await walkDir(absProject, files)

  let totalChunks = 0
  for (const file of files) {
    let stat: fs.Stats
    try {
      stat = await fsp.stat(file)
    } catch {
      continue
    }
    let content: string
    try {
      content = await fsp.readFile(file, "utf-8")
    } catch {
      continue
    }
    const rel = path.relative(absProject, file)
    const chunks = splitIntoChunks(rel, content, stat.mtimeMs)
    for (const chunk of chunks) {
      const chunkId = crypto
        .createHash("sha256")
        .update(`${chunk.filePath}:${chunk.startLine}`)
        .digest("hex")
        .slice(0, 12)
      await fsp.writeFile(path.join(outDir, `${chunkId}.json`), JSON.stringify(chunk))
      totalChunks++
    }
  }
  return totalChunks
}

function scoreChunk(chunk: IndexChunk, terms: string[]): number {
  const lower = chunk.content.toLowerCase()
  const pathLower = chunk.filePath.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (!term) continue
    // path matches are worth more
    if (pathLower.includes(term)) score += 10
    // count content occurrences
    let idx = 0
    while (true) {
      idx = lower.indexOf(term, idx)
      if (idx === -1) break
      score += 1
      idx += term.length
    }
  }
  return score
}

export async function searchIndex(
  projectPath: string,
  query: string,
): Promise<IndexChunk[]> {
  const absProject = path.resolve(projectPath)
  const dir = indexDir(absProject)
  let files: string[]
  try {
    files = await fsp.readdir(dir)
  } catch {
    return []
  }
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
  if (terms.length === 0) return []

  const scored: { chunk: IndexChunk; score: number }[] = []
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const raw = await fsp.readFile(path.join(dir, file), "utf-8")
      const chunk: IndexChunk = JSON.parse(raw)
      const score = scoreChunk(chunk, terms)
      if (score > 0) {
        scored.push({ chunk, score })
      }
    } catch {
      continue
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 20).map((s) => s.chunk)
}
