import { createSignal, For, lazy, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Panel de MCP + Plugins con explicación real, lista visible de cada MCP con
// estado y ejemplo, y sub-tab para el marketplace de plugins de la comunidad.
// Reemplaza el marketplace legacy en Ajustes → Plugins.
const LazyPluginMarketplace = lazy(() =>
  import("@/components/plugin-marketplace").then((m) => ({ default: m.PluginMarketplace })),
)

type McpEntry = {
  id: string
  nombre: string
  icon: string
  color: string
  categoria: "esencial" | "web" | "creativo" | "desarrollo" | "opcional"
  que: string
  ejemplo: string
  activoDefault: boolean
  requiereKey?: boolean
}

const MCPS: McpEntry[] = [
  { id: "filesystem", nombre: "Filesystem", icon: "📁", color: "#EC5B2B", categoria: "esencial",
    que: "Leer y escribir archivos del disco (acceso acotado al proyecto activo).",
    ejemplo: "«Leé los .md de docs/ y hacé un índice»", activoDefault: true },
  { id: "git", nombre: "Git", icon: "🔧", color: "#f59e0b", categoria: "desarrollo",
    que: "Status, diff, log, branch. Todo lo que hace 'git' sin comandos.",
    ejemplo: "«¿Qué cambié desde el último commit?»", activoDefault: true },
  { id: "memory", nombre: "Memory", icon: "🧠", color: "#a855f7", categoria: "esencial",
    que: "Recuerda cosas importantes entre chats (knowledge-graph local).",
    ejemplo: "«Recordá que uso Solid, no React»", activoDefault: true },
  { id: "sequential-thinking", nombre: "Sequential Thinking", icon: "🧩", color: "#06b6d4", categoria: "esencial",
    que: "Descompone problemas complejos en pasos ordenados.",
    ejemplo: "«Planeá cómo migrar mi API a GraphQL»", activoDefault: true },
  { id: "context7", nombre: "Context7 · Docs", icon: "📚", color: "#ec4899", categoria: "desarrollo",
    que: "Docs actualizadas de librerías (React, Vue, Next, Solid, etc.).",
    ejemplo: "«¿Cómo se usa <Suspense> en Solid 2?»", activoDefault: true },
  { id: "fetch", nombre: "Fetch", icon: "🌐", color: "#22c55e", categoria: "web",
    que: "Traer HTML / JSON / texto de URLs.",
    ejemplo: "«Traeme el HTML de esta página y resumime»", activoDefault: true },
  { id: "duckduckgo-search", nombre: "DuckDuckGo Search", icon: "🦆", color: "#22c55e", categoria: "web",
    que: "Buscar en la web sin key. La IA busca antes de responder.",
    ejemplo: "«Buscá noticias de IA de esta semana»", activoDefault: true },
  { id: "weather", nombre: "Weather", icon: "🌤️", color: "#3b82f6", categoria: "web",
    que: "Clima actual y pronóstico. Usa Open-Meteo (sin key).",
    ejemplo: "«¿Cómo va a estar mañana en Rosario?»", activoDefault: true },
  { id: "time", nombre: "Time & Timezone", icon: "🕐", color: "#3b82f6", categoria: "esencial",
    que: "Sabe la fecha y hora exactas. Maneja zonas horarias.",
    ejemplo: "«Programá para lunes 9am, hora Buenos Aires»", activoDefault: true },
  { id: "zenkai-image", nombre: "Generar Imagen (ZENKAI)", icon: "🎨", color: "#EC5B2B", categoria: "creativo",
    que: "Genera imágenes desde el chat con SD local o API cloud.",
    ejemplo: "«Diseñá un logo minimalista para mi startup»", activoDefault: true },
  { id: "wikipedia", nombre: "Wikipedia", icon: "📖", color: "#94a3b8", categoria: "web",
    que: "Buscar artículos de Wikipedia. Sin key.",
    ejemplo: "«¿Qué es el paradigma reactivo?»", activoDefault: false },
  { id: "youtube", nombre: "YouTube", icon: "▶️", color: "#ef4444", categoria: "creativo",
    que: "Traer transcripciones de videos, buscar canales.",
    ejemplo: "«Resumime este tutorial: <url>»", activoDefault: false },
  { id: "playwright", nombre: "Playwright", icon: "🎭", color: "#8b5cf6", categoria: "desarrollo",
    que: "Browser automation multi-engine. Prender = descarga navegadores.",
    ejemplo: "«Testeá el login de mi app y captureá»", activoDefault: false },
  { id: "puppeteer", nombre: "Puppeteer", icon: "🕹️", color: "#8b5cf6", categoria: "desarrollo",
    que: "Automatización de Chromium. Alternativa clásica a Playwright.",
    ejemplo: "«Sacame screenshot de esta URL»", activoDefault: false },
  { id: "sqlite", nombre: "SQLite", icon: "🗃️", color: "#f97316", categoria: "desarrollo",
    que: "Consultar bases SQLite locales con SQL.",
    ejemplo: "«¿Qué tablas tiene ~/data.db?»", activoDefault: false },
  { id: "zenkai-computer", nombre: "Control de PC", icon: "🖥️", color: "#94a3b8", categoria: "opcional",
    que: "Movés el mouse y clics. Solo si vos lo activás (peligroso).",
    ejemplo: "«Abrí Firefox y andá a docs.solidjs.com»", activoDefault: false },
]

const CATEGORIAS: Record<McpEntry["categoria"], { label: string; color: string }> = {
  esencial: { label: "Esenciales", color: "#EC5B2B" },
  web: { label: "Web y datos", color: "#22c55e" },
  desarrollo: { label: "Desarrollo", color: "#a855f7" },
  creativo: { label: "Creativo", color: "#ec4899" },
  opcional: { label: "Opcionales / avanzados", color: "#94a3b8" },
}

export function PanelMcpPlugins() {
  const [tab, setTab] = createSignal<"mcp" | "plugins">("mcp")
  const [filtro, setFiltro] = createSignal<"todos" | "activos" | "apagados">("todos")
  const dialog = useDialog()

  const mcpsFiltrados = () => {
    const f = filtro()
    if (f === "todos") return MCPS
    if (f === "activos") return MCPS.filter((m) => m.activoDefault)
    return MCPS.filter((m) => !m.activoDefault)
  }

  const porCategoria = (cat: McpEntry["categoria"]) => mcpsFiltrados().filter((m) => m.categoria === cat)

  const abrirExplicacion = () => {
    void import("@/components/dialog-que-son-mcp").then((x) => dialog.show(() => <x.DialogQueSonMcp />))
  }

  return (
    <div class="flex flex-col gap-4 p-6 h-full overflow-hidden">
      {/* Header con tabs MCP/Plugins */}
      <div class="flex items-center justify-between">
        <div class="flex gap-1 border-b border-v2-border-border-muted">
          <TabBtn label="MCP · Herramientas de la IA" activo={tab() === "mcp"} onClick={() => setTab("mcp")} />
          <TabBtn label="Plugins · Comunidad" activo={tab() === "plugins"} onClick={() => setTab("plugins")} />
        </div>
        <button
          type="button"
          onClick={abrirExplicacion}
          class="flex items-center gap-1.5 rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/10 px-2.5 py-1 text-[11px] font-medium text-[#EC5B2B] hover:bg-[#EC5B2B]/20"
          title="Qué son los MCP y cómo se usan"
        >
          <span>?</span>
          <span>¿Qué son?</span>
        </button>
      </div>

      <Show when={tab() === "mcp"}>
        <div class="flex items-center gap-2">
          <FiltroChip label={`Todos (${MCPS.length})`} activo={filtro() === "todos"} onClick={() => setFiltro("todos")} />
          <FiltroChip
            label={`Activos (${MCPS.filter((m) => m.activoDefault).length})`}
            activo={filtro() === "activos"}
            onClick={() => setFiltro("activos")}
          />
          <FiltroChip
            label={`Apagados (${MCPS.filter((m) => !m.activoDefault).length})`}
            activo={filtro() === "apagados"}
            onClick={() => setFiltro("apagados")}
          />
          <span class="ml-auto text-[11px] opacity-60">Los MCPs son invisibles. La IA los usa sola.</span>
        </div>

        <div class="flex-1 overflow-y-auto flex flex-col gap-4 pr-2">
          <For each={Object.keys(CATEGORIAS) as McpEntry["categoria"][]}>
            {(cat) => (
              <Show when={porCategoria(cat).length > 0}>
                <div class="flex flex-col gap-2">
                  <div class="flex items-center gap-2 pl-1">
                    <span
                      class="inline-block size-1.5 rounded-full"
                      style={{ background: CATEGORIAS[cat].color }}
                    />
                    <span class="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: CATEGORIAS[cat].color }}>
                      {CATEGORIAS[cat].label}
                    </span>
                    <span class="text-[10.5px] opacity-50">{porCategoria(cat).length}</span>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <For each={porCategoria(cat)}>{(m) => <McpCard m={m} />}</For>
                  </div>
                </div>
              </Show>
            )}
          </For>
        </div>
      </Show>

      <Show when={tab() === "plugins"}>
        <div class="flex-1 overflow-y-auto">
          <LazyPluginMarketplace />
        </div>
      </Show>
    </div>
  )
}

function McpCard(props: { m: McpEntry }) {
  return (
    <div
      class="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      style={{ "border-color": "rgba(255,255,255,0.09)" }}
    >
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-md text-[18px]"
        style={{ background: `${props.m.color}18`, color: props.m.color }}
      >
        {props.m.icon}
      </div>
      <div class="flex flex-col gap-1 min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-[12.5px] font-semibold" style={{ color: props.m.color }}>
            {props.m.nombre}
          </span>
          <Show
            when={props.m.activoDefault}
            fallback={
              <span class="text-[9.5px] uppercase tracking-wider text-v2-text-text-faint">apagado</span>
            }
          >
            <span
              class="text-[9.5px] uppercase tracking-wider font-semibold flex items-center gap-1"
              style={{ color: "#22c55e" }}
            >
              <span class="inline-block size-1.5 rounded-full" style={{ background: "#22c55e" }} />
              activo
            </span>
          </Show>
        </div>
        <span class="text-[11.5px] opacity-85 leading-snug">{props.m.que}</span>
        <span class="text-[10.5px] font-mono opacity-65 mt-0.5">
          <span class="text-[#EC5B2B]">›</span> {props.m.ejemplo}
        </span>
      </div>
    </div>
  )
}

function TabBtn(props: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="px-3 py-1.5 text-[12.5px] font-medium border-b-2 transition-colors"
      style={{
        "border-color": props.activo ? "#EC5B2B" : "transparent",
        color: props.activo ? "#EC5B2B" : "var(--v2-text-text-muted, #808080)",
      }}
    >
      {props.label}
    </button>
  )
}

function FiltroChip(props: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
      style={{
        background: props.activo ? "rgba(236,91,43,0.14)" : "transparent",
        border: `1px solid ${props.activo ? "rgba(236,91,43,0.4)" : "rgba(255,255,255,0.08)"}`,
        color: props.activo ? "#EC5B2B" : "var(--v2-text-text-muted, #808080)",
      }}
    >
      {props.label}
    </button>
  )
}
