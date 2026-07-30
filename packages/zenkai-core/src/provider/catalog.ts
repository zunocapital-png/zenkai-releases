import type { ProviderMeta } from "./types"

// Catálogo curado de providers OpenAI-compat conocidos.
// El usuario elige el que quiere, pega su API key (o deja vacío si es free),
// y Zenkai lo registra en el ProviderOrchestrator.
//
// Precios en USD por 1M tokens (input/output) — snapshot; se actualizan
// periódicamente. Marcamos "free" cuando el provider ofrece tier gratis real.
//
// Regiones ayudan al policy engine: si el usuario pide "local", solo local; si
// pide "eu", ordenamos providers EU primero (privacy-first).

export type ProviderCatalogEntry = ProviderMeta & {
  /** Categoría para UI (nube-frontera, nube-rápida, local, especializado). */
  categoria: "nube-frontera" | "nube-rapida" | "local" | "especializado" | "gratis-limitado"
  /** True si hay tier gratis real. */
  tieneFree?: boolean
  /** Modelos populares en este provider — sugeridos por default. */
  modelosPopulares?: string[]
  /** URL de registro (para "conseguir API key"). */
  urlRegistro?: string
  /** Descripción corta. */
  descripcion?: string
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  // ── LOCAL (100% offline) ──
  {
    name: "zenkai-engine", kind: "openai-compat", baseURL: "http://localhost:20130/v1",
    region: "local", categoria: "local", supportsTools: true, supportsStream: true,
    descripcion: "Motor propio Zenkai — 100% local, cero costo, cero datos afuera.",
    modelosPopulares: ["qwen2.5-coder-7b", "qwen2.5-7b", "llama3.1-8b"],
  },
  {
    name: "ollama", kind: "openai-compat", baseURL: "http://localhost:11434/v1",
    region: "local", categoria: "local", supportsTools: true, supportsStream: true,
    descripcion: "Ollama local (puente opcional).",
  },
  {
    name: "lmstudio", kind: "openai-compat", baseURL: "http://localhost:1234/v1",
    region: "local", categoria: "local", supportsTools: true, supportsStream: true,
    descripcion: "LM Studio local server.",
  },

  // ── NUBE FRONTERA ──
  {
    name: "openai", kind: "openai-compat", baseURL: "https://api.openai.com/v1",
    keyEnvVar: "OPENAI_API_KEY", region: "us", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true, supportsVision: true,
    costPer1MInput: 2.5, costPer1MOutput: 10, urlRegistro: "https://platform.openai.com/api-keys",
    modelosPopulares: ["gpt-4o", "gpt-4o-mini", "o1-mini", "o1-preview"],
    descripcion: "OpenAI — GPT-4o, o1.",
  },
  {
    name: "anthropic", kind: "anthropic", baseURL: "https://api.anthropic.com/v1",
    keyEnvVar: "ANTHROPIC_API_KEY", region: "us", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true, supportsVision: true,
    costPer1MInput: 3, costPer1MOutput: 15, urlRegistro: "https://console.anthropic.com",
    modelosPopulares: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
    descripcion: "Anthropic — Claude Sonnet/Opus/Haiku.",
  },
  {
    name: "google", kind: "google", baseURL: "https://generativelanguage.googleapis.com/v1beta",
    keyEnvVar: "GOOGLE_API_KEY", region: "us", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true, supportsVision: true,
    tieneFree: true, urlRegistro: "https://aistudio.google.com/app/apikey",
    costPer1MInput: 1.25, costPer1MOutput: 5,
    modelosPopulares: ["gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-1.5-flash"],
    descripcion: "Google Gemini — tier free generoso.",
  },
  {
    name: "xai", kind: "openai-compat", baseURL: "https://api.x.ai/v1",
    keyEnvVar: "XAI_API_KEY", region: "us", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true, supportsVision: true,
    costPer1MInput: 5, costPer1MOutput: 15, urlRegistro: "https://console.x.ai",
    modelosPopulares: ["grok-2-latest", "grok-2-vision-latest"],
    descripcion: "xAI Grok — con Twitter/X data.",
  },
  {
    name: "mistral", kind: "openai-compat", baseURL: "https://api.mistral.ai/v1",
    keyEnvVar: "MISTRAL_API_KEY", region: "eu", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true,
    costPer1MInput: 2, costPer1MOutput: 6, urlRegistro: "https://console.mistral.ai",
    modelosPopulares: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
    descripcion: "Mistral EU — Codestral especializado en código.",
  },

  // ── NUBE RÁPIDA (velocidad alta, precios bajos) ──
  {
    name: "groq", kind: "openai-compat", baseURL: "https://api.groq.com/openai/v1",
    keyEnvVar: "GROQ_API_KEY", region: "us", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true, tieneFree: true,
    costPer1MInput: 0.59, costPer1MOutput: 0.79, urlRegistro: "https://console.groq.com",
    modelosPopulares: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    descripcion: "Groq LPU — el más rápido del mercado (~500 tok/s).",
  },
  {
    name: "cerebras", kind: "openai-compat", baseURL: "https://api.cerebras.ai/v1",
    keyEnvVar: "CEREBRAS_API_KEY", region: "us", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true, tieneFree: true,
    costPer1MInput: 0.6, costPer1MOutput: 0.8, urlRegistro: "https://cloud.cerebras.ai",
    modelosPopulares: ["llama3.3-70b", "llama3.1-8b"],
    descripcion: "Cerebras Wafer-Scale — ~2000 tok/s en Llama 70B.",
  },
  {
    name: "sambanova", kind: "openai-compat", baseURL: "https://api.sambanova.ai/v1",
    keyEnvVar: "SAMBANOVA_API_KEY", region: "us", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true, tieneFree: true,
    costPer1MInput: 0.5, costPer1MOutput: 1, urlRegistro: "https://cloud.sambanova.ai",
    modelosPopulares: ["Meta-Llama-3.1-405B-Instruct", "Meta-Llama-3.1-70B-Instruct"],
    descripcion: "SambaNova — 405B a alta velocidad.",
  },
  {
    name: "deepseek", kind: "openai-compat", baseURL: "https://api.deepseek.com/v1",
    keyEnvVar: "DEEPSEEK_API_KEY", region: "asia", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true,
    costPer1MInput: 0.14, costPer1MOutput: 0.28, urlRegistro: "https://platform.deepseek.com",
    modelosPopulares: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    descripcion: "DeepSeek — precios excelentes, reasoner tipo o1.",
  },
  {
    name: "together", kind: "openai-compat", baseURL: "https://api.together.xyz/v1",
    keyEnvVar: "TOGETHER_API_KEY", region: "us", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true, tieneFree: true,
    costPer1MInput: 0.88, costPer1MOutput: 0.88, urlRegistro: "https://api.together.xyz/settings/api-keys",
    modelosPopulares: ["meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"],
    descripcion: "Together AI — 100+ modelos open.",
  },
  {
    name: "fireworks", kind: "openai-compat", baseURL: "https://api.fireworks.ai/inference/v1",
    keyEnvVar: "FIREWORKS_API_KEY", region: "us", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true,
    costPer1MInput: 0.9, costPer1MOutput: 0.9, urlRegistro: "https://fireworks.ai/api-keys",
    modelosPopulares: ["accounts/fireworks/models/llama-v3p1-70b-instruct"],
    descripcion: "Fireworks — foco velocidad + fine-tuning.",
  },
  {
    name: "perplexity", kind: "openai-compat", baseURL: "https://api.perplexity.ai",
    keyEnvVar: "PERPLEXITY_API_KEY", region: "us", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true,
    costPer1MInput: 1, costPer1MOutput: 1, urlRegistro: "https://www.perplexity.ai/settings/api",
    modelosPopulares: ["sonar", "sonar-pro", "sonar-reasoning"],
    descripcion: "Perplexity — modelos con web search integrado.",
  },

  // ── AGREGADORES (multi-provider en 1 API key) ──
  {
    name: "openrouter", kind: "openai-compat", baseURL: "https://openrouter.ai/api/v1",
    keyEnvVar: "OPENROUTER_API_KEY", region: "us", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true, supportsVision: true, tieneFree: true,
    urlRegistro: "https://openrouter.ai/keys",
    modelosPopulares: ["anthropic/claude-3.5-sonnet", "openai/gpt-4o", "meta-llama/llama-3.1-405b-instruct:free"],
    descripcion: "OpenRouter — 200+ modelos con 1 sola key + tier free.",
  },
  {
    name: "openai-compatible-custom", kind: "openai-compat", baseURL: "",
    region: "unknown", categoria: "especializado",
    descripcion: "Custom OpenAI-compat — pegá cualquier baseURL propia.",
  },

  // ── ESPECIALIZADOS ──
  {
    name: "nvidia-nim", kind: "openai-compat", baseURL: "https://integrate.api.nvidia.com/v1",
    keyEnvVar: "NVIDIA_API_KEY", region: "us", categoria: "especializado",
    supportsTools: true, supportsStream: true, tieneFree: true,
    urlRegistro: "https://build.nvidia.com",
    modelosPopulares: ["meta/llama-3.1-405b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"],
    descripcion: "NVIDIA NIM — crédito free al registrarte.",
  },
  {
    name: "cohere", kind: "openai-compat", baseURL: "https://api.cohere.com/compatibility/v1",
    keyEnvVar: "COHERE_API_KEY", region: "us", categoria: "especializado",
    supportsTools: true, supportsStream: true, tieneFree: true,
    costPer1MInput: 2.5, costPer1MOutput: 10, urlRegistro: "https://dashboard.cohere.com/api-keys",
    modelosPopulares: ["command-r-plus", "command-r"],
    descripcion: "Cohere — foco enterprise RAG.",
  },
  {
    name: "novita", kind: "openai-compat", baseURL: "https://api.novita.ai/v3/openai",
    keyEnvVar: "NOVITA_API_KEY", region: "asia", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true, tieneFree: true,
    costPer1MInput: 0.06, costPer1MOutput: 0.16,
    modelosPopulares: ["meta-llama/llama-3.1-8b-instruct"],
    descripcion: "Novita — precios ultra-bajos.",
  },
  {
    name: "hyperbolic", kind: "openai-compat", baseURL: "https://api.hyperbolic.xyz/v1",
    keyEnvVar: "HYPERBOLIC_API_KEY", region: "us", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true, tieneFree: true,
    urlRegistro: "https://hyperbolic.xyz",
    modelosPopulares: ["meta-llama/Meta-Llama-3.1-405B-Instruct"],
    descripcion: "Hyperbolic — GPU marketplace.",
  },
  {
    name: "lepton", kind: "openai-compat", baseURL: "https://api.lepton.ai/v1",
    keyEnvVar: "LEPTON_API_KEY", region: "us", categoria: "nube-rapida",
    supportsTools: true, supportsStream: true,
    modelosPopulares: ["llama3-1-405b", "llama3-1-70b"],
    descripcion: "Lepton AI — foco enterprise LLM ops.",
  },
  {
    name: "workers-ai", kind: "openai-compat", baseURL: "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1",
    keyEnvVar: "CLOUDFLARE_API_KEY", region: "us", categoria: "gratis-limitado",
    supportsTools: false, supportsStream: true, tieneFree: true,
    urlRegistro: "https://developers.cloudflare.com/workers-ai",
    modelosPopulares: ["@cf/meta/llama-3.1-8b-instruct"],
    descripcion: "Cloudflare Workers AI — free tier con límites.",
  },
  {
    name: "ai21", kind: "openai-compat", baseURL: "https://api.ai21.com/studio/v1",
    keyEnvVar: "AI21_API_KEY", region: "us", categoria: "especializado",
    supportsStream: true,
    modelosPopulares: ["jamba-1.5-large", "jamba-1.5-mini"],
    descripcion: "AI21 Labs — Jamba (SSM+Transformer).",
  },
  {
    name: "voyage", kind: "openai-compat", baseURL: "https://api.voyageai.com/v1",
    keyEnvVar: "VOYAGE_API_KEY", region: "us", categoria: "especializado",
    tieneFree: true, urlRegistro: "https://dash.voyageai.com",
    modelosPopulares: ["voyage-3", "voyage-code-3"],
    descripcion: "Voyage AI — embeddings de alta calidad.",
  },

  // ── AZURE / AWS / GCP flavors ──
  {
    name: "azure-openai", kind: "openai-compat", baseURL: "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
    keyEnvVar: "AZURE_OPENAI_KEY", region: "us", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true, supportsVision: true,
    descripcion: "Azure OpenAI — GPT-4 con SLA enterprise.",
  },
  {
    name: "bedrock-anthropic", kind: "anthropic", baseURL: "https://bedrock-runtime.us-east-1.amazonaws.com",
    keyEnvVar: "AWS_ACCESS_KEY_ID", region: "us", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true, supportsVision: true,
    modelosPopulares: ["anthropic.claude-3-5-sonnet-20241022-v2:0"],
    descripcion: "Claude vía AWS Bedrock — enterprise.",
  },
  {
    name: "vertex-ai", kind: "google", baseURL: "https://us-central1-aiplatform.googleapis.com/v1",
    region: "us", categoria: "nube-frontera",
    supportsTools: true, supportsStream: true, supportsVision: true,
    descripcion: "Gemini vía Google Vertex AI — enterprise.",
  },
]

export function providersPorCategoria(cat: ProviderCatalogEntry["categoria"]): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((p) => p.categoria === cat)
}
export function providersConFree(): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((p) => p.tieneFree)
}
export function providersPorRegion(region: string): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((p) => p.region === region)
}
export function getProviderByName(name: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.name === name)
}
export function contarProviders(): number {
  return PROVIDER_CATALOG.length
}
