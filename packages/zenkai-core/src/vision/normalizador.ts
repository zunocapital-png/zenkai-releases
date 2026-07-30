import { readFileSync, statSync } from "node:fs"
import type { Part } from "../types/index"

// Normalizador de imágenes para modelos vision.
// Convierte los 3 shapes que llegan en la práctica a un data URI base64 que
// TODO provider OpenAI-compat acepta:
//   1. file path local  (C:\... o /home/...) → lee + base64 + data URI
//   2. file:// URL      → strip prefijo + lee + base64
//   3. http(s):// URL   → passthrough (el provider descarga)
//   4. data: URI        → passthrough
//
// Mejora vs opencode: validamos mime type real por magic bytes (no confiamos en
// la extensión), y aplicamos un límite duro de tamaño para evitar volar la
// request (default 20 MB, muchos providers tumban a >25 MB).

export const MIME_MAGIC_BYTES: ReadonlyArray<{ mime: string; bytes: number[] }> = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF... WEBP
  { mime: "image/bmp", bytes: [0x42, 0x4d] },
]

export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

export type NormalizarOpts = {
  maxBytes?: number
  /** True para forzar convertir URLs http a base64 (útil para providers que no descargan solos). */
  descargarUrls?: boolean
}

export type ImagenNormalizada = {
  /** Data URI listo para enviar (base64) o URL http/data intacta. */
  url: string
  mimeType: string
  /** Tamaño en bytes si conocido (data URIs y files). */
  bytes?: number
  /** Fuente original — útil para debug/logging. */
  fuente: "file" | "http" | "data"
}

export function detectarMimeMagic(buf: Uint8Array): string | undefined {
  for (const entry of MIME_MAGIC_BYTES) {
    if (buf.length < entry.bytes.length) continue
    let match = true
    for (let i = 0; i < entry.bytes.length; i++) {
      if (buf[i] !== entry.bytes[i]) {
        match = false
        break
      }
    }
    if (match) {
      // WEBP requiere check adicional: bytes 8-11 = "WEBP"
      if (entry.mime === "image/webp") {
        if (buf.length < 12) continue
        if (buf[8] !== 0x57 || buf[9] !== 0x45 || buf[10] !== 0x42 || buf[11] !== 0x50) continue
      }
      return entry.mime
    }
  }
  return undefined
}

export function normalizarImagen(input: string, opts: NormalizarOpts = {}): ImagenNormalizada {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES

  // Data URI ya normalizado.
  if (input.startsWith("data:")) {
    const mime = extraerMimeDeDataUri(input) ?? "application/octet-stream"
    return { url: input, mimeType: mime, fuente: "data" }
  }

  // URL http(s).
  if (/^https?:\/\//i.test(input)) {
    return { url: input, mimeType: "image/*", fuente: "http" }
  }

  // file:// URL → strip.
  let path = input
  if (input.startsWith("file://")) {
    path = decodeURI(input.replace(/^file:\/\/\/?/, ""))
    // En Windows el resultado puede quedar "C:/..." — os.path.win32 lo maneja.
  }

  // File path local.
  const stats = statSync(path)
  if (stats.size > maxBytes) {
    throw new Error(`Imagen demasiado grande: ${stats.size} bytes > ${maxBytes} (${path})`)
  }
  const buf = readFileSync(path)
  const mime = detectarMimeMagic(buf) ?? "application/octet-stream"
  if (!mime.startsWith("image/")) {
    throw new Error(`El archivo no parece una imagen (mime detectado: ${mime}): ${path}`)
  }
  const b64 = Buffer.from(buf).toString("base64")
  return {
    url: `data:${mime};base64,${b64}`,
    mimeType: mime,
    bytes: stats.size,
    fuente: "file",
  }
}

function extraerMimeDeDataUri(uri: string): string | undefined {
  const m = /^data:([^;,]+)/.exec(uri)
  return m?.[1]
}

/** Aplica normalización a todos los parts image de un mensaje. Devuelve una copia. */
export function normalizarPartsImagen(parts: Part[], opts?: NormalizarOpts): Part[] {
  return parts.map((p) => {
    if (p.type !== "image") return p
    try {
      const n = normalizarImagen(p.url, opts)
      return { type: "image", url: n.url, mimeType: n.mimeType }
    } catch (e) {
      // Preservamos el part original si falla la normalización, pero lo marcamos.
      return { type: "text", text: `[imagen no cargada: ${String((e as Error).message)}]` }
    }
  })
}
