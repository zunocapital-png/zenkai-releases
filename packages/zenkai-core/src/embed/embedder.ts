// Embedder simple sobre Ollama (nomic-embed-text). Se usa para semantic cache
// del orchestrator y para memoria semántica. Es una interfaz — cualquier
// implementación que dé embeddings vale (podés swappear a OpenAI o local).

export type Embedder = {
  /** Vectoriza un texto. Devuelve null si falla (offline, sin modelo, etc.). */
  embed: (text: string) => Promise<number[] | null>
}

export type OllamaEmbedderOptions = {
  baseURL?: string
  model?: string
  timeoutMs?: number
}

/** Embedder que llama /api/embeddings de Ollama con nomic-embed-text. */
export function crearOllamaEmbedder(opts: OllamaEmbedderOptions = {}): Embedder {
  const baseURL = opts.baseURL ?? "http://localhost:11434"
  const model = opts.model ?? "nomic-embed-text"
  const timeoutMs = opts.timeoutMs ?? 3000
  return {
    embed: async (text: string) => {
      try {
        const r = await fetch(`${baseURL}/api/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, prompt: text }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!r.ok) return null
        const j = (await r.json()) as { embedding?: number[] }
        return j.embedding ?? null
      } catch {
        return null
      }
    },
  }
}

/** Similitud coseno entre 2 vectores. Rango [-1, 1]. Devuelve 0 si dims no matchean. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}
