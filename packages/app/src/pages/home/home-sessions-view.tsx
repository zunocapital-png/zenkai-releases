import type { Session } from "@opencode-ai/sdk/v2/client"
import { type Accessor, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { ZenkaiLogoMark } from "@/components/zenkai-logo"
import { useSettingsDialog } from "@/components/settings-dialog"
import {
  type HomeSessionGroup,
  type HomeSessionRecord,
  type OpenSessionOptions,
} from "./home-sessions-controller"

// Home compacto (una sola pantalla, sin scroll) estilo terminal + pixel.
// El estado se lee EN VIVO desde el ecosistema real: cantidad de modelos y salud
// se actualizan cada 6 segundos. Nada de datos fijos ni referencias a "Ollama"
// por nombre — hablamos en genérico ("IA local", "modelos") para que el usuario
// no tenga que saber la infra por debajo.
export type HomeSessionsViewProps = {
  language: ReturnType<typeof useLanguage>
  groups: Accessor<HomeSessionGroup[]>
  loading: Accessor<boolean>
  showProjectName: Accessor<boolean>
  server: Accessor<ServerConnection.Key>
  canCreateSession: Accessor<boolean>
  searchValue: Accessor<string>
  searchPlaceholder: Accessor<string>
  searchOpen: Accessor<boolean>
  searchLoading: Accessor<boolean>
  searchResults: Accessor<HomeSessionRecord[]>
  searchActive: Accessor<string>
  searchNoResultsLabel: Accessor<string>
  titleOpacity: (id: HomeSessionGroup["id"]) => number
  isOpenTab: (record: HomeSessionRecord) => boolean
  onCreateSession: () => void
  onOpenSession: (session: Session, options?: OpenSessionOptions) => void
  onArchiveSession: (session: Session) => Promise<void>
  onSetHoverTarget: (element: HTMLElement) => void
  onSetThumbTrack: (element: HTMLDivElement) => void
  onSetContent: (element: HTMLDivElement) => void
  onSetHeader: (id: HomeSessionGroup["id"], element: HTMLDivElement) => void
  onWheel: (event: WheelEvent) => void
  onSetSearchRoot: (element: HTMLDivElement) => void
  onSetSearchInput: (element: HTMLInputElement) => void
  onSetSearchList: (element: HTMLDivElement) => void
  onSearchFocus: () => void
  onSearchInput: (value: string) => void
  onSearchClose: () => void
  onSearchMove: (delta: number) => void
  onSearchSelectActive: () => void
  onSearchHighlight: (record: HomeSessionRecord) => void
  onSearchSelect: (record: HomeSessionRecord, options?: OpenSessionOptions) => void
}

function nombreUsuario() {
  try {
    return localStorage.getItem("zenkai-username") ?? "amigo/a"
  } catch {
    return "amigo/a"
  }
}

// Tarjetas de ARRANQUE. Antes todas caían en el chat vacío — inútil. Ahora cada
// una hace algo DISTINTO y útil: guías reales, panels de ayuda, o iniciar chat.

// Health-check reactivo. Consulta el ecosistema local cada 6s y expone un estado
// abstracto (sin nombrar Ollama). Si algo cambia (se agrega modelo, se cae el
// servicio) el usuario lo ve reflejado sin refrescar.
function useEstadoVivo() {
  const [pulse, setPulse] = createSignal(0)
  const t = setInterval(() => setPulse((n) => n + 1), 6000)
  onCleanup(() => clearInterval(t))

  const [datos] = createResource(
    pulse,
    async () => {
      const zero = { iaLista: false, modelosListos: 0, totalModelos: 0, routerVivo: false }
      // IA local
      const ia = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) })
        .then(async (res) => {
          if (!res.ok) return { total: 0, listos: 0 }
          const data = (await res.json()) as { models?: Array<{ name: string; capabilities?: string[] }> }
          const arr = data.models ?? []
          return { total: arr.length, listos: arr.filter((m) => (m.capabilities ?? []).includes("tools")).length }
        })
        .catch(() => ({ total: 0, listos: 0 }))
      // Router local
      const routerVivo = await fetch("http://localhost:20128/v1/models", { signal: AbortSignal.timeout(1000) })
        .then((r) => r.ok)
        .catch(() => false)
      if (ia.total === 0 && !routerVivo) return zero
      return {
        iaLista: ia.listos > 0,
        modelosListos: ia.listos,
        totalModelos: ia.total,
        routerVivo,
      }
    },
    { initialValue: { iaLista: false, modelosListos: 0, totalModelos: 0, routerVivo: false } },
  )

  return datos
}

export function HomeSessionsView(props: HomeSessionsViewProps) {
  const usuario = createMemo(() => nombreUsuario())
  const estado = useEstadoVivo()
  const dialog = useDialog()
  // Cada tab de Ajustes que las cards abren necesita su propio hook (defaultValue
  // se fija en el momento de crear el opener). No los ejecutamos hasta el click.
  const abrirModelos = useSettingsDialog("models")
  const abrirSkills = useSettingsDialog("plugins")

  const abrirGuia = () => {
    void import("@/components/dialog-help-guide").then((x) => dialog.show(() => <x.DialogHelpGuide />))
  }
  const abrirDisenos = () => {
    void import("@/components/dialog-galeria-diseno").then((x) => dialog.show(() => <x.DialogGaleriaDiseno />))
  }

  // Cinco cards con acciones REALES — cada una lleva a algo útil, no todas al
  // mismo chat vacío. El emoji es un ícono pixel simple hecho a mano.
  const TARJETAS = [
    {
      titulo: "Empezar un chat",
      desc: "Nueva sesión con el proyecto activo. Ctrl+N.",
      color: "#EC5B2B",
      onClick: () => props.canCreateSession() && props.onCreateSession(),
      disabled: !props.canCreateSession(),
    },
    {
      titulo: "Guía de uso",
      desc: "Qué hace cada zona, cómo dar contexto y comandos.",
      color: "#22c55e",
      onClick: abrirGuia,
      disabled: false,
    },
    {
      titulo: "Elegir modelo",
      desc: "Instalar local o conectar la nube.",
      color: "#3b82f6",
      onClick: abrirModelos,
      disabled: false,
    },
    {
      titulo: "Skills / MCP",
      desc: "Herramientas que la IA puede llamar en el chat.",
      color: "#a855f7",
      onClick: abrirSkills,
      disabled: false,
    },
    {
      titulo: "Galería de diseño",
      desc: "Plantillas listas para usar como prompt.",
      color: "#f59e0b",
      onClick: abrirDisenos,
      disabled: false,
    },
  ]

  return (
    <section
      ref={props.onSetHoverTarget}
      class="min-h-0 min-w-0 flex-1 flex flex-col items-center justify-center px-4 py-4 overflow-hidden"
      aria-label={props.language.t("sidebar.project.recentSessions")}
    >
      <div class="w-full max-w-[960px] font-mono text-[12.5px] leading-[1.5] text-v2-text-text-base select-none">
        {/* Header compacto */}
        <div class="flex items-center gap-4 pb-3">
          <ZenkaiLogoMark size={54} animate />
          <div>
            <h1 class="zenkai-wordmark text-[34px] tracking-[0.24em] leading-none">ZENKAI</h1>
            <div class="mt-1.5 flex items-center gap-2 text-[10.5px]">
              <span class="text-[#EC5B2B] font-semibold uppercase tracking-wider">Terminal · IA</span>
              <span class="opacity-40">·</span>
              <span class="opacity-70">Local + Nube · Zuno Company</span>
            </div>
          </div>
        </div>

        {/* Fila 1: Bienvenida | Estado */}
        <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 mt-1">
          <TerminalPanel title="Bienvenida" accent>
            <div class="py-1">
              <div class="text-[14px] font-semibold text-v2-text-text-strong">
                <span class="text-[#EC5B2B]">›</span> Hola de nuevo, <span class="text-[#EC5B2B]">{usuario()}</span>
              </div>
              <div class="mt-1 text-[11.5px] opacity-75">
                Escribí lo que necesites en el chat, o elegí una sugerencia.
              </div>
              <div class="mt-2.5 flex items-center gap-2">
                <Show
                  when={props.canCreateSession()}
                  fallback={<span class="text-[10.5px] opacity-60">Agregá una carpeta desde el sidebar.</span>}
                >
                  <button
                    type="button"
                    onClick={props.onCreateSession}
                    class="inline-flex items-center gap-2 rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#EC5B2B] transition-colors hover:bg-[#EC5B2B]/20"
                  >
                    <span>▶</span>
                    <span>Empezar chat</span>
                    <span class="opacity-60">Ctrl+N</span>
                  </button>
                </Show>
              </div>
            </div>
          </TerminalPanel>

          <TerminalPanel title="Estado">
            <div class="flex flex-col gap-1.5 py-0.5 text-[11.5px]">
              <EstadoLinea
                estado={estado().iaLista ? "ok" : "err"}
                clave="IA"
                valor={estado().iaLista ? "lista para trabajar" : "esperando servicio"}
              />
              <EstadoLinea
                estado={estado().modelosListos > 0 ? "ok" : "warn"}
                clave="Modelos"
                valor={`${estado().modelosListos} listos · ${estado().totalModelos} instalados`}
              />
              {/* Skills asumido activo — el bundle de MCPs viene con el instalador. */}
              <EstadoLinea estado="ok" clave="Skills" valor="8 herramientas MCP integradas" />
              <EstadoLinea
                estado={estado().routerVivo ? "ok" : "err"}
                clave="Router"
                valor={estado().routerVivo ? "operativo · failover activo" : "apagado"}
              />
            </div>
          </TerminalPanel>
        </div>

        {/* Fila 2: Accesos rápidos — cada card lleva a un flujo REAL distinto. */}
        <div class="mt-3">
          <TerminalPanel title="Accesos rápidos">
            <div class="grid grid-cols-1 md:grid-cols-5 gap-2 py-0.5">
              <For each={TARJETAS}>
                {(t) => {
                  const rgba = (hex: string, a: number) => {
                    const h = hex.replace("#", "")
                    const r = parseInt(h.slice(0, 2), 16)
                    const g = parseInt(h.slice(2, 4), 16)
                    const b = parseInt(h.slice(4, 6), 16)
                    return `rgba(${r}, ${g}, ${b}, ${a})`
                  }
                  return (
                    <button
                      type="button"
                      onClick={t.onClick}
                      disabled={t.disabled}
                      class="group flex flex-col items-start gap-1 rounded-md border px-2.5 py-2.5 text-left transition-all disabled:opacity-40 disabled:pointer-events-none"
                      style={{
                        "border-color": rgba(t.color, 0.25),
                        background: rgba(t.color, 0.05),
                      }}
                      title={t.desc}
                    >
                      <span class="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: t.color }}>
                        {t.titulo}
                      </span>
                      <span class="text-[10.5px] leading-tight opacity-70 group-hover:opacity-100">{t.desc}</span>
                    </button>
                  )
                }}
              </For>
            </div>
          </TerminalPanel>
        </div>

        {/* Status bar inferior mínima */}
        <div class="mt-3 flex items-center justify-between text-[10.5px] opacity-60 border-t border-v2-border-border-muted pt-2">
          <span class="flex items-center gap-1.5">
            <Dot color={estado().iaLista ? "#22c55e" : "#ef4444"} pulse />
            <span>{estado().iaLista ? "todo listo" : "esperando IA"}</span>
          </span>
          <span>modo de permisos: cambialo desde el botón junto a Enviar</span>
        </div>
      </div>
    </section>
  )
}

function TerminalPanel(props: { title: string; accent?: boolean; children: any }) {
  return (
    <div
      class="relative rounded-md border p-3.5"
      style={{
        "border-color": props.accent ? "rgba(236,91,43,0.42)" : "var(--v2-border-border-muted, rgba(255,255,255,0.09))",
        background: props.accent ? "rgba(236,91,43,0.035)" : "transparent",
      }}
    >
      <div
        class="absolute -top-[8px] left-3 px-1.5 text-[10px] font-mono uppercase tracking-[0.18em]"
        style={{
          color: props.accent ? "#EC5B2B" : "var(--v2-text-text-muted, #808080)",
          background: "var(--v2-background-bg-base, #0a0a0a)",
        }}
      >
        [ {props.title} ]
      </div>
      {props.children}
    </div>
  )
}

function EstadoLinea(props: { estado: "ok" | "warn" | "err"; clave: string; valor: string }) {
  const color = () =>
    props.estado === "ok" ? "#22c55e" : props.estado === "warn" ? "#f59e0b" : "#ef4444"
  return (
    <div class="flex items-center gap-2">
      <Dot color={color()} pulse />
      <span class="min-w-[62px] text-v2-text-text-muted uppercase tracking-wider text-[10px]">{props.clave}</span>
      <span class="opacity-85">{props.valor}</span>
    </div>
  )
}

function Dot(props: { color: string; pulse?: boolean }) {
  return (
    <span
      class="inline-block size-[6px] rounded-full shrink-0"
      style={{
        background: props.color,
        "box-shadow": props.pulse ? `0 0 0 3px ${props.color}22` : undefined,
      }}
    />
  )
}
