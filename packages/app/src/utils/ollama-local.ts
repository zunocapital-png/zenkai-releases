// Descarga y listado de modelos locales de Ollama, compartido entre el panel de
// Diagnóstico y el onboarding de bienvenida. Habla directo con Ollama en localhost
// (no pasa por el servidor de ZENKAI), así que no necesita cambios en main/preload.

const OLLAMA_HOST = "http://localhost:11434"

export type CategoriaModelo = "codigo" | "chat" | "razonamiento" | "vision" | "embeddings" | "mini"

export type ModeloLocal = {
  id: string
  nombre: string
  nota: string
  tam: string
  categoria: CategoriaModelo
  destacado?: boolean
}

export const CATEGORIAS: { id: CategoriaModelo; label: string; emoji: string }[] = [
  { id: "codigo", label: "Programación", emoji: "💻" },
  { id: "razonamiento", label: "Razonamiento", emoji: "🧠" },
  { id: "chat", label: "Chat general", emoji: "💬" },
  { id: "vision", label: "Visión (imágenes)", emoji: "👁️" },
  { id: "embeddings", label: "Embeddings (RAG/búsqueda)", emoji: "🔎" },
  { id: "mini", label: "Mini (PCs modestas)", emoji: "🪶" },
]

// Catálogo curado de modelos populares de Ollama, con tamaños aproximados del
// quant por defecto. No es "todos los que existen" (Ollama no publica esa lista),
// pero cubre lo mejor; para cualquier otro, usá el campo de descarga por nombre.
export const CATALOGO_LOCAL: ModeloLocal[] = [
  // Programación
  { id: "qwen2.5-coder:7b", nombre: "Qwen2.5 Coder 7B", nota: "El mejor para código local", tam: "~4.7 GB", categoria: "codigo", destacado: true },
  { id: "qwen2.5-coder:1.5b", nombre: "Qwen2.5 Coder 1.5B", nota: "Código ultra liviano", tam: "~1.0 GB", categoria: "codigo" },
  { id: "qwen2.5-coder:14b", nombre: "Qwen2.5 Coder 14B", nota: "Código, más preciso", tam: "~9.0 GB", categoria: "codigo" },
  { id: "qwen2.5-coder:32b", nombre: "Qwen2.5 Coder 32B", nota: "Código pro (PC potente)", tam: "~20 GB", categoria: "codigo" },
  { id: "deepseek-coder-v2:16b", nombre: "DeepSeek Coder V2 16B", nota: "Código, gran contexto", tam: "~8.9 GB", categoria: "codigo" },
  { id: "codellama:7b", nombre: "Code Llama 7B", nota: "Clásico de Meta para código", tam: "~3.8 GB", categoria: "codigo" },
  { id: "codegemma:7b", nombre: "CodeGemma 7B", nota: "Código, de Google", tam: "~5.0 GB", categoria: "codigo" },
  { id: "starcoder2:7b", nombre: "StarCoder2 7B", nota: "Autocompletado y código", tam: "~4.0 GB", categoria: "codigo" },

  // Razonamiento
  { id: "qwen3:8b", nombre: "Qwen3 8B", nota: "Razonamiento y chat, equilibrado", tam: "~5.2 GB", categoria: "razonamiento", destacado: true },
  { id: "qwen3:14b", nombre: "Qwen3 14B", nota: "Razonamiento fuerte", tam: "~9.0 GB", categoria: "razonamiento" },
  { id: "deepseek-r1:7b", nombre: "DeepSeek R1 7B", nota: "Piensa paso a paso", tam: "~4.7 GB", categoria: "razonamiento" },
  { id: "deepseek-r1:8b", nombre: "DeepSeek R1 8B", nota: "Razonamiento, versión 8B", tam: "~5.2 GB", categoria: "razonamiento" },
  { id: "deepseek-r1:1.5b", nombre: "DeepSeek R1 1.5B", nota: "Razonamiento mini", tam: "~1.1 GB", categoria: "razonamiento" },

  // Chat general
  { id: "llama3.1:8b", nombre: "Llama 3.1 8B", nota: "Uso general equilibrado", tam: "~4.9 GB", categoria: "chat", destacado: true },
  { id: "llama3.2:3b", nombre: "Llama 3.2 3B", nota: "General, liviano", tam: "~2.0 GB", categoria: "chat" },
  { id: "gemma2:9b", nombre: "Gemma 2 9B", nota: "General, de Google", tam: "~5.4 GB", categoria: "chat" },
  { id: "gemma2:2b", nombre: "Gemma 2 2B", nota: "General compacto", tam: "~1.6 GB", categoria: "chat" },
  { id: "mistral:7b", nombre: "Mistral 7B", nota: "Rápido y sólido", tam: "~4.1 GB", categoria: "chat" },
  { id: "qwen2.5:7b", nombre: "Qwen2.5 7B", nota: "General, muy capaz", tam: "~4.7 GB", categoria: "chat" },

  // Visión
  { id: "qwen2.5vl:7b", nombre: "Qwen2.5 VL 7B", nota: "Entiende imágenes", tam: "~6.0 GB", categoria: "vision", destacado: true },
  { id: "llama3.2-vision:11b", nombre: "Llama 3.2 Vision 11B", nota: "Visión de Meta", tam: "~7.9 GB", categoria: "vision" },
  { id: "llava:7b", nombre: "LLaVA 7B", nota: "Visión + chat clásico", tam: "~4.7 GB", categoria: "vision" },
  { id: "moondream", nombre: "Moondream", nota: "Visión mini y veloz", tam: "~1.7 GB", categoria: "vision" },

  // Embeddings
  { id: "nomic-embed-text", nombre: "Nomic Embed Text", nota: "Para RAG/búsqueda semántica", tam: "~274 MB", categoria: "embeddings" },
  { id: "mxbai-embed-large", nombre: "mxbai Embed Large", nota: "Embeddings de alta calidad", tam: "~670 MB", categoria: "embeddings" },

  // Mini
  { id: "llama3.2:1b", nombre: "Llama 3.2 1B", nota: "Corre en casi cualquier PC", tam: "~1.3 GB", categoria: "mini" },
  { id: "phi3:mini", nombre: "Phi-3 Mini", nota: "Pequeño y listo, de Microsoft", tam: "~2.2 GB", categoria: "mini" },
  { id: "smollm2:1.7b", nombre: "SmolLM2 1.7B", nota: "Diminuto y rápido", tam: "~1.8 GB", categoria: "mini" },
  { id: "tinyllama", nombre: "TinyLlama", nota: "El más liviano para probar", tam: "~640 MB", categoria: "mini" },

  // ── Más opciones (segunda tanda) ──
  // Programación
  { id: "qwen2.5-coder:3b", nombre: "Qwen2.5 Coder 3B", nota: "Código liviano", tam: "~1.9 GB", categoria: "codigo" },
  { id: "codestral:22b", nombre: "Codestral 22B", nota: "Código pro, de Mistral", tam: "~13 GB", categoria: "codigo" },
  { id: "granite-code:8b", nombre: "Granite Code 8B", nota: "Código, de IBM", tam: "~4.6 GB", categoria: "codigo" },
  { id: "starcoder2:3b", nombre: "StarCoder2 3B", nota: "Autocompletado liviano", tam: "~1.7 GB", categoria: "codigo" },
  { id: "deepseek-coder:6.7b", nombre: "DeepSeek Coder 6.7B", nota: "Código, clásico", tam: "~3.8 GB", categoria: "codigo" },
  // Razonamiento
  { id: "deepseek-r1:14b", nombre: "DeepSeek R1 14B", nota: "Razonamiento fuerte", tam: "~9.0 GB", categoria: "razonamiento" },
  { id: "deepseek-r1:32b", nombre: "DeepSeek R1 32B", nota: "Razonamiento pro (PC potente)", tam: "~20 GB", categoria: "razonamiento" },
  { id: "phi4:14b", nombre: "Phi-4 14B", nota: "Razonamiento, de Microsoft", tam: "~9.1 GB", categoria: "razonamiento" },
  { id: "qwq:32b", nombre: "QwQ 32B", nota: "Razonamiento profundo (PC potente)", tam: "~20 GB", categoria: "razonamiento" },
  // Chat general
  { id: "gemma3:4b", nombre: "Gemma 3 4B", nota: "General moderno, de Google", tam: "~3.3 GB", categoria: "chat" },
  { id: "gemma3:12b", nombre: "Gemma 3 12B", nota: "General, más capaz", tam: "~8.1 GB", categoria: "chat" },
  { id: "gemma3:27b", nombre: "Gemma 3 27B", nota: "General pro (PC potente)", tam: "~17 GB", categoria: "chat" },
  { id: "mistral-nemo:12b", nombre: "Mistral Nemo 12B", nota: "General, gran contexto", tam: "~7.1 GB", categoria: "chat" },
  { id: "mixtral:8x7b", nombre: "Mixtral 8x7B", nota: "Mezcla de expertos (PC potente)", tam: "~26 GB", categoria: "chat" },
  { id: "phi4-mini:3.8b", nombre: "Phi-4 Mini", nota: "General compacto", tam: "~2.5 GB", categoria: "chat" },
  { id: "olmo2:13b", nombre: "OLMo 2 13B", nota: "General abierto (AI2)", tam: "~8.4 GB", categoria: "chat" },
  // Visión
  { id: "llava-llama3:8b", nombre: "LLaVA-Llama3 8B", nota: "Visión sobre Llama 3", tam: "~5.5 GB", categoria: "vision" },
  { id: "minicpm-v:8b", nombre: "MiniCPM-V 8B", nota: "Visión eficiente", tam: "~5.5 GB", categoria: "vision" },
  { id: "llava:13b", nombre: "LLaVA 13B", nota: "Visión, más grande", tam: "~8.0 GB", categoria: "vision" },
  // Embeddings
  { id: "bge-m3", nombre: "BGE-M3", nota: "Embeddings multilingües", tam: "~1.2 GB", categoria: "embeddings" },
  { id: "all-minilm", nombre: "all-MiniLM", nota: "Embeddings mini y rápidos", tam: "~46 MB", categoria: "embeddings" },
  { id: "snowflake-arctic-embed", nombre: "Snowflake Arctic Embed", nota: "Embeddings de búsqueda", tam: "~669 MB", categoria: "embeddings" },
  // Mini
  { id: "gemma3:1b", nombre: "Gemma 3 1B", nota: "Diminuto, de Google", tam: "~815 MB", categoria: "mini" },
  { id: "qwen2.5:0.5b", nombre: "Qwen2.5 0.5B", nota: "El más chico de Qwen", tam: "~398 MB", categoria: "mini" },
  { id: "qwen2.5:1.5b", nombre: "Qwen2.5 1.5B", nota: "Chico y capaz", tam: "~986 MB", categoria: "mini" },
  { id: "phi3.5", nombre: "Phi-3.5 Mini", nota: "Pequeño y actualizado", tam: "~2.2 GB", categoria: "mini" },
]

// Top picks para el onboarding de bienvenida (no abrumar al recién llegado).
export const MODELOS_RECOMENDADOS: ModeloLocal[] = CATALOGO_LOCAL.filter((m) => m.destacado)

// RAM aproximada del equipo (GB). navigator.deviceMemory se topa en 8 en Chromium,
// así que sirve para detectar PCs modestas, no para distinguir 16 de 64 GB.
export function ramAproxGB(): number | undefined {
  const v = (navigator as unknown as { deviceMemory?: number }).deviceMemory
  return typeof v === "number" && v > 0 ? v : undefined
}

function parseGB(tam: string): number {
  const gb = tam.match(/([\d.]+)\s*GB/i)
  if (gb) return parseFloat(gb[1])
  const mb = tam.match(/([\d.]+)\s*MB/i)
  return mb ? parseFloat(mb[1]) / 1024 : 0
}

// Solo advertimos a PCs claramente modestas (RAM reportada ≤ 4 GB). No advertimos
// con 8 (podría ser 8 o 64 GB) para no molestar a las potentes con falsos avisos.
export function advertenciaPc(tam: string, ramGB: number | undefined): string | undefined {
  if (ramGB === undefined || ramGB > 4) return undefined
  return parseGB(tam) >= 5 ? "Tu PC puede quedar justa para este modelo" : undefined
}

// Presupuesto de memoria para modelos locales: si hay GPU dedicada, el modelo corre
// mejor en VRAM; si no, usamos ~60% de la RAM del sistema.
export function presupuestoGB(ramGB: number, vramGB: number | null): number {
  return vramGB && vramGB > 0 ? vramGB : Math.max(0, ramGB * 0.6)
}

// Un modelo "entra" si su tamaño cabe cómodo (~90%) en el presupuesto.
export function entraEnPc(tam: string, budgetGB: number): boolean {
  return parseGB(tam) <= budgetGB * 0.9
}

// El mejor modelo que le entra a esta PC: el destacado más grande que quepa; si
// ninguno destacado entra, el más grande cualquiera; si nada, el más chico del catálogo.
export function modeloRecomendado(budgetGB: number): ModeloLocal {
  const porTam = (m: ModeloLocal) => parseGB(m.tam)
  const entran = CATALOGO_LOCAL.filter((m) => entraEnPc(m.tam, budgetGB))
  const destacados = entran.filter((m) => m.destacado).sort((a, b) => porTam(b) - porTam(a))
  if (destacados[0]) return destacados[0]
  const grande = entran.sort((a, b) => porTam(b) - porTam(a))[0]
  if (grande) return grande
  return [...CATALOGO_LOCAL].sort((a, b) => porTam(a) - porTam(b))[0]
}

// Progreso de una descarga: pct 0..100, o -1 = error.
export type Descarga = { pct: number; estado: string; error?: string }

// Lista los modelos ya descargados (tags) desde Ollama. [] si está apagado.
export async function listarModelosOllama(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = (await res.json()) as { models?: Array<{ name?: string }> }
    return (data.models ?? []).map((m) => m?.name).filter((n): n is string => typeof n === "string")
  } catch {
    return []
  }
}

// Un modelo cuenta como instalado si coincide el tag exacto o el nombre base.
export function estaInstalado(id: string, instalados: string[]): boolean {
  return instalados.some((m) => m === id || m.split(":")[0] === id.split(":")[0])
}

// Descarga un modelo con Ollama (/api/pull) reportando progreso en vivo.
// Llama a onProgress con cada actualización; resuelve al terminar, rechaza en error.
export async function descargarModeloOllama(id: string, onProgress: (d: Descarga) => void): Promise<void> {
  onProgress({ pct: 0, estado: "Iniciando…" })
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: id, stream: true }),
  })
  if (!res.ok || !res.body) throw new Error("No se pudo iniciar la descarga. ¿Ollama está prendido?")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let ultimoPct = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      let obj: { status?: string; total?: number; completed?: number; error?: string }
      try {
        obj = JSON.parse(line)
      } catch {
        continue
      }
      if (obj.error) throw new Error(obj.error)
      if (obj.total) ultimoPct = Math.round(((obj.completed ?? 0) / obj.total) * 100)
      onProgress({ pct: ultimoPct, estado: obj.status ?? "Descargando…" })
    }
  }
  onProgress({ pct: 100, estado: "Listo" })
}
