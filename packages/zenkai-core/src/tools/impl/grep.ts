import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { Tool } from "../types"

// Tool 'grep' — buscar patrón en archivos con MEJORAS vs opencode:
//   - Regex cache (compila UNA vez por pattern).
//   - Ignora node_modules/.git/dist/build/out/coverage/target por default.
//   - Context lines (before/after) tipo grep -B -A.
//   - Case-insensitive optional.
//   - Include/exclude por glob simple.
//   - Progress: reporta cada 100 archivos escaneados.
//   - Skip binarios (mismo heurístico que 'read').
//   - Trunca resultados a maxMatches (default 200) — antes que se explote.

export type GrepInput = {
  pattern: string
  root: string
  caseInsensitive?: boolean
  context?: number // líneas before/after
  include?: string // extensión: "ts", "*.tsx"
  exclude?: string[] // paths a saltear
  maxMatches?: number
  maxFileSize?: number
}

export type GrepMatch = {
  file: string
  line: number
  text: string
  context?: {
    before: string[]
    after: string[]
  }
}

export type GrepOutput = {
  pattern: string
  root: string
  totalMatches: number
  totalFiles: number
  scannedFiles: number
  truncated: boolean
  matches: GrepMatch[]
}

const DEFAULT_IGNORE = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", "target",
  ".next", ".nuxt", ".turbo", "__pycache__", ".venv", "venv", ".cache",
])

function isBinaryContent(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096))
  for (const b of sample) if (b === 0) return true
  return false
}

function walk(root: string, ignore: Set<string>): string[] {
  const files: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (ignore.has(name) || name.startsWith(".")) continue
      const full = join(dir, name)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) stack.push(full)
      else if (st.isFile()) files.push(full)
    }
  }
  return files
}

// Cache de regex por pattern (evita recompilar el mismo pattern varias veces
// dentro de la vida del proceso).
const regexCache = new Map<string, RegExp>()
function compilar(pattern: string, ci: boolean): RegExp {
  const key = `${ci ? "i" : ""}::${pattern}`
  const existente = regexCache.get(key)
  if (existente) return existente
  const nuevo = new RegExp(pattern, ci ? "gi" : "g")
  regexCache.set(key, nuevo)
  return nuevo
}

export const grepTool: Tool<GrepInput, GrepOutput> = {
  meta: {
    name: "grep",
    description: "Busca un patrón regex en archivos bajo un directorio. Con context lines opcionales.",
    riesgo: "seguro",
    idempotente: true,
    costo: "medio",
    timeoutMs: 15_000,
    rateLimitPorMin: 60,
  },
  validate: (i) => {
    if (!i.pattern) return "pattern requerido"
    if (!i.root) return "root requerido"
    try { new RegExp(i.pattern) } catch (e) { return `regex inválido: ${String(e)}` }
    return undefined
  },
  run: async (input, ctx) => {
    const maxMatches = input.maxMatches ?? 200
    const maxFileSize = input.maxFileSize ?? 1024 * 1024 // 1MB
    const ctxLines = input.context ?? 0
    const ci = input.caseInsensitive ?? false
    const ignore = new Set(DEFAULT_IGNORE)
    for (const e of input.exclude ?? []) ignore.add(e)

    ctx.reportar("escaneando árbol de archivos", 5)
    const allFiles = walk(input.root, ignore)

    const filesToScan = allFiles.filter((f) => {
      if (input.include) {
        const ext = input.include.replace(/^\*?\./, "")
        if (!f.endsWith(`.${ext}`)) return false
      }
      return true
    })

    ctx.reportar(`${filesToScan.length} archivos a escanear`, 10)

    const rx = compilar(input.pattern, ci)
    const matches: GrepMatch[] = []
    let scannedFiles = 0
    let truncated = false

    for (const file of filesToScan) {
      if (ctx.signal.aborted) break
      if (matches.length >= maxMatches) { truncated = true; break }
      scannedFiles++
      if (scannedFiles % 100 === 0) {
        ctx.reportar(`${scannedFiles} archivos escaneados · ${matches.length} matches`, 10 + Math.min(80, Math.round((scannedFiles / filesToScan.length) * 80)))
      }
      let st
      try { st = statSync(file) } catch { continue }
      if (st.size > maxFileSize) continue
      let raw: Buffer
      try { raw = readFileSync(file) } catch { continue }
      if (isBinaryContent(raw)) continue
      const text = raw.toString("utf8")
      const lines = text.split("\n")
      rx.lastIndex = 0
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        rx.lastIndex = 0
        if (!rx.test(line)) continue
        const rel = relative(input.root, file).replaceAll("\\", "/")
        const m: GrepMatch = {
          file: rel,
          line: i + 1,
          text: line,
        }
        if (ctxLines > 0) {
          m.context = {
            before: lines.slice(Math.max(0, i - ctxLines), i),
            after: lines.slice(i + 1, Math.min(lines.length, i + 1 + ctxLines)),
          }
        }
        matches.push(m)
        if (matches.length >= maxMatches) { truncated = true; break }
      }
    }

    ctx.reportar(`listo · ${matches.length} matches`, 100)
    return {
      pattern: input.pattern,
      root: input.root,
      totalMatches: matches.length,
      totalFiles: filesToScan.length,
      scannedFiles,
      truncated,
      matches,
    }
  },
}
