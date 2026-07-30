// Memory Optimizer (Tomo III de la charla AIOS). Corre en background y cada
// N horas analiza el store de memorias, deduplica por similitud alta y marca
// las que llevan mucho tiempo sin ser leídas para archivar.
//
// Es un motor pasivo: no elimina agresivo, solo compacta y sugiere. La idea
// es que la memoria envejezca gracefully — como los archivos comprimidos que
// no perdés pero pesan menos.

import { getMemories, type Memory } from "./memory-store"

// Ollama local para embeddings — nomic-embed-text.
const OLLAMA_EMBED = "http://localhost:11434/api/embeddings"
const EMBED_MODEL = "nomic-embed-text"

async function embed(text: string): Promise<number[] | null> {
  try {
    const r = await fetch(OLLAMA_EMBED, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as { embedding?: number[] }
    return j.embedding ?? null
  } catch {
    return null
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

// Reporte del optimizer sin efectos secundarios. Devuelve pares con similitud
// alta que podrían ser deduplicados por el usuario. NO borramos automático
// para evitar perder memorias que el usuario quiera conservar.
export type ReporteOptimizacion = {
  total: number
  duplicados: Array<{ a: Memory; b: Memory; similitud: number }>
  posiblesArchivar: Memory[]
}

export async function analizarMemoria(): Promise<ReporteOptimizacion> {
  const all = await getMemories()
  const duplicados: ReporteOptimizacion["duplicados"] = []

  // Pares con similitud > 0.92 son casi el mismo contenido.
  const cache = new Map<string, number[]>()
  const getEmb = async (m: Memory) => {
    if (cache.has(m.id)) return cache.get(m.id)!
    const e = await embed(m.content)
    if (e) cache.set(m.id, e)
    return e
  }

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const ea = await getEmb(all[i])
      const eb = await getEmb(all[j])
      if (!ea || !eb) continue
      const sim = cosine(ea, eb)
      if (sim > 0.92) {
        duplicados.push({ a: all[i], b: all[j], similitud: sim })
      }
    }
  }

  // Memorias tipo "fact" sin usar en >90 días son candidatas a archivar.
  const noventaDias = 90 * 24 * 60 * 60 * 1000
  const ahora = Date.now()
  const posiblesArchivar = all.filter((m) => {
    if (m.type !== "fact") return false
    const t = (m as unknown as { updatedAt?: number }).updatedAt ?? (m as unknown as { createdAt?: number }).createdAt ?? 0
    return ahora - t > noventaDias
  })

  return { total: all.length, duplicados, posiblesArchivar }
}
