import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Estado Integral — panel que muestra TODO on/off en un solo lugar:
// modelos locales, upstreams del router, cada MCP activo/apagado, sub-agentes
// disponibles, auto/* variantes, y qué proveedores tienen API key configurada.
// Es el "Administrador de dispositivos" del ecosistema ZENKAI para que el
// usuario distinga de un vistazo qué está funcionando de qué no.

type Estado = "ok" | "warn" | "err" | "off" | "requiere_key"

type Item = {
  categoria: string
  nombre: string
  detalle: string
  estado: Estado
  colorCategoria: string
}

const COLOR_ESTADO: Record<Estado, string> = {
  ok: "#22c55e",
  warn: "#f59e0b",
  err: "#ef4444",
  off: "#64748b",
  requiere_key: "#3b82f6",
}

const LABEL_ESTADO: Record<Estado, string> = {
  ok: "corriendo",
  warn: "advertencia",
  err: "caído",
  off: "apagado",
  requiere_key: "necesita API key",
}

// Los sub-agentes vienen del auto-setup. Los listamos acá para reflejar el
// estado real (todos activos, uso opcional del principal).
const SUBAGENTES = [
  "reviewer", "refactor", "explainer", "debugger", "designer",
  "reflector", "refutador", "investigador", "jurado", "optimizador",
  "builder", "tester", "security", "documenter", "arquitecto", "impacto",
]

// MCPs preinstalados con su estado default. Los que son "requieren key" los
// marcamos aparte para que el usuario sepa.
const MCPS_DEFAULT = [
  { id: "context7", activo: true, key: false },
  { id: "sequential-thinking", activo: true, key: false },
  { id: "memory", activo: true, key: false },
  { id: "filesystem", activo: true, key: false },
  { id: "fetch", activo: true, key: false },
  { id: "git", activo: true, key: false },
  { id: "time", activo: true, key: false },
  { id: "duckduckgo-search", activo: true, key: false },
  { id: "weather", activo: true, key: false },
  { id: "zenkai-image", activo: true, key: false },
  { id: "wikipedia", activo: false, key: false },
  { id: "youtube", activo: false, key: false },
  { id: "playwright", activo: false, key: false },
  { id: "puppeteer", activo: false, key: false },
  { id: "sqlite", activo: false, key: false },
  { id: "zenkai-computer", activo: false, key: false },
  { id: "docker", activo: false, key: false },
  { id: "postgres", activo: false, key: true },
  { id: "slack", activo: false, key: true },
  { id: "notion", activo: false, key: true },
  { id: "google-drive", activo: false, key: true },
  { id: "brave-search", activo: false, key: true },
  { id: "github", activo: false, key: true },
  { id: "everything-search", activo: false, key: false },
  { id: "obsidian", activo: false, key: false },
  { id: "vision-tesseract", activo: false, key: false },
]

// Los 3 modelos auto/* del router.
const AUTOS = [
  { id: "auto", nombre: "ZENKAI Auto (mejor disponible)", desc: "elige según tarea (coding/smart/fast)" },
  { id: "auto/coding", nombre: "ZENKAI Auto · código", desc: "prefiere qwen-coder / deepseek" },
  { id: "auto/smart", nombre: "ZENKAI Auto · razonamiento", desc: "prefiere qwen3 / deepseek-r1" },
  { id: "auto/fast", nombre: "ZENKAI Auto · rápido", desc: "modelos chicos, respuesta corta" },
]

// Proveedores de nube típicos que pueden estar sin key.
const PROVEEDORES_NUBE = ["openrouter", "nvidia", "groq", "together", "deepseek", "google", "openai", "anthropic", "mistral"]

async function fetchTags(): Promise<Array<{ name: string; capabilities?: string[] }>> {
  try {
    const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return []
    return ((await r.json()) as { models?: Array<{ name: string; capabilities?: string[] }> }).models ?? []
  } catch {
    return []
  }
}

async function fetchHealth(): Promise<{ upstreams?: Array<{ name: string; breaker: { estado: string }; latenciaMediaMs: number }> }> {
  try {
    const r = await fetch("http://localhost:20128/v1/health", { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return {}
    return await r.json()
  } catch {
    return {}
  }
}

export function DialogEstadoIntegral() {
  const dialog = useDialog()
  const [pulse, setPulse] = createSignal(0)

  onMount(() => {
    const t = setInterval(() => setPulse((n) => n + 1), 5000)
    onCleanup(() => clearInterval(t))
  })

  const [items] = createResource(pulse, async (): Promise<Item[]> => {
    const [tags, health] = await Promise.all([fetchTags(), fetchHealth()])
    const upstreams = health.upstreams ?? []
    const out: Item[] = []

    // ── ROUTER ──
    for (const u of upstreams) {
      const est: Estado = u.breaker.estado === "closed" ? "ok" : u.breaker.estado === "half-open" ? "warn" : "err"
      out.push({
        categoria: "Router · Upstreams",
        nombre: u.name,
        detalle: `${u.breaker.estado} · ${u.latenciaMediaMs > 0 ? Math.round(u.latenciaMediaMs) + "ms" : "sin latencia medida"}`,
        estado: est,
        colorCategoria: "#EC5B2B",
      })
    }
    if (upstreams.length === 0) {
      out.push({
        categoria: "Router · Upstreams",
        nombre: "Router local (:20128)",
        detalle: "no responde",
        estado: "err",
        colorCategoria: "#EC5B2B",
      })
    }

    // ── AUTO/* ──
    const routerOk = upstreams.some((u) => u.breaker.estado !== "open")
    const localOk = tags.filter((t) => (t.capabilities ?? []).includes("tools")).length > 0
    for (const a of AUTOS) {
      out.push({
        categoria: "Auto (variantes)",
        nombre: a.nombre,
        detalle: a.desc,
        estado: routerOk && localOk ? "ok" : routerOk ? "warn" : "err",
        colorCategoria: "#f59e0b",
      })
    }

    // ── MODELOS LOCALES ──
    for (const t of tags) {
      const tools = (t.capabilities ?? []).includes("tools")
      out.push({
        categoria: "Modelos locales",
        nombre: t.name,
        detalle: tools ? "listo · soporta tools" : "solo chat (sin tools)",
        estado: tools ? "ok" : "warn",
        colorCategoria: "#22c55e",
      })
    }
    if (tags.length === 0) {
      out.push({
        categoria: "Modelos locales",
        nombre: "Ollama",
        detalle: "no responde o sin modelos instalados",
        estado: "err",
        colorCategoria: "#22c55e",
      })
    }

    // ── MCPs ──
    for (const m of MCPS_DEFAULT) {
      const est: Estado = m.key ? "requiere_key" : m.activo ? "ok" : "off"
      out.push({
        categoria: "MCP · Herramientas",
        nombre: m.id,
        detalle: m.key ? "requiere API key para funcionar" : m.activo ? "activo por default" : "instalado, apagado",
        estado: est,
        colorCategoria: "#a855f7",
      })
    }

    // ── SUB-AGENTES ──
    for (const s of SUBAGENTES) {
      out.push({
        categoria: "Sub-agentes",
        nombre: s,
        detalle: "disponible · el principal lo puede invocar",
        estado: "ok",
        colorCategoria: "#06b6d4",
      })
    }

    // ── PROVEEDORES NUBE (info) ──
    for (const p of PROVEEDORES_NUBE) {
      out.push({
        categoria: "Proveedores nube",
        nombre: p,
        detalle: "definido en catálogo · requiere key para usarse",
        estado: "requiere_key",
        colorCategoria: "#3b82f6",
      })
    }

    return out
  }, { initialValue: [] })

  const [filtro, setFiltro] = createSignal<Estado | "todos">("todos")
  const filtrados = () => filtro() === "todos" ? items() : items().filter((i) => i.estado === filtro())

  const categorias = () => Array.from(new Set(filtrados().map((i) => i.categoria)))

  const contar = (est: Estado) => items().filter((i) => i.estado === est).length

  return (
    <Dialog
      size="x-large"
      title="Estado Integral · todo on/off en un lugar"
      class="w-[min(calc(100vw-40px),920px)] h-[min(calc(100vh-40px),720px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-3 p-5 h-full overflow-hidden text-[12.5px] font-mono">
        {/* Contadores como filtros */}
        <div class="flex items-center gap-1.5 flex-wrap flex-shrink-0">
          <ChipFiltro label={`todos (${items().length})`} activo={filtro() === "todos"} color="#94a3b8" onClick={() => setFiltro("todos")} />
          <ChipFiltro label={`corriendo (${contar("ok")})`} activo={filtro() === "ok"} color={COLOR_ESTADO.ok} onClick={() => setFiltro("ok")} />
          <ChipFiltro label={`advertencia (${contar("warn")})`} activo={filtro() === "warn"} color={COLOR_ESTADO.warn} onClick={() => setFiltro("warn")} />
          <ChipFiltro label={`caído (${contar("err")})`} activo={filtro() === "err"} color={COLOR_ESTADO.err} onClick={() => setFiltro("err")} />
          <ChipFiltro label={`apagado (${contar("off")})`} activo={filtro() === "off"} color={COLOR_ESTADO.off} onClick={() => setFiltro("off")} />
          <ChipFiltro label={`necesita key (${contar("requiere_key")})`} activo={filtro() === "requiere_key"} color={COLOR_ESTADO.requiere_key} onClick={() => setFiltro("requiere_key")} />
          <span class="ml-auto text-[10.5px] opacity-60">refresh cada 5s</span>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
          <For each={categorias()}>
            {(cat) => {
              const cosas = filtrados().filter((i) => i.categoria === cat)
              const color = cosas[0]?.colorCategoria ?? "#EC5B2B"
              return (
                <div class="flex flex-col gap-1.5">
                  <div class="flex items-center gap-2 pl-1 sticky top-0 bg-v2-background-bg-base py-1">
                    <span class="inline-block size-1.5 rounded-full" style={{ background: color }} />
                    <span class="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
                      {cat}
                    </span>
                    <span class="text-[10px] opacity-50">{cosas.length}</span>
                  </div>
                  <For each={cosas}>
                    {(it) => (
                      <div class="flex items-center gap-2.5 rounded-md border border-v2-border-border-muted px-2.5 py-1.5">
                        <span
                          class="inline-block size-1.5 rounded-full shrink-0"
                          style={{ background: COLOR_ESTADO[it.estado], "box-shadow": `0 0 0 3px ${COLOR_ESTADO[it.estado]}22` }}
                        />
                        <span class="font-semibold flex-shrink-0 min-w-[140px] truncate">{it.nombre}</span>
                        <span class="opacity-70 flex-1 truncate">{it.detalle}</span>
                        <span
                          class="text-[9.5px] uppercase tracking-wider shrink-0 px-1.5 py-[1px] rounded"
                          style={{ background: `${COLOR_ESTADO[it.estado]}22`, color: COLOR_ESTADO[it.estado] }}
                        >
                          {LABEL_ESTADO[it.estado]}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              )
            }}
          </For>
        </div>

        <div class="flex justify-end pt-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-md bg-[#EC5B2B] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function ChipFiltro(props: { label: string; activo: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="px-2 py-1 rounded-md text-[10.5px] font-mono transition-colors"
      style={{
        background: props.activo ? `${props.color}22` : "transparent",
        border: `1px solid ${props.activo ? `${props.color}66` : "rgba(255,255,255,0.09)"}`,
        color: props.activo ? props.color : "var(--v2-text-text-muted, #808080)",
      }}
    >
      {props.label}
    </button>
  )
}
