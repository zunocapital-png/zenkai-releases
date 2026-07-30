// Descarga y listado de modelos locales de Ollama, compartido entre el panel de
// Diagnóstico y el onboarding de bienvenida. Habla directo con Ollama en localhost
// (no pasa por el servidor de ZENKAI), así que no necesita cambios en main/preload.

const OLLAMA_HOST = "http://localhost:11434"

export type CategoriaModelo = "codigo" | "chat" | "razonamiento" | "matematica" | "vision" | "embeddings" | "mini"

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
  { id: "matematica", label: "Matemática", emoji: "🔢" },
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

  // ── Más opciones (tercera tanda) ──
  // Programación
  { id: "opencoder:8b", nombre: "OpenCoder 8B", nota: "Código abierto y capaz", tam: "~4.7 GB", categoria: "codigo" },
  { id: "yi-coder:9b", nombre: "Yi-Coder 9B", nota: "Código, gran contexto", tam: "~5.0 GB", categoria: "codigo" },
  { id: "granite-code:20b", nombre: "Granite Code 20B", nota: "Código pro, de IBM", tam: "~12 GB", categoria: "codigo" },
  { id: "codellama:13b", nombre: "Code Llama 13B", nota: "Código, más grande", tam: "~7.4 GB", categoria: "codigo" },
  { id: "sqlcoder:7b", nombre: "SQLCoder 7B", nota: "Especialista en SQL", tam: "~4.1 GB", categoria: "codigo" },
  // Razonamiento
  { id: "qwen3:4b", nombre: "Qwen3 4B", nota: "Razonamiento liviano", tam: "~2.6 GB", categoria: "razonamiento" },
  { id: "qwen3:30b", nombre: "Qwen3 30B", nota: "Razonamiento pro (PC potente)", tam: "~18 GB", categoria: "razonamiento" },
  { id: "phi4-reasoning:14b", nombre: "Phi-4 Reasoning 14B", nota: "Piensa paso a paso, MS", tam: "~11 GB", categoria: "razonamiento" },
  { id: "deepseek-r1:70b", nombre: "DeepSeek R1 70B", nota: "Razonamiento máximo (PC muy potente)", tam: "~43 GB", categoria: "razonamiento" },
  // Chat general
  { id: "llama3.3:70b", nombre: "Llama 3.3 70B", nota: "Tope de Meta (PC muy potente)", tam: "~43 GB", categoria: "chat" },
  { id: "qwen2.5:14b", nombre: "Qwen2.5 14B", nota: "General, muy capaz", tam: "~9.0 GB", categoria: "chat" },
  { id: "qwen2.5:32b", nombre: "Qwen2.5 32B", nota: "General pro (PC potente)", tam: "~20 GB", categoria: "chat" },
  { id: "mistral-small:24b", nombre: "Mistral Small 24B", nota: "General potente", tam: "~14 GB", categoria: "chat" },
  { id: "command-r:35b", nombre: "Command R 35B", nota: "RAG y herramientas, Cohere", tam: "~20 GB", categoria: "chat" },
  { id: "granite3.3:8b", nombre: "Granite 3.3 8B", nota: "General, de IBM", tam: "~4.9 GB", categoria: "chat" },
  { id: "aya-expanse:8b", nombre: "Aya Expanse 8B", nota: "Multilingüe (23 idiomas)", tam: "~5.1 GB", categoria: "chat" },
  { id: "glm4:9b", nombre: "GLM-4 9B", nota: "General, fuerte en chino/inglés", tam: "~5.5 GB", categoria: "chat" },
  { id: "hermes3:8b", nombre: "Hermes 3 8B", nota: "General sin filtros, Nous", tam: "~4.7 GB", categoria: "chat" },
  { id: "dolphin3:8b", nombre: "Dolphin 3 8B", nota: "General, muy servicial", tam: "~4.9 GB", categoria: "chat" },
  // Visión
  { id: "qwen2.5vl:3b", nombre: "Qwen2.5 VL 3B", nota: "Visión liviana", tam: "~3.2 GB", categoria: "vision" },
  { id: "qwen2.5vl:32b", nombre: "Qwen2.5 VL 32B", nota: "Visión pro (PC potente)", tam: "~21 GB", categoria: "vision" },
  { id: "llava-phi3", nombre: "LLaVA-Phi3", nota: "Visión mini sobre Phi-3", tam: "~2.9 GB", categoria: "vision" },
  { id: "granite3.2-vision:2b", nombre: "Granite 3.2 Vision 2B", nota: "Visión de documentos, IBM", tam: "~2.4 GB", categoria: "vision" },
  // Embeddings
  { id: "granite-embedding:278m", nombre: "Granite Embedding 278M", nota: "Embeddings de IBM", tam: "~563 MB", categoria: "embeddings" },
  { id: "paraphrase-multilingual", nombre: "Paraphrase Multilingual", nota: "Embeddings multi-idioma", tam: "~563 MB", categoria: "embeddings" },
  // Mini
  { id: "qwen3:0.6b", nombre: "Qwen3 0.6B", nota: "Diminuto y moderno", tam: "~523 MB", categoria: "mini" },
  { id: "qwen3:1.7b", nombre: "Qwen3 1.7B", nota: "Chico y capaz", tam: "~1.4 GB", categoria: "mini" },
  { id: "smollm2:360m", nombre: "SmolLM2 360M", nota: "Ínfimo, para probar", tam: "~726 MB", categoria: "mini" },
  { id: "granite3.1-moe:1b", nombre: "Granite 3.1 MoE 1B", nota: "Mini mezcla de expertos", tam: "~1.4 GB", categoria: "mini" },

  // ── Más opciones (cuarta tanda) — verificados en la librería de Ollama ──
  // Programación
  { id: "qwen3-coder", nombre: "Qwen3 Coder", nota: "Nuevo modelo de código de Qwen", tam: "~19 GB", categoria: "codigo" },
  { id: "deepcoder:14b", nombre: "DeepCoder 14B", nota: "Código abierto y capaz", tam: "~9.0 GB", categoria: "codigo" },
  { id: "devstral", nombre: "Devstral", nota: "Agente de código de Mistral", tam: "~14 GB", categoria: "codigo" },
  { id: "codegeex4:9b", nombre: "CodeGeeX4 9B", nota: "Código multilingüe (Zhipu)", tam: "~5.5 GB", categoria: "codigo" },
  { id: "codeqwen:7b", nombre: "CodeQwen 7B", nota: "Código, base de Qwen", tam: "~4.2 GB", categoria: "codigo" },
  { id: "magicoder:7b", nombre: "Magicoder 7B", nota: "Código con datos OSS-Instruct", tam: "~3.8 GB", categoria: "codigo" },
  { id: "phind-codellama:34b", nombre: "Phind CodeLlama 34B", nota: "Código pro (PC potente)", tam: "~19 GB", categoria: "codigo" },
  { id: "stable-code:3b", nombre: "Stable Code 3B", nota: "Código liviano (Stability)", tam: "~1.6 GB", categoria: "codigo" },
  { id: "starcoder:7b", nombre: "StarCoder 7B", nota: "Autocompletado clásico", tam: "~4.3 GB", categoria: "codigo" },
  { id: "codeup:13b", nombre: "CodeUp 13B", nota: "Código sobre Llama 2", tam: "~7.4 GB", categoria: "codigo" },
  { id: "qwen2.5-coder:0.5b", nombre: "Qwen2.5 Coder 0.5B", nota: "Código diminuto", tam: "~398 MB", categoria: "codigo" },

  // Razonamiento
  { id: "gpt-oss:20b", nombre: "GPT-OSS 20B", nota: "Modelo abierto de OpenAI", tam: "~14 GB", categoria: "razonamiento", destacado: true },
  { id: "magistral", nombre: "Magistral", nota: "Razonamiento de Mistral", tam: "~14 GB", categoria: "razonamiento" },
  { id: "openthinker:7b", nombre: "OpenThinker 7B", nota: "Cadena de pensamiento abierta", tam: "~4.7 GB", categoria: "razonamiento" },
  { id: "deepscaler:1.5b", nombre: "DeepScaleR 1.5B", nota: "Razonamiento matemático mini", tam: "~1.1 GB", categoria: "razonamiento" },
  { id: "exaone-deep:7.8b", nombre: "EXAONE Deep 7.8B", nota: "Razonamiento de LG", tam: "~4.8 GB", categoria: "razonamiento" },
  { id: "marco-o1:7b", nombre: "Marco-o1 7B", nota: "Razonamiento estilo o1", tam: "~4.7 GB", categoria: "razonamiento" },
  { id: "smallthinker:3b", nombre: "SmallThinker 3B", nota: "Razonamiento compacto", tam: "~3.6 GB", categoria: "razonamiento" },
  { id: "cogito:8b", nombre: "Cogito 8B", nota: "Híbrido razonamiento/chat", tam: "~4.9 GB", categoria: "razonamiento" },
  { id: "phi4-mini-reasoning:3.8b", nombre: "Phi-4 Mini Reasoning", nota: "Razonamiento compacto (MS)", tam: "~2.5 GB", categoria: "razonamiento" },

  // Matemática
  { id: "qwen2-math:7b", nombre: "Qwen2 Math 7B", nota: "Especialista en matemática", tam: "~4.4 GB", categoria: "matematica", destacado: true },
  { id: "mathstral:7b", nombre: "Mathstral 7B", nota: "Matemática, de Mistral", tam: "~4.1 GB", categoria: "matematica" },
  { id: "wizard-math:7b", nombre: "WizardMath 7B", nota: "Resolución de problemas", tam: "~4.1 GB", categoria: "matematica" },
  { id: "deepseek-math:7b", nombre: "DeepSeek Math 7B", nota: "Matemática avanzada", tam: "~4.0 GB", categoria: "matematica" },
  { id: "qwen2-math:1.5b", nombre: "Qwen2 Math 1.5B", nota: "Matemática liviana", tam: "~986 MB", categoria: "matematica" },

  // Chat general
  { id: "llama3:8b", nombre: "Llama 3 8B", nota: "El clásico de Meta", tam: "~4.7 GB", categoria: "chat" },
  { id: "llama2:7b", nombre: "Llama 2 7B", nota: "Clásico, muy compatible", tam: "~3.8 GB", categoria: "chat" },
  { id: "solar:10.7b", nombre: "SOLAR 10.7B", nota: "General potente (Upstage)", tam: "~6.1 GB", categoria: "chat" },
  { id: "yi:9b", nombre: "Yi 9B", nota: "General bilingüe (01.AI)", tam: "~5.0 GB", categoria: "chat" },
  { id: "openchat:7b", nombre: "OpenChat 7B", nota: "General afinado, muy sólido", tam: "~4.1 GB", categoria: "chat" },
  { id: "starling-lm:7b", nombre: "Starling 7B", nota: "General entrenado con RLAIF", tam: "~4.1 GB", categoria: "chat" },
  { id: "zephyr:7b", nombre: "Zephyr 7B", nota: "Asistente afinado", tam: "~4.1 GB", categoria: "chat" },
  { id: "neural-chat:7b", nombre: "Neural Chat 7B", nota: "General de Intel", tam: "~4.1 GB", categoria: "chat" },
  { id: "openhermes", nombre: "OpenHermes", nota: "General versátil (Nous)", tam: "~4.1 GB", categoria: "chat" },
  { id: "vicuna:7b", nombre: "Vicuna 7B", nota: "Clásico conversacional", tam: "~3.8 GB", categoria: "chat" },
  { id: "solar-pro", nombre: "SOLAR Pro", nota: "General de 22B, un solo GPU", tam: "~13 GB", categoria: "chat" },
  { id: "tulu3:8b", nombre: "Tülu 3 8B", nota: "General abierto (AI2)", tam: "~4.9 GB", categoria: "chat" },
  { id: "command-r7b", nombre: "Command R7B", nota: "RAG y tools, liviano (Cohere)", tam: "~5.1 GB", categoria: "chat" },
  { id: "athene-v2:72b", nombre: "Athene V2 72B", nota: "General tope (PC muy potente)", tam: "~44 GB", categoria: "chat" },
  { id: "dolphin-mixtral:8x7b", nombre: "Dolphin Mixtral 8x7B", nota: "Sin filtros (PC potente)", tam: "~26 GB", categoria: "chat" },
  { id: "dolphin-llama3:8b", nombre: "Dolphin Llama 3 8B", nota: "General muy servicial", tam: "~4.7 GB", categoria: "chat" },
  { id: "llama2-uncensored:7b", nombre: "Llama 2 Uncensored 7B", nota: "Sin filtros", tam: "~3.8 GB", categoria: "chat" },

  // Visión
  { id: "qwen3-vl", nombre: "Qwen3 VL", nota: "Visión de nueva generación", tam: "~6.0 GB", categoria: "vision" },
  { id: "medgemma:4b", nombre: "MedGemma 4B", nota: "Visión médica (Google)", tam: "~3.3 GB", categoria: "vision" },
  { id: "bakllava:7b", nombre: "BakLLaVA 7B", nota: "Visión sobre Mistral", tam: "~4.7 GB", categoria: "vision" },

  // Embeddings
  { id: "qwen3-embedding", nombre: "Qwen3 Embedding", nota: "Embeddings de nueva generación", tam: "~600 MB", categoria: "embeddings" },
  { id: "embeddinggemma", nombre: "EmbeddingGemma", nota: "Embeddings de Google", tam: "~622 MB", categoria: "embeddings" },
  { id: "snowflake-arctic-embed2", nombre: "Snowflake Arctic Embed 2", nota: "Embeddings multilingües", tam: "~1.2 GB", categoria: "embeddings" },
  { id: "bge-large", nombre: "BGE Large", nota: "Embeddings de alta calidad", tam: "~671 MB", categoria: "embeddings" },

  // Mini
  { id: "smollm:1.7b", nombre: "SmolLM 1.7B", nota: "Diminuto y rápido", tam: "~990 MB", categoria: "mini" },
  { id: "tinydolphin:1.1b", nombre: "TinyDolphin 1.1B", nota: "Mini servicial", tam: "~637 MB", categoria: "mini" },
  { id: "stablelm-zephyr:3b", nombre: "StableLM Zephyr 3B", nota: "Chico y afinado", tam: "~1.6 GB", categoria: "mini" },
  { id: "granite3-moe:1b", nombre: "Granite 3 MoE 1B", nota: "Mini mezcla de expertos (IBM)", tam: "~822 MB", categoria: "mini" },
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

// Presupuesto de memoria para modelos locales. Si hay GPU dedicada, el modelo corre
// mejor en VRAM. Si no, usamos la RAM LIBRE real (menos un colchón para el SO) — más
// honesto que un % de la RAM total, que ignora lo que el SO/navegador ya consumen.
export function presupuestoGB(ramGB: number, vramGB: number | null, freeRamGB?: number): number {
  if (vramGB && vramGB > 0) return vramGB
  if (typeof freeRamGB === "number" && freeRamGB > 0) return Math.max(0, freeRamGB - 1)
  return Math.max(0, ramGB * 0.6)
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

// Progreso de una descarga: pct 0..100, o -1 = error. detalle = "12 MB/s · faltan 2m".
export type Descarga = { pct: number; estado: string; error?: string; detalle?: string }

// Borra un modelo local de Ollama (DELETE /api/delete). Libera disco.
export async function borrarModeloOllama(name: string): Promise<void> {
  const res = await fetch(`${OLLAMA_HOST}/api/delete`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error("No se pudo borrar el modelo.")
}

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.round(n / 1024)} KB`
}
function fmtTiempo(seg: number): string {
  if (!(seg > 0) || !isFinite(seg)) return "…"
  if (seg >= 3600) return `${Math.round(seg / 3600)}h`
  if (seg >= 60) return `${Math.round(seg / 60)}m`
  return `${Math.round(seg)}s`
}

// ¿Ollama está vivo? true si /api/tags responde, false si está apagado/no instalado.
// listarModelosOllama devuelve [] en ambos casos, así que esto los distingue.
export async function ollamaVivo(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

// Mismo orden de preferencia que usa el router (zenkai-router.ts) para elegir en "Auto".
// Mantener sincronizado con PREFERENCIA de ahí.
const PREFERENCIA_AUTO = ["qwen2.5-coder", "qwen3", "qwen2.5", "llama3.1", "deepseek", "mistral", "gemma"]

// Qué modelo local usaría "Auto" ahora mismo (para mostrarlo en el chat con transparencia).
// undefined si no hay ningún modelo local instalado.
export async function modeloAutoResuelto(): Promise<string | undefined> {
  const tags = await listarModelosOllama()
  for (const pref of PREFERENCIA_AUTO) {
    const hit = tags.find((t) => t.startsWith(pref))
    if (hit) return hit
  }
  return tags[0]
}

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

// Un modelo cuenta como instalado si coincide el tag EXACTO (tolerando ':latest' implícito).
// No basta el nombre base: qwen2.5-coder:1.5b y :7b comparten base pero son modelos distintos.
export function estaInstalado(id: string, instalados: string[]): boolean {
  const norm = (s: string) => (s.includes(":") ? s : `${s}:latest`)
  const objetivo = norm(id)
  return instalados.some((m) => norm(m) === objetivo)
}

// Descarga un modelo con Ollama (/api/pull) reportando progreso en vivo.
// Llama a onProgress con cada actualización; resuelve al terminar, rechaza en error.
export async function descargarModeloOllama(
  id: string,
  onProgress: (d: Descarga) => void,
  signal?: AbortSignal,
): Promise<void> {
  onProgress({ pct: 0, estado: "Iniciando…" })
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: id, stream: true }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error("No se pudo iniciar la descarga. ¿Ollama está prendido?")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let ultimoPct = 0
  let lastBytes = 0
  let lastT = Date.now()
  let detalle: string | undefined
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
      if (obj.total) {
        const comp = obj.completed ?? 0
        ultimoPct = Math.round((comp / obj.total) * 100)
        const now = Date.now()
        const dt = (now - lastT) / 1000
        if (dt >= 0.7 && comp > lastBytes) {
          const speed = (comp - lastBytes) / dt // bytes/s
          const eta = speed > 0 ? (obj.total - comp) / speed : 0
          detalle = `${fmtBytes(speed)}/s · faltan ${fmtTiempo(eta)}`
          lastBytes = comp
          lastT = now
        }
      }
      onProgress({ pct: ultimoPct, estado: obj.status ?? "Descargando…", detalle })
    }
  }
  onProgress({ pct: 100, estado: "Listo" })
}
