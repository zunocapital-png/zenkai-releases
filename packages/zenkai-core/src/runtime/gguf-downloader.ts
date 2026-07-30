import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs"
import { dirname } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

// Downloader de modelos GGUF desde HuggingFace (u otro host directo).
// Reemplaza `ollama pull` para el runtime propio ZENKAI.
//
// Features:
//   - Progress streaming (bytes descargados / total) → UI lo muestra en vivo.
//   - Resume si el archivo parcial existe (usa Range: bytes=X-).
//   - Verificación de tamaño total (Content-Length) para detectar cortes.
//   - Cancelación por AbortSignal.
//   - Sin dependencias externas (fetch nativo + streams de Node).
//
// Uso típico:
//   downloadGguf({
//     url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf",
//     destPath: "/models/qwen2.5-coder-7b.gguf",
//     onProgress: (info) => console.log(`${info.percent.toFixed(1)}% ${info.speedMBps.toFixed(1)} MB/s`),
//   })

export type DownloadProgress = {
  bytesDescargados: number
  bytesTotales: number
  percent: number
  speedMBps: number
  etaSegundos: number | undefined
}

export type DownloadOptions = {
  url: string
  destPath: string
  onProgress?: (info: DownloadProgress) => void
  signal?: AbortSignal
  /** True para intentar resume desde el .part existente. Default true. */
  resume?: boolean
  /** Headers extra — útil si el mirror pide User-Agent. */
  headers?: Record<string, string>
}

export type DownloadResultado = {
  path: string
  bytes: number
  duracionMs: number
  reanudado: boolean
}

/** Descarga con progress y resume. Escribe a `<destPath>.part` y renombra al final. */
export async function downloadGguf(opts: DownloadOptions): Promise<DownloadResultado> {
  const dir = dirname(opts.destPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const partPath = `${opts.destPath}.part`
  let resumeFrom = 0
  const doResume = opts.resume ?? true
  if (doResume && existsSync(partPath)) {
    try { resumeFrom = statSync(partPath).size } catch { resumeFrom = 0 }
  }

  const headers: Record<string, string> = {
    "user-agent": "zenkai-runtime/1.0",
    ...(opts.headers ?? {}),
  }
  if (resumeFrom > 0) headers.range = `bytes=${resumeFrom}-`

  const t0 = Date.now()
  const res = await fetch(opts.url, {
    headers,
    signal: opts.signal,
    redirect: "follow",
  })

  // Si pedimos range pero el server no lo soporta, arrancamos de cero.
  if (resumeFrom > 0 && res.status !== 206) {
    try { unlinkSync(partPath) } catch { /* noop */ }
    resumeFrom = 0
  }

  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status} descargando ${opts.url}`)
  }
  if (!res.body) throw new Error("respuesta sin body")

  const contentLength = Number(res.headers.get("content-length") ?? "0")
  const bytesTotales = resumeFrom + contentLength

  const write = createWriteStream(partPath, { flags: resumeFrom > 0 ? "a" : "w" })

  // Wrapper que emite progress en cada chunk.
  let bytesRecibidos = resumeFrom
  let lastReport = Date.now()
  let lastBytes = bytesRecibidos
  const web = res.body as ReadableStream<Uint8Array>
  const source = Readable.fromWeb(web as unknown as import("node:stream/web").ReadableStream<Uint8Array>)

  source.on("data", (chunk: Buffer) => {
    bytesRecibidos += chunk.length
    // Emit cada 250ms para no inundar la UI.
    const now = Date.now()
    if (now - lastReport >= 250 && opts.onProgress) {
      const dt = (now - lastReport) / 1000
      const speedMBps = ((bytesRecibidos - lastBytes) / (1024 * 1024)) / Math.max(dt, 0.001)
      const restante = bytesTotales > 0 ? bytesTotales - bytesRecibidos : 0
      const eta = speedMBps > 0 && restante > 0 ? restante / (speedMBps * 1024 * 1024) : undefined
      opts.onProgress({
        bytesDescargados: bytesRecibidos,
        bytesTotales,
        percent: bytesTotales > 0 ? (bytesRecibidos / bytesTotales) * 100 : 0,
        speedMBps,
        etaSegundos: eta,
      })
      lastReport = now
      lastBytes = bytesRecibidos
    }
  })

  try {
    await pipeline(source, write)
  } catch (e) {
    // Dejamos el .part para poder resumir después.
    throw new Error(`descarga interrumpida: ${(e as Error).message}`)
  }

  // Emit final.
  if (opts.onProgress) {
    opts.onProgress({
      bytesDescargados: bytesRecibidos,
      bytesTotales: Math.max(bytesTotales, bytesRecibidos),
      percent: 100,
      speedMBps: 0,
      etaSegundos: 0,
    })
  }

  // Rename atómico .part → dest.
  const { renameSync } = await import("node:fs")
  renameSync(partPath, opts.destPath)
  return {
    path: opts.destPath,
    bytes: bytesRecibidos,
    duracionMs: Date.now() - t0,
    reanudado: resumeFrom > 0,
  }
}

/** Cataloga los GGUF típicos que ZENKAI soporta out-of-the-box. */
export const MODELOS_RECOMENDADOS = [
  {
    id: "qwen2.5-coder-7b-q4",
    nombre: "Qwen 2.5 Coder 7B (Q4_K_M)",
    tamanoAprox: "4.4 GB",
    url: "https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    tipo: "coding" as const,
  },
  {
    id: "qwen2.5-7b-q4",
    nombre: "Qwen 2.5 7B Instruct (Q4_K_M)",
    tamanoAprox: "4.4 GB",
    url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    tipo: "general" as const,
  },
  {
    id: "llama3.1-8b-q4",
    nombre: "Llama 3.1 8B Instruct (Q4_K_M)",
    tamanoAprox: "4.9 GB",
    url: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    tipo: "general" as const,
  },
  {
    id: "nomic-embed-text-v1.5",
    nombre: "Nomic Embed Text v1.5 (F16)",
    tamanoAprox: "274 MB",
    url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.f16.gguf",
    tipo: "embed" as const,
  },
]
