import { createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"

// Registro curado de conectores MCP (skills). Cada uno agrega una capacidad al modelo
// (buscar en la web, manejar GitHub, un navegador, una base de datos…). "Agregar" escribe
// en config.mcp (merge seguro). Los que necesitan una key/config se agregan APAGADOS con
// aviso, para que no fallen hasta que el usuario los configure.
//
// Abajo, "Descubrir en GitHub": SUGERENCIAS con link — nunca instala solo (seguridad).

type Conector = {
  id: string
  nombre: string
  descripcion: string
  command: string[]
  requiereConfig?: string // texto del aviso si necesita key/argumento
}

const CONECTORES: Conector[] = [
  { id: "playwright", nombre: "Navegador (Playwright)", descripcion: "Deja que la IA navegue webs, haga clic y complete formularios.", command: ["npx", "-y", "@playwright/mcp@latest"] },
  { id: "puppeteer", nombre: "Navegador (Puppeteer)", descripcion: "Automatización de navegador headless para scraping y pruebas.", command: ["npx", "-y", "@modelcontextprotocol/server-puppeteer"] },
  { id: "sqlite", nombre: "Base de datos SQLite", descripcion: "Consultá y editá bases SQLite locales con lenguaje natural.", command: ["npx", "-y", "mcp-server-sqlite-npx"] },
  { id: "time", nombre: "Fecha y hora", descripcion: "Le da a la IA la hora real y conversión de zonas horarias.", command: ["npx", "-y", "@dandeliongold/mcp-time"] },
  { id: "git", nombre: "Git", descripcion: "Operar repos Git locales (estado, diffs, commits) desde el chat.", command: ["npx", "-y", "@cyanheads/git-mcp-server"] },
  { id: "github", nombre: "GitHub", descripcion: "Issues, PRs y repos de GitHub desde el chat.", command: ["npx", "-y", "@modelcontextprotocol/server-github"], requiereConfig: "Necesita un token de GitHub (GITHUB_PERSONAL_ACCESS_TOKEN)." },
  { id: "brave-search", nombre: "Búsqueda web (Brave)", descripcion: "Búsqueda web de calidad con la API de Brave.", command: ["npx", "-y", "@modelcontextprotocol/server-brave-search"], requiereConfig: "Necesita una API key de Brave Search (gratis)." },
  { id: "postgres", nombre: "PostgreSQL", descripcion: "Consultá tus bases Postgres en lenguaje natural.", command: ["npx", "-y", "@modelcontextprotocol/server-postgres"], requiereConfig: "Necesita la cadena de conexión de tu base." },
  { id: "notion", nombre: "Notion", descripcion: "Leé y escribí en tus páginas de Notion.", command: ["npx", "-y", "@notionhq/notion-mcp-server"], requiereConfig: "Necesita un token de integración de Notion." },
  { id: "slack", nombre: "Slack", descripcion: "Leer y enviar mensajes en tus canales de Slack.", command: ["npx", "-y", "@modelcontextprotocol/server-slack"], requiereConfig: "Necesita un token de bot de Slack." },
]

// Sugerencias de GitHub (curadas): NO se instalan solas, solo se muestran con link.
const DESCUBRIR: { nombre: string; que: string; url: string }[] = [
  { nombre: "modelcontextprotocol/servers", que: "Los servidores MCP oficiales (fuente de la mayoría de estos).", url: "https://github.com/modelcontextprotocol/servers" },
  { nombre: "punkpeye/awesome-mcp-servers", que: "Lista enorme y curada de MCP de la comunidad, por categoría.", url: "https://github.com/punkpeye/awesome-mcp-servers" },
  { nombre: "Registro oficial MCP", que: "Directorio buscable de conectores MCP.", url: "https://github.com/modelcontextprotocol/registry" },
]

export function DialogConectoresMcp() {
  const dialog = useDialog()
  const serverSync = useServerSync()
  const [creando, setCreando] = createSignal<string | undefined>(undefined)

  const mcpActual = () => (serverSync().data.config.mcp ?? {}) as Record<string, unknown>
  const yaAgregado = (id: string) => id in mcpActual()

  async function agregar(c: Conector) {
    if (creando()) return
    setCreando(c.id)
    try {
      const entrada = { type: "local", command: c.command, enabled: !c.requiereConfig }
      await serverSync().updateConfig({ mcp: { ...mcpActual(), [c.id]: entrada } as never })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: `${c.nombre} agregado`,
        description: c.requiereConfig ? "Quedó apagado hasta que lo configures." : "Ya está activo para el modelo.",
      })
    } catch (e) {
      showToast({ variant: "error", title: "No se pudo agregar", description: e instanceof Error ? e.message : "Intentá de nuevo." })
    } finally {
      setCreando(undefined)
    }
  }

  return (
    <Dialog
      size="large"
      title="Conectores MCP (skills)"
      class="w-[min(calc(100vw-40px),720px)] h-[min(calc(100vh-40px),680px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          Los conectores MCP le suman capacidades al modelo (navegar, bases de datos, GitHub, búsqueda…). Tocá "Agregar"
          y queda disponible. Requieren Node instalado; los que piden una key se agregan apagados hasta que los
          configures.
        </p>

        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <For each={CONECTORES}>
            {(c) => (
              <div class="flex flex-col gap-2 rounded-lg border border-border-base bg-surface-raised p-4">
                <div class="flex flex-col gap-0.5">
                  <div class="flex items-center gap-2">
                    <span class="text-14-medium text-text-strong">{c.nombre}</span>
                    <Show when={yaAgregado(c.id)}>
                      <span class="text-12-medium text-green-400">✓ Agregado</span>
                    </Show>
                  </div>
                  <span class="text-12-regular text-text-muted">{c.descripcion}</span>
                  <Show when={c.requiereConfig}>
                    <span class="text-11-regular text-yellow-400">⚠ {c.requiereConfig}</span>
                  </Show>
                </div>
                <button
                  type="button"
                  disabled={creando() === c.id || yaAgregado(c.id)}
                  onClick={() => void agregar(c)}
                  class="mt-auto self-start rounded-md bg-orange-500 px-3.5 py-1.5 text-12-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {yaAgregado(c.id) ? "Agregado" : creando() === c.id ? "Agregando…" : "Agregar"}
                </button>
              </div>
            )}
          </For>
        </div>

        {/* Descubrir más en GitHub (sugerencias, no instala) */}
        <div class="flex flex-col gap-2 rounded-lg border border-border-base bg-surface-base p-4">
          <span class="text-13-medium text-text-strong">Descubrir más en GitHub</span>
          <p class="text-12-regular text-text-muted">
            Miles de conectores más, mantenidos por la comunidad. Por seguridad no se instalan solos: revisalos y
            agregalos como proveedor MCP cuando confíes en ellos.
          </p>
          <div class="flex flex-col gap-1.5">
            <For each={DESCUBRIR}>
              {(d) => (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  class="flex items-center justify-between gap-3 rounded-md border border-border-base bg-surface-raised px-3 py-2 hover:bg-surface-hover"
                >
                  <span class="flex min-w-0 flex-col">
                    <span class="truncate text-12-medium text-text-strong">{d.nombre}</span>
                    <span class="truncate text-11-regular text-text-muted">{d.que}</span>
                  </span>
                  <span class="shrink-0 text-12-medium text-orange-500">Abrir ↗</span>
                </a>
              )}
            </For>
          </div>
        </div>

        <div class="mt-1 flex items-center justify-end">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover"
          >
            Listo
          </button>
        </div>
      </div>
    </Dialog>
  )
}
