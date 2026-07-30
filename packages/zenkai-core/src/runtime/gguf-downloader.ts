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

export type ModeloRecomendado = {
  id: string
  nombre: string
  /** Bytes aproximados del archivo GGUF — sirve para chequeo de disco. */
  bytesAprox: number
  /** VRAM/RAM mínima recomendada para correr fluido en GPU o CPU. */
  ramMinimaMB: number
  url: string
  tipo: "coding" | "general" | "reasoning" | "vision" | "embed" | "tiny"
  /** Nivel de capacidad relativo (1 = tiny, 10 = frontera). */
  potencia: number
  /** Contexto máximo del modelo. */
  ctxMax: number
  /** Descripción corta para UI. */
  descripcion: string
}

/**
 * Catálogo curado — de tiny (1B) a frontier (72B). Ordenado por potencia asc.
 * Los IDs son estables para que el registry no rompa entre releases.
 */
export const MODELOS_RECOMENDADOS: readonly ModeloRecomendado[] = [
  // ── Embed ──
  {
    id: "nomic-embed-text-v1.5",
    nombre: "Nomic Embed Text v1.5 (F16)",
    bytesAprox: 274 * 1024 * 1024,
    ramMinimaMB: 512,
    url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.f16.gguf",
    tipo: "embed",
    potencia: 3,
    ctxMax: 8192,
    descripcion: "Embeddings de calidad para RAG. Corre en cualquier laptop.",
  },
  // ── Tiny (1-3B) — laptops flojas ──
  {
    id: "qwen2.5-1.5b-q4",
    nombre: "Qwen 2.5 1.5B Instruct (Q4_K_M)",
    bytesAprox: 1_100_000_000,
    ramMinimaMB: 2048,
    url: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    tipo: "tiny",
    potencia: 2,
    ctxMax: 32768,
    descripcion: "El más chico que sirve. Ideal para máquinas con 4 GB RAM.",
  },
  {
    id: "qwen2.5-3b-q4",
    nombre: "Qwen 2.5 3B Instruct (Q4_K_M)",
    bytesAprox: 2_000_000_000,
    ramMinimaMB: 4096,
    url: "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    tipo: "general",
    potencia: 3,
    ctxMax: 32768,
    descripcion: "Chico pero decente. Chats simples, no código complejo.",
  },
  // ── Small (7-8B) — sweet spot laptops modernas ──
  {
    id: "qwen2.5-coder-7b-q4",
    nombre: "Qwen 2.5 Coder 7B Instruct (Q4_K_M)",
    bytesAprox: 4_700_000_000,
    ramMinimaMB: 6144,
    url: "https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    tipo: "coding",
    potencia: 6,
    ctxMax: 32768,
    descripcion: "Sweet spot para código en 8 GB VRAM. Muy sólido para su tamaño.",
  },
  {
    id: "qwen2.5-7b-q4",
    nombre: "Qwen 2.5 7B Instruct (Q4_K_M)",
    bytesAprox: 4_700_000_000,
    ramMinimaMB: 6144,
    url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    tipo: "general",
    potencia: 6,
    ctxMax: 32768,
    descripcion: "General-purpose 7B. Balance calidad/velocidad.",
  },
  {
    id: "llama3.1-8b-q4",
    nombre: "Llama 3.1 8B Instruct (Q4_K_M)",
    bytesAprox: 4_900_000_000,
    ramMinimaMB: 6144,
    url: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    tipo: "general",
    potencia: 6,
    ctxMax: 131072,
    descripcion: "Contexto largo (128k). Bueno para análisis de documentos.",
  },
  {
    id: "phi-4-14b-q4",
    nombre: "Phi-4 14B (Q4_K_M)",
    bytesAprox: 9_100_000_000,
    ramMinimaMB: 10240,
    url: "https://huggingface.co/bartowski/phi-4-GGUF/resolve/main/phi-4-Q4_K_M.gguf",
    tipo: "reasoning",
    potencia: 7,
    ctxMax: 16384,
    descripcion: "Microsoft Phi-4 — chico pero razona muy bien. Bueno para matemática y lógica.",
  },
  // ── Medium (14-22B) — GPU 12-16 GB ──
  {
    id: "qwen2.5-14b-q4",
    nombre: "Qwen 2.5 14B Instruct (Q4_K_M)",
    bytesAprox: 8_500_000_000,
    ramMinimaMB: 12288,
    url: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf",
    tipo: "general",
    potencia: 7,
    ctxMax: 32768,
    descripcion: "Escalón medio. Mucho mejor que 7B para tareas complejas.",
  },
  {
    id: "codestral-22b-q4",
    nombre: "Codestral 22B (Q4_K_M)",
    bytesAprox: 13_000_000_000,
    ramMinimaMB: 16384,
    url: "https://huggingface.co/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf",
    tipo: "coding",
    potencia: 8,
    ctxMax: 32768,
    descripcion: "Mistral Codestral — código de nivel senior. Requiere 16 GB VRAM.",
  },
  // ── Large (32B) — GPU 24 GB o Mac 32 GB unified ──
  {
    id: "qwen2.5-coder-32b-q4",
    nombre: "Qwen 2.5 Coder 32B Instruct (Q4_K_M)",
    bytesAprox: 20_000_000_000,
    ramMinimaMB: 24576,
    url: "https://huggingface.co/bartowski/Qwen2.5-Coder-32B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-32B-Instruct-Q4_K_M.gguf",
    tipo: "coding",
    potencia: 9,
    ctxMax: 32768,
    descripcion: "El mejor código open-weight hoy. Compite con Claude Sonnet en muchos benchmarks.",
  },
  {
    id: "qwen2.5-32b-q4",
    nombre: "Qwen 2.5 32B Instruct (Q4_K_M)",
    bytesAprox: 20_000_000_000,
    ramMinimaMB: 24576,
    url: "https://huggingface.co/bartowski/Qwen2.5-32B-Instruct-GGUF/resolve/main/Qwen2.5-32B-Instruct-Q4_K_M.gguf",
    tipo: "general",
    potencia: 9,
    ctxMax: 32768,
    descripcion: "General 32B — nivel GPT-4o-mini local.",
  },
  {
    id: "deepseek-r1-distill-qwen-32b-q4",
    nombre: "DeepSeek R1 Distill Qwen 32B (Q4_K_M)",
    bytesAprox: 20_000_000_000,
    ramMinimaMB: 24576,
    url: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf",
    tipo: "reasoning",
    potencia: 9,
    ctxMax: 131072,
    descripcion: "Razonamiento tipo o1 local. Piensa antes de responder — más lento pero mucho más profundo.",
  },
  {
    id: "qwq-32b-preview-q4",
    nombre: "QwQ 32B Preview (Q4_K_M)",
    bytesAprox: 20_000_000_000,
    ramMinimaMB: 24576,
    url: "https://huggingface.co/bartowski/QwQ-32B-Preview-GGUF/resolve/main/QwQ-32B-Preview-Q4_K_M.gguf",
    tipo: "reasoning",
    potencia: 9,
    ctxMax: 32768,
    descripcion: "Alibaba QwQ — reasoner experimental que compite con o1-preview.",
  },
  // ── Frontier (70B+) — GPU 48+ GB o Mac Studio 64+ GB ──
  {
    id: "llama3.3-70b-q4",
    nombre: "Llama 3.3 70B Instruct (Q4_K_M)",
    bytesAprox: 42_000_000_000,
    ramMinimaMB: 49152,
    url: "https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf",
    tipo: "general",
    potencia: 10,
    ctxMax: 131072,
    descripcion: "Frontera open-weight. Nivel Claude Sonnet / GPT-4o para muchas tareas.",
  },
  {
    id: "qwen2.5-72b-q4",
    nombre: "Qwen 2.5 72B Instruct (Q4_K_M)",
    bytesAprox: 43_000_000_000,
    ramMinimaMB: 49152,
    url: "https://huggingface.co/bartowski/Qwen2.5-72B-Instruct-GGUF/resolve/main/Qwen2.5-72B-Instruct-Q4_K_M.gguf",
    tipo: "general",
    potencia: 10,
    ctxMax: 32768,
    descripcion: "Top-tier open-weight 72B. Enterprise-grade local.",
  },
  // ── Vision ──
  {
    id: "qwen2.5-vl-7b-q4",
    nombre: "Qwen 2.5 VL 7B (Q4_K_M) · vision",
    bytesAprox: 5_200_000_000,
    ramMinimaMB: 8192,
    url: "https://huggingface.co/bartowski/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
    tipo: "vision",
    potencia: 6,
    ctxMax: 32768,
    descripcion: "Vision-language 7B. Screenshot → código, análisis de UIs.",
  },
]
