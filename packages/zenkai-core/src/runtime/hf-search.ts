// HuggingFace search — descubre modelos GGUF disponibles para descargar.
// Reemplaza LM Studio "Model Explorer" con búsqueda en HF real.
//
// Estrategia:
//   - HF search API: GET https://huggingface.co/api/models?search=<query>&filter=gguf
//   - Para cada modelo, listar sus archivos .gguf via /api/models/<id>/tree
//   - Devolver URLs directas listas para pasar a downloadGguf.
//
// Todo público, sin API key. Cache in-memory 5 min para no martillar HF.

export type HfModel = {
  id: string        // "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF"
  autor: string     // "bartowski"
  descargas: number
  likes: number
  updatedAt: string
  tags: string[]
}

export type HfGgufFile = {
  path: string       // "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf"
  sizeMB?: number    // según cabecera si viene
  url: string        // URL directa de descarga
  quant: string      // "Q4_K_M", "Q5_K_M", etc — inferida del nombre
}

const HF_API = "https://huggingface.co/api"
const cache = new Map<string, { at: number; data: unknown }>()
const CACHE_TTL_MS = 5 * 60_000

async function fetchCached<T>(url: string, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T
  const res = await fetch(url, { signal: opts.signal ?? AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`HF HTTP ${res.status} ${url}`)
  const data = (await res.json()) as T
  cache.set(url, { at: Date.now(), data })
  return data
}

/**
 * Busca modelos GGUF por query. Devuelve los top N ordenados por popularidad.
 * Filtra a modelos que tienen el tag "gguf".
 */
export async function buscarModelosHf(query: string, limit = 20): Promise<HfModel[]> {
  const q = encodeURIComponent(query.trim())
  const url = `${HF_API}/models?search=${q}&filter=gguf&sort=downloads&direction=-1&limit=${limit}&full=true`
  const list = await fetchCached<Array<Record<string, unknown>>>(url)
  return list.map(mapearHfModel).filter((m): m is HfModel => !!m)
}

/**
 * Lista los archivos .gguf de un modelo. Cada archivo suele ser una quantización.
 * El caller elige cuál descargar (Q4_K_M por default, buen balance).
 */
export async function listarGgufsDeModelo(modelId: string): Promise<HfGgufFile[]> {
  const url = `${HF_API}/models/${encodeURIComponent(modelId)}/tree/main`
  const files = await fetchCached<Array<{ path?: string; size?: number; type?: string }>>(url)
  return files
    .filter((f) => f.type === "file" && f.path?.toLowerCase().endsWith(".gguf"))
    .map((f) => ({
      path: f.path!,
      sizeMB: f.size ? Math.round(f.size / (1024 * 1024)) : undefined,
      url: `https://huggingface.co/${modelId}/resolve/main/${encodeURIComponent(f.path!)}`,
      quant: extraerQuant(f.path!),
    }))
    .sort((a, b) => rankQuant(a.quant) - rankQuant(b.quant))
}

/** Extrae la quant del nombre del archivo — ej. "Q4_K_M", "Q5_K_M", "F16". */
export function extraerQuant(filename: string): string {
  const m = /(?:^|[-.])(?:IQ[0-9]+(?:_[A-Z0-9]+)*|Q[0-9]+_[A-Z0-9_]+|F16|F32|BF16)/i.exec(filename)
  return m?.[0]?.replace(/^[-.]/, "").toUpperCase() ?? "unknown"
}

/**
 * Prioridad de quants — menor es "mejor default" para el usuario típico
 * (balance tamaño/calidad). Q4_K_M es el sweet spot universal.
 */
function rankQuant(quant: string): number {
  const orden = ["Q4_K_M", "Q5_K_M", "Q4_K_S", "Q5_K_S", "Q6_K", "Q4_0", "Q3_K_M", "Q8_0", "F16", "F32", "BF16"]
  const idx = orden.indexOf(quant)
  return idx < 0 ? 999 : idx
}

function mapearHfModel(raw: Record<string, unknown>): HfModel | undefined {
  const id = String(raw.id ?? raw.modelId ?? "")
  if (!id) return undefined
  const [autor] = id.split("/")
  return {
    id,
    autor: autor ?? "unknown",
    descargas: Number(raw.downloads ?? 0),
    likes: Number(raw.likes ?? 0),
    updatedAt: String(raw.lastModified ?? raw.updatedAt ?? ""),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
  }
}

/** Limpia el cache de la sesión — útil en tests o al forzar refresh. */
export function limpiarCacheHf(): void {
  cache.clear()
}
