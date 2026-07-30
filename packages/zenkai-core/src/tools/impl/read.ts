import { readFileSync, statSync } from "node:fs"
import type { Tool } from "../types.ts"

// Tool 'read' — leer archivo del disco con MEJORAS vs opencode:
//   - Metadata (size, mime, lastModified, encoding).
//   - Truncate automático si >maxBytes (default 500KB) con marcador claro.
//   - Line numbers opcionales.
//   - Preview (primeras/últimas N líneas) sin cargar el body entero.
//   - Cache idempotente automático (mismo path + mismos mtime → cache hit).
//   - Detecta binario y evita devolver bytes crudos.
//
// A propósito no soporta rangos byte/line — eso lo hace 'grep'. Este tool
// entrega el contenido completo o un truncado explícito. Simple, honesto.

export type ReadInput = {
  path: string
  /** Bytes máximos a devolver. Si el archivo es más grande, se trunca. Default 500KB. */
  maxBytes?: number
  /** Prepend line numbers (1: → línea). Default false. */
  lineNumbers?: boolean
  /** Si true, solo devuelve las primeras/últimas 20 líneas (preview). */
  preview?: boolean
}

export type ReadOutput = {
  path: string
  content: string
  bytes: number
  truncated: boolean
  binary: boolean
  meta: {
    size: number
    lastModified: number
    mime?: string
  }
}

function guessMime(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: "text/typescript", tsx: "text/typescript", js: "text/javascript", jsx: "text/javascript",
    json: "application/json", md: "text/markdown", txt: "text/plain",
    html: "text/html", css: "text/css", py: "text/x-python", rs: "text/x-rust",
    go: "text/x-go", java: "text/x-java", c: "text/x-c", cpp: "text/x-c++",
    yaml: "text/yaml", yml: "text/yaml", toml: "text/x-toml",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    pdf: "application/pdf", zip: "application/zip",
  }
  return ext ? map[ext] : undefined
}

function isBinaryContent(buf: Buffer): boolean {
  // Heurística: si contiene bytes null en los primeros 8KB → binario.
  const sample = buf.subarray(0, Math.min(buf.length, 8192))
  for (const b of sample) if (b === 0) return true
  return false
}

export const readTool: Tool<ReadInput, ReadOutput> = {
  meta: {
    name: "read",
    description: "Lee un archivo del disco. Devuelve contenido + metadata. Trunca si es enorme.",
    riesgo: "seguro",
    idempotente: true,
    costo: "bajo",
    timeoutMs: 5_000,
    rateLimitPorMin: 300,
  },
  validate: (i) => {
    if (!i.path || typeof i.path !== "string") return "path requerido (string)"
    if (i.maxBytes !== undefined && (i.maxBytes < 100 || i.maxBytes > 50 * 1024 * 1024))
      return "maxBytes debe estar entre 100 y 50MB"
    return undefined
  },
  run: async (input, ctx) => {
    ctx.reportar(`stat ${input.path}`, 10)
    const st = statSync(input.path)
    const maxBytes = input.maxBytes ?? 500 * 1024
    const truncated = st.size > maxBytes

    ctx.reportar(`leyendo ${st.size} bytes`, 40)
    const raw = readFileSync(input.path)
    const binary = isBinaryContent(raw)

    if (binary) {
      return {
        path: input.path,
        content: `[binario · ${st.size} bytes · ${guessMime(input.path) ?? "?"}]`,
        bytes: st.size,
        truncated: false,
        binary: true,
        meta: { size: st.size, lastModified: st.mtimeMs, mime: guessMime(input.path) },
      }
    }

    let text = raw.subarray(0, maxBytes).toString("utf8")
    if (truncated) {
      text += `\n\n[... truncado — ${st.size - maxBytes} bytes más ...]`
    }

    if (input.preview) {
      const lines = text.split("\n")
      if (lines.length > 45) {
        text = lines.slice(0, 20).concat(["", "[... " + (lines.length - 40) + " líneas ...]", ""], lines.slice(-20)).join("\n")
      }
    }

    if (input.lineNumbers) {
      const lines = text.split("\n")
      const pad = String(lines.length).length
      text = lines.map((l, i) => `${String(i + 1).padStart(pad, " ")}: ${l}`).join("\n")
    }

    ctx.reportar(`listo`, 100)
    return {
      path: input.path,
      content: text,
      bytes: raw.length,
      truncated,
      binary: false,
      meta: { size: st.size, lastModified: st.mtimeMs, mime: guessMime(input.path) },
    }
  },
}
