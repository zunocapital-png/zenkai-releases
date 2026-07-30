import { For, Show, createSignal } from "solid-js"

// Detalle completo de Zenkai — TODO lo que hace la app, punta a punta,
// con comparativas contra las apps de referencia. Es una vista de sólo-lectura
// pensada para que el usuario entienda qué tiene sin abrir docs externos.
//
// Datos estáticos: se mantienen a mano cuando se agregan features.
// Update rule: cada release nueva → agregar entrada acá.

type Feature = {
  nombre: string
  descripcion: string
  automatico: boolean
  slash?: string
  compara?: { app: string; version: "igual" | "mejor" | "unico" }[]
}
type Seccion = {
  titulo: string
  emoji: string
  color: string
  features: Feature[]
}

const SECCIONES: Seccion[] = [
  {
    titulo: "Motor local propio",
    emoji: "⚡",
    color: "#ff6b35",
    features: [
      { nombre: "ZenkaiEngine daemon", descripcion: "Un solo puerto (:20130) sirve todos los modelos GGUF cargados. LRU eviction + keep-alive tunable + max-concurrent guard. Load/unload por demanda.", automatico: true, compara: [{ app: "Ollama", version: "igual" }, { app: "LM Studio", version: "mejor" }] },
      { nombre: "llama-server bootstrap", descripcion: "Descarga automática del binario oficial de llama.cpp desde GitHub releases. Usuario no instala nada manual.", automatico: true, compara: [{ app: "Cortex.so", version: "igual" }, { app: "Ollama", version: "unico" }] },
      { nombre: "Downloader GGUF con resume", descripcion: "Baja de HuggingFace con progreso SSE y resume desde .part si se corta.", automatico: true, compara: [{ app: "Ollama", version: "mejor" }] },
      { nombre: "Auto-benchmark tok/s", descripcion: "Mide tokens/segundo automáticamente al primer load. Persiste por 30 días. Se muestra en el catálogo.", automatico: true, slash: "/motor", compara: [{ app: "LM Studio", version: "mejor" }, { app: "Ollama", version: "unico" }] },
      { nombre: "HwMonitor RAM/GPU en vivo", descripcion: "RAM/CPU/VRAM cada 2s via SSE (lazy — solo poll si hay subs).", automatico: true, compara: [{ app: "LM Studio", version: "mejor" }] },
      { nombre: "ZenkaiFile (superset Modelfile)", descripcion: "FROM/SYSTEM/PARAMETER/TEMPLATE/ADAPTER + extras: CAPABILITY, MEMORY, TOOLS.", automatico: false, compara: [{ app: "Ollama", version: "mejor" }] },
      { nombre: "Ollama importer", descripcion: "Puente opcional: reutiliza modelos que ya tengas de Ollama sin re-descargar (share blob por sha256).", automatico: true, compara: [{ app: "Ollama", version: "unico" }] },
    ],
  },
  {
    titulo: "Providers cloud (multi-nube)",
    emoji: "🌐",
    color: "#61afef",
    features: [
      { nombre: "30+ providers catalogados", descripcion: "OpenAI, Anthropic, Google, Groq, Cerebras, DeepSeek, Together, Fireworks, Perplexity, OpenRouter, Mistral, xAI, Azure, Bedrock, Vertex, Cohere, NVIDIA NIM, Novita, Hyperbolic, Cloudflare, AI21, SambaNova, Voyage y más.", automatico: false, compara: [{ app: "OpenRouter", version: "igual" }, { app: "LibreChat", version: "igual" }] },
      { nombre: "ProviderOrchestrator con failover", descripcion: "Si un provider falla, salta al siguiente sin cortar el stream. Ordena por health score.", automatico: true, compara: [{ app: "Ollama", version: "unico" }, { app: "OpenRouter", version: "mejor" }] },
      { nombre: "Semantic cache", descripcion: "Dedup de requests por similitud coseno con embeddings. Ahorra tokens repitiendo respuestas similares.", automatico: true, compara: [{ app: "Ollama", version: "unico" }] },
      { nombre: "Cost tracking USD real", descripcion: "Calcula precio por request con tarifas del provider. Budget por provider.", automatico: true, slash: "/costos", compara: [{ app: "OpenRouter", version: "igual" }] },
      { nombre: "Racing multi-provider", descripcion: "Mismo prompt a N providers en paralelo, gana el más rápido; los otros se cancelan.", automatico: false, compara: [{ app: "OpenRouter", version: "unico" }] },
      { nombre: "Circuit breaker 3-estados", descripcion: "closed/open/half-open con backoff exponencial. Provider caído no bloquea la app.", automatico: true, compara: [{ app: "Ollama", version: "unico" }] },
      { nombre: "Adaptive timeout p95", descripcion: "Ajusta timeout basado en latencia p95 histórica del provider.", automatico: true, compara: [{ app: "Ollama", version: "unico" }] },
      { nombre: "Region-aware routing", descripcion: "Preferí providers EU/local para privacy, US/asia para costo.", automatico: false, compara: [{ app: "OpenRouter", version: "mejor" }] },
    ],
  },
  {
    titulo: "Sub-agentes cognitivos",
    emoji: "🧠",
    color: "#c678dd",
    features: [
      { nombre: "Reflector", descripcion: "Otro modelo re-lee la respuesta anterior, la puntúa 0-10 y sugiere mejoras.", automatico: false, slash: "/reflexionar", compara: [{ app: "Reflexion (paper)", version: "igual" }] },
      { nombre: "Auto-repair loop", descripcion: "Corre test → si falla, LLM propone fix → aplica → re-testea. Max N intentos.", automatico: false, slash: "/reparar", compara: [{ app: "Aider", version: "igual" }, { app: "Cursor", version: "mejor" }] },
      { nombre: "AI Parliament", descripcion: "N modelos votan sí/no con confianza. Desempate por confianza promedio ponderada. Pesos configurables.", automatico: false, slash: "/parliament", compara: [{ app: "todos", version: "unico" }] },
      { nombre: "Autonomous Agent Loop", descripcion: "Plan → Act → Verify → Checkpoint. Rollback si algo se rompe.", automatico: false, compara: [{ app: "Cline", version: "igual" }, { app: "Devin", version: "igual" }, { app: "Windsurf Cascade", version: "igual" }] },
    ],
  },
  {
    titulo: "Herramientas de código",
    emoji: "🛠️",
    color: "#4ade80",
    features: [
      { nombre: "Tools nativas (read/write/bash/grep)", descripcion: "ToolExecutor propio con timeout/cancel/rate-limit/cache/progress/metrics.", automatico: true, compara: [{ app: "Claude Code", version: "igual" }] },
      { nombre: "Cognitive Sandbox", descripcion: "child_process aislado con env whitelist + timeout duro + no shell.", automatico: false, slash: "/sandbox", compara: [{ app: "Replit", version: "igual" }] },
      { nombre: "Docker Sandbox opcional", descripcion: "Ejecuta en container con --network=none + --cap-drop=ALL + memory/cpu limits. Fallback graceful a child_process.", automatico: true, compara: [{ app: "todos", version: "unico" }] },
      { nombre: "Apply-diff visual con hunks", descripcion: "Parser unified diff + apply hunk-by-hunk con confirmar/rechazar. Preview antes de escribir.", automatico: false, compara: [{ app: "Cursor Composer", version: "igual" }] },
      { nombre: "Codebase indexer", descripcion: "Camina el proyecto, trocea por función/clase/párrafo, mete al vector store. Buscá por semántica.", automatico: true, compara: [{ app: "Continue.dev", version: "igual" }, { app: "Cursor", version: "igual" }] },
      { nombre: "App scaffold generator", descripcion: "Genera vite-react-ts / vite-vanilla / node-express / bun-elysia / static-html listo para correr.", automatico: false, compara: [{ app: "Bolt.new", version: "mejor" }, { app: "Replit", version: "igual" }] },
      { nombre: "Screenshot → code", descripcion: "Imagen + modelo vision → React/HTML/Solid/Vue. Extrae del markdown auto.", automatico: false, compara: [{ app: "v0.dev", version: "igual" }] },
    ],
  },
  {
    titulo: "Contexto y memoria",
    emoji: "📚",
    color: "#e5c07b",
    features: [
      { nombre: "SessionStore SQLite", descripcion: "Escala a 10k+ sesiones con paginación e índices. WAL para write concurrency.", automatico: true, compara: [{ app: "todos", version: "mejor" }] },
      { nombre: "VectorStore SQLite", descripcion: "Embeddings persistentes con cosine similarity. Delete por source. Idempotente.", automatico: true, compara: [{ app: "AnythingLLM", version: "igual" }] },
      { nombre: "Session fork", descripcion: "Duplica conversación completa sin tocar la original.", automatico: false, slash: "/fork", compara: [{ app: "Msty", version: "igual" }] },
      { nombre: "Compact", descripcion: "Resume conversación larga en system prompt corto para liberar contexto.", automatico: false, slash: "/compact", compara: [{ app: "Claude Code", version: "igual" }] },
    ],
  },
  {
    titulo: "Multimedia + input alternativo",
    emoji: "🎨",
    color: "#d19a66",
    features: [
      { nombre: "Vision (attach imagen)", descripcion: "Normaliza file:// / http:// / data: con detección MIME por magic bytes.", automatico: true, compara: [{ app: "todos", version: "igual" }] },
      { nombre: "TTS local Piper", descripcion: "Voz sintética offline. Wrapper del binario Piper. Voces ES/EN.", automatico: false, compara: [{ app: "todos", version: "unico" }] },
      { nombre: "Voz duplex (VAD)", descripcion: "Detecta cuándo el usuario empieza a hablar y corta la TTS. RMS + hangover + adaptativo.", automatico: true, compara: [{ app: "todos", version: "unico" }] },
      { nombre: "Bloques de código estilo Claude", descripcion: "Header con lenguaje + Copiar dorado + ✎ editar / [+] insertar / ▶ ejecutar.", automatico: true, compara: [{ app: "Claude", version: "igual" }, { app: "ChatGPT", version: "igual" }] },
    ],
  },
  {
    titulo: "Colaboración",
    emoji: "👥",
    color: "#98c379",
    features: [
      { nombre: "CollabHub broadcaster", descripcion: "Pub/sub por sala con historial + presence + broadcast excluye-emisor. Transport-agnostic.", automatico: true, compara: [{ app: "todos", version: "unico" }] },
      { nombre: "Mobile pairing QR", descripcion: "Emparejamiento por código 6-char + QR matrix + token opaco 64-hex. Un solo uso + TTL.", automatico: false, compara: [{ app: "Open WebUI", version: "mejor" }] },
    ],
  },
  {
    titulo: "Fine-tuning y training",
    emoji: "🎯",
    color: "#f87171",
    features: [
      { nombre: "Detección GPU", descripcion: "CUDA (nvidia-smi) + ROCm (rocm-smi) + Metal (system_profiler). CPU como fallback last-resort.", automatico: true, compara: [{ app: "todos", version: "igual" }] },
      { nombre: "LoRA training real", descripcion: "Spawn de unsloth con script Python generado + progress SSE. Refusa CPU sin flag explícito.", automatico: false, compara: [{ app: "Text-gen WebUI", version: "igual" }] },
      { nombre: "Dataset builder", descripcion: "Export JSONL formato Ollama messages o sharegpt/HF conversations + estadísticas + Modelfile generator.", automatico: false, compara: [{ app: "todos", version: "unico" }] },
    ],
  },
  {
    titulo: "Extensibilidad",
    emoji: "🔌",
    color: "#61afef",
    features: [
      { nombre: "MCP support (26 preinstalados)", descripcion: "Model Context Protocol servers para tools externas: web-search, filesystem, git, github, postgres, docker, kubernetes, y más.", automatico: true, slash: "/mcp", compara: [{ app: "Claude Code", version: "igual" }, { app: "Cursor", version: "igual" }] },
      { nombre: "Plugin registry con checksum", descripcion: "Install/uninstall MCPs con sha256 anti-manipulación + sync remoto que no pisa user/builtin.", automatico: false, compara: [{ app: "Jan.ai", version: "mejor" }] },
      { nombre: "Skill Store distribuido", descripcion: "Registry local de skill prompts + ratings + sync remoto que preserva rating al actualizar.", automatico: false, compara: [{ app: "Jan.ai", version: "igual" }] },
      { nombre: "App Catalog 1-click", descripcion: "10 bundles curados: Programador Fullstack, Diseñador Web, Escritor, Analista Datos, etc. Cada uno = MCPs + skills + modelo + persona.", automatico: false, compara: [{ app: "Pinokio", version: "mejor" }] },
    ],
  },
  {
    titulo: "Observabilidad",
    emoji: "📊",
    color: "#facc15",
    features: [
      { nombre: "Event Bus AIOS", descripcion: "Pub/sub con wildcards + async-safe + once + persist opcional. Expuesto vía SSE /v2/events.", automatico: true, compara: [{ app: "todos", version: "unico" }] },
      { nombre: "Observability Center", descripcion: "Timeline eventos, latencia por provider, cache hits, health tiempo real.", automatico: true, slash: "/observability", compara: [{ app: "OpenRouter", version: "mejor" }] },
      { nombre: "/v1/health endpoint", descripcion: "Métricas internas del router: upstreams, breaker state, latencia media, fallos.", automatico: true, compara: [{ app: "Ollama", version: "unico" }] },
    ],
  },
]

export function SettingsZenkaiDetalle() {
  const [filtro, setFiltro] = createSignal("")
  const [soloAutomaticos, setSoloAutomaticos] = createSignal(false)

  const filtrar = (fs: Feature[]) => {
    const q = filtro().toLowerCase().trim()
    return fs.filter((f) => {
      if (soloAutomaticos() && !f.automatico) return false
      if (!q) return true
      return f.nombre.toLowerCase().includes(q) || f.descripcion.toLowerCase().includes(q)
    })
  }

  const totalFeatures = SECCIONES.reduce((n, s) => n + s.features.length, 0)
  const totalAutomaticos = SECCIONES.reduce((n, s) => n + s.features.filter((f) => f.automatico).length, 0)

  return (
    <div style="padding:20px 24px;max-width:100%;">
      <div style="margin-bottom:16px;">
        <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;">Todo lo que hace Zenkai</h1>
        <p style="margin:0;color:var(--v2-text-text-muted);font-size:13px;">
          {totalFeatures} features en {SECCIONES.length} áreas — <strong style="color:var(--v2-orange, #ff6b35);">{totalAutomaticos} automáticos</strong>, sin configuración
        </p>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <input
          value={filtro()}
          onInput={(e) => setFiltro(e.currentTarget.value)}
          placeholder="Filtrar features…"
          style="flex:1;padding:8px 10px;background:var(--v2-background-bg-layer-01,#0f0f0f);color:var(--v2-text-text-base,#e4e4e4);border:1px solid var(--v2-border-border-muted,#2a2a2a);border-radius:5px;font-size:13px;"
        />
        <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--v2-text-text-muted,#999);cursor:pointer;">
          <input type="checkbox" checked={soloAutomaticos()} onChange={(e) => setSoloAutomaticos(e.currentTarget.checked)} />
          Solo automáticos
        </label>
      </div>

      <For each={SECCIONES}>
        {(sec) => {
          const fs = () => filtrar(sec.features)
          return (
            <Show when={fs().length > 0}>
              <section style="margin-bottom:24px;">
                <h2 style={`display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:13px;font-weight:700;color:${sec.color};text-transform:uppercase;letter-spacing:0.08em;`}>
                  <span style="font-size:16px;">{sec.emoji}</span>
                  {sec.titulo}
                  <span style="margin-left:auto;font-size:11px;font-weight:500;color:var(--v2-text-text-muted,#999);text-transform:none;letter-spacing:0;">{fs().length}</span>
                </h2>
                <For each={fs()}>
                  {(f) => (
                    <div style="padding:10px 12px;background:var(--v2-background-bg-layer-01,#0f0f0f);border:1px solid var(--v2-border-border-muted,#2a2a2a);border-left:3px solid transparent;border-radius:5px;margin-bottom:6px;" classList={{}}>
                      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
                        <div style="font-weight:600;color:var(--v2-text-text-base,#e4e4e4);font-size:13px;">
                          {f.nombre}
                          <Show when={f.slash}>
                            <code style={`margin-left:8px;color:${sec.color};background:transparent;padding:0;font-size:11px;`}>{f.slash}</code>
                          </Show>
                        </div>
                        <Show when={f.automatico}>
                          <span style="font-size:10px;color:#4ade80;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;white-space:nowrap;">✓ AUTO</span>
                        </Show>
                      </div>
                      <div style="color:var(--v2-text-text-muted,#999);font-size:12px;margin-top:4px;line-height:1.55;">{f.descripcion}</div>
                      <Show when={f.compara && f.compara.length > 0}>
                        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                          <For each={f.compara}>
                            {(c) => {
                              const color = c.version === "unico" ? "#c678dd" : c.version === "mejor" ? "#4ade80" : "#61afef"
                              const label = c.version === "unico" ? "único" : c.version === "mejor" ? "> " : "= "
                              return (
                                <span style={`font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(255,255,255,0.03);color:${color};border:1px solid ${color}22;`}>
                                  {label}{c.app}
                                </span>
                              )
                            }}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </section>
            </Show>
          )
        }}
      </For>

      <div style="padding:14px;background:linear-gradient(180deg,rgba(255,107,53,0.06),transparent),var(--v2-background-bg-layer-01,#0f0f0f);border:1px solid var(--v2-border-border-muted,#2a2a2a);border-left:3px solid var(--v2-orange,#ff6b35);border-radius:5px;font-size:12px;color:var(--v2-text-text-muted,#999);">
      <strong style="color:var(--v2-text-text-base,#e4e4e4);">Principio.</strong> Los features marcados <strong style="color:#4ade80;">AUTO</strong> se activan solos sin que configures nada. Los otros son slashes o dialogs que invocas cuando querés — no aparecen como opciones ocultas que pueden romperse.
      </div>
    </div>
  )
}
