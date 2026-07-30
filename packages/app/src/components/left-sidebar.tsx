import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js"
import { produce } from "solid-js/store"
import { Binary } from "@opencode-ai/core/util/binary"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { useSettingsCommand } from "@/components/settings-dialog"
import { getAuthInfo } from "@/auth/license-manager"
import { createHomeController } from "@/pages/home/home-controller"
import { createHomeProjectsController } from "@/pages/home/home-projects-controller"
import { createHomeSessionsController, type HomeSessionRecord } from "@/pages/home/home-sessions-controller"
import { displayName } from "@/pages/layout/helpers"
import { ServerConnection } from "@/context/server"
import { errorMessage } from "@/pages/layout/helpers"
import { sessionTitle } from "@/utils/session-title"
import { showToast } from "@/utils/toast"
import { ZenkaiLogoMark } from "@/components/zenkai-logo"

// ─── Estado colapsado COMPARTIDO (el toggle vive en el titlebar) ───
const STORAGE_KEY = "zenkai.leftSidebar.collapsed"
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}
// Signal COMPARTIDO y robusto ante HMR: se guarda en globalThis para que el titlebar
// (que importa toggleLeftSidebar) y el LeftSidebar usen SIEMPRE la misma instancia,
// aunque el hot-reload duplique el módulo en dev.
const _g = globalThis as unknown as { __zenkaiSidebarSignal?: ReturnType<typeof createSignal<boolean>> }
const [leftSidebarCollapsed, setLeftSidebarCollapsed] =
  _g.__zenkaiSidebarSignal ?? (_g.__zenkaiSidebarSignal = createSignal(readCollapsed()))
export { leftSidebarCollapsed }
export function toggleLeftSidebar() {
  const next = !leftSidebarCollapsed()
  setLeftSidebarCollapsed(next)
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
  } catch {
    /* ignore */
  }
}

// Panel lateral izquierdo fijo estilo Claude. Cuando está colapsado desaparece por
// completo (sin rail) — se reabre desde el botón del titlebar.
export function LeftSidebar() {
  const home = createHomeController()
  const sessions = createHomeSessionsController(home)
  const projects = createHomeProjectsController(home)
  const openSettings = useSettingsCommand()
  const dialog = useDialog()

  // Sección Proyectos del sidebar (colapsable, como HOY).
  const [proyectosColapsados, setProyectosColapsados] = createSignal(false)
  const listaProyectos = createMemo(() => projects.project.list())
  const servidorActivo = () => projects.server.list()[0]

  // Grupos de días colapsables: guardamos los títulos ocultos en un Set.
  const [colapsados, setColapsados] = createSignal<Set<string>>(new Set())
  const estaColapsado = (t: string) => colapsados().has(t)
  const toggleGrupo = (t: string) =>
    setColapsados((prev) => {
      const n = new Set(prev)
      n.has(t) ? n.delete(t) : n.add(t)
      return n
    })
  const leerNombre = () => {
    try {
      return localStorage.getItem("zenkai-username") ?? ""
    } catch {
      return ""
    }
  }
  const [userName, setUserName] = createSignal(leerNombre())
  // Revalidamos al volver a la ventana: si el usuario cambió su nombre en Ajustes, el
  // avatar/footer se actualizan (antes se leía una sola vez y quedaba obsoleto).
  onMount(() => {
    const refrescar = () => setUserName(leerNombre())
    window.addEventListener("focus", refrescar)
    onCleanup(() => window.removeEventListener("focus", refrescar))
  })

  const openHelp = () => {
    void import("@/components/dialog-help-guide").then((x) => {
      void dialog.show(() => <x.DialogHelpGuide />)
    })
  }

  const openTareas = () => {
    void import("@/components/dialog-tareas-programadas").then((x) => dialog.show(() => <x.DialogTareasProgramadas />))
  }

  const loading = createMemo(() => sessions.data.loading())
  // Dedup: una misma sesión no debe aparecer dos veces (ni entre grupos).
  const dedupedGroups = createMemo(() => {
    const seen = new Set<string>()
    return sessions.data
      .groups()
      .map((group) => ({
        ...group,
        sessions: group.sessions.filter((record) => {
          const id = record.session.id
          if (seen.has(id)) return false
          seen.add(id)
          return true
        }),
      }))
      .filter((group) => group.sessions.length > 0)
  })

  // Antes había un signal `query` sin input real que lo alimentara — se removió.
  // Si en el futuro sumamos buscador, se re-agrega acá con su <input> asociado.
  const filteredGroups = dedupedGroups

  // Quita la sesión del store local para reflejar el cambio al instante.
  // El borrado de sesión vive en un solo lugar: sessions.session.archive
  // (home-sessions-controller). Antes había un deleteSession duplicado acá que
  // hacía splice del store equivocado y por eso la sesión no desaparecía.

  const renameSession = async (session: Session, title: string) => {
    const ctx = home.server.focusedContext()
    if (!ctx) return
    const next = title.trim()
    if (!next || next === sessionTitle(session.title)) return
    try {
      await ctx.sdk.client.session.update({ sessionID: session.id, directory: session.directory, title: next })
      const [, setStore] = ctx.sync.child(session.directory)
      setStore(
        produce((draft) => {
          const match = Binary.search(draft.session, session.id, (item) => item.id)
          if (match.found) draft.session[match.index].title = next
        }),
      )
    } catch (cause) {
      showToast({
        title: "No se pudo renombrar el chat",
        description: errorMessage(cause, "No se pudo renombrar el chat"),
      })
    }
  }

  return (
    <Show when={!leftSidebarCollapsed()}>
      <aside class="relative flex h-full w-[260px] shrink-0 flex-col border-r border-v2-border-border-muted bg-v2-background-bg-layer-01">
        {/* Header: marca */}
        <div class="flex h-12 shrink-0 items-center px-3 select-none">
          <ZenkaiLogoMark size={18} />
          <span class="ml-2 text-13-medium tracking-wide text-v2-text-text-strong">ZENKAI</span>
        </div>

        {/* Dos accesos INDEPENDIENTES lado a lado: Nuevo chat + Proyectos.
            Iguales de tamaño, con identidad visual propia. El de proyectos
            despliega la lista debajo al click. */}
        <div class="shrink-0 grid grid-cols-2 gap-1.5 px-2 pb-2">
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-1 rounded-lg border border-v2-border-border-muted px-2 py-2.5 text-center transition-all hover:border-[#EC5B2B]/50 hover:bg-[#EC5B2B]/8 disabled:opacity-40 disabled:pointer-events-none"
            disabled={!sessions.session.canCreate()}
            onClick={() => sessions.session.create()}
            title="Nuevo chat (Ctrl+N)"
          >
            <IconV2 name="edit" size="small" style={{ color: "#EC5B2B" }} />
            <span class="text-[11px] font-medium text-v2-text-text-strong">Nuevo chat</span>
          </button>
          <button
            type="button"
            onClick={() => setProyectosColapsados((v) => !v)}
            class="flex flex-col items-center justify-center gap-1 rounded-lg border border-v2-border-border-muted px-2 py-2.5 text-center transition-all hover:border-[#EC5B2B]/50 hover:bg-[#EC5B2B]/8"
            title={proyectosColapsados() ? "Ver proyectos" : "Ocultar proyectos"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EC5B2B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span class="text-[11px] font-medium text-v2-text-text-strong flex items-center gap-1">
              Proyectos
              <span class="text-[9px] text-v2-text-text-faint">({listaProyectos().length})</span>
            </span>
          </button>
        </div>

        {/* Lista desplegable de proyectos — solo cuando el usuario hace click
            en la card "Proyectos". Botón "+" para agregar carpeta. */}
        <div class="shrink-0 px-2 pb-2">
          <Show when={!proyectosColapsados() && listaProyectos().length > 0}>
            <div class="flex items-center justify-between px-1 pb-1">
              <span class="text-[10px] font-medium uppercase tracking-wider text-v2-text-text-faint">
                Carpetas activas
              </span>
              <Show when={servidorActivo()}>
                <button
                  type="button"
                  onClick={() => {
                    const s = servidorActivo()
                    if (s) projects.project.choose(s)
                  }}
                  title="Agregar carpeta"
                  aria-label="Agregar carpeta"
                  class="flex size-5 items-center justify-center rounded-md text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-[#EC5B2B]"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </Show>
            </div>
          </Show>
          <Show when={!proyectosColapsados()}>
            <div class="flex flex-col gap-0.5 pt-1">
              <Show
                when={listaProyectos().length > 0}
                fallback={
                  <button
                    type="button"
                    onClick={() => {
                      const s = servidorActivo()
                      if (s) projects.project.choose(s)
                    }}
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-13-regular text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                  >
                    <span class="text-[#EC5B2B]">+</span>
                    <span>Agregar carpeta</span>
                  </button>
                }
              >
                <For each={listaProyectos()}>
                  {(proyecto) => {
                    const s = servidorActivo()
                    const sel = () =>
                      s
                        ? projects.selection.value().server === ServerConnection.key(s) &&
                          projects.selection.value().directory === proyecto.worktree
                        : false
                    const cerrar = (e: MouseEvent) => {
                      e.stopPropagation()
                      e.preventDefault()
                      if (!s) return
                      const ok =
                        typeof window === "undefined"
                          ? true
                          : window.confirm(
                              `¿Quitar "${displayName(proyecto)}" de la lista? La carpeta en disco NO se borra.`,
                            )
                      if (ok) projects.project.close(s, proyecto.worktree)
                    }
                    return (
                      <div
                        class="group relative flex w-full items-center rounded-md text-13-regular text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
                        classList={{ "bg-v2-overlay-simple-overlay-hover !text-v2-text-text-strong": sel() }}
                      >
                        <Show when={sel()}>
                          <span class="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full" style={{ "background-color": "#EC5B2B" }} />
                        </Show>
                        <button
                          type="button"
                          onClick={() => s && projects.project.select(s, proyecto.worktree)}
                          title={proyecto.worktree}
                          class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                        >
                          <div
                            class="flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
                            style={{ background: "rgba(236,91,43,0.14)", color: "#EC5B2B" }}
                          >
                            {displayName(proyecto).charAt(0).toUpperCase()}
                          </div>
                          <span class="min-w-0 flex-1 truncate">{displayName(proyecto)}</span>
                        </button>
                        {/* Botón × visible al hover — cierra el proyecto (lo saca de la lista,
                            no borra el disco). Antes había que hacer right-click. */}
                        <button
                          type="button"
                          onClick={cerrar}
                          title="Quitar de la lista"
                          aria-label="Quitar proyecto de la lista"
                          class="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-v2-icon-icon-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-status-text-danger"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                    )
                  }}
                </For>
              </Show>
            </div>
          </Show>
        </div>

        {/* Historial */}
        <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar px-2">
          <Show
            when={!loading()}
            fallback={
              <div class="flex flex-col gap-1 pt-1">
                <For each={[0, 1, 2, 3, 4]}>
                  {() => <div class="h-7 w-full animate-pulse rounded-md bg-v2-background-bg-layer-02 opacity-60" />}
                </For>
              </div>
            }
          >
            <For
              each={filteredGroups()}
              fallback={
                <p class="px-2 pt-2 text-13-regular text-v2-text-text-faint select-none">
                  Sin chats todavía
                </p>
              }
            >
              {(group) => (
                <div class="flex flex-col gap-0.5 pb-2">
                  {/* Header del grupo: click para ocultar/mostrar los chats de ese día (como Claude) */}
                  <button
                    type="button"
                    onClick={() => toggleGrupo(group.title)}
                    class="flex w-full items-center gap-1 select-none px-2 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-v2-text-text-faint transition-colors hover:text-v2-text-text-base"
                  >
                    <IconV2
                      name="outline-chevron-down"
                      size="small"
                      class="transition-transform"
                      style={{ transform: estaColapsado(group.title) ? "rotate(-90deg)" : "none" }}
                    />
                    {group.title}
                  </button>
                  <Show when={!estaColapsado(group.title)}>
                    <For each={group.sessions}>
                      {(record) => (
                        <SessionRow
                          record={record}
                          sessions={sessions}
                          onRename={(title) => renameSession(record.session, title)}
                          onDelete={() => void sessions.session.archive(record.session)}
                        />
                      )}
                    </For>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>

        {/* Footer: perfil + íconos (Ajustes / Diagnóstico / Ayuda) */}
        <div class="shrink-0 border-t border-v2-border-border-muted">
          {/* Renglón de perfil */}
          <div class="flex items-center gap-2 px-3 pt-2 pb-1 select-none">
            <div
              class="flex size-7 shrink-0 items-center justify-center rounded-full text-13-medium"
              style={{ background: "rgba(236,91,43,0.15)", color: "#EC5B2B" }}
            >
              {(userName() || "U").charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0 flex-1 truncate text-13-regular text-v2-text-text-base">
              <span class="text-v2-text-text-strong">{userName() || "Usuario"}</span>
              <Show when={getAuthInfo()?.tier}>
                <span class="text-v2-text-text-faint"> · {getAuthInfo()?.tier}</span>
              </Show>
            </div>
          </div>
          {/* Footer minimal estilo Claude: texto claro (los íconos genéricos no se entendían).
              Modelos, imagen y skills viven en el chat (selector de modelos / barra del compositor),
              no acá, para no duplicar ni ocupar espacio. */}
          <div class="flex items-center gap-1 px-3 pb-2 pt-1 text-12-medium">
            <FooterText icon={<IcoAjustes />} label="Ajustes" onClick={() => openSettings()} />
            <FooterText icon={<IcoTareas />} label="Tareas" onClick={openTareas} />
            <FooterText icon={<IcoAyuda />} label="Ayuda" onClick={openHelp} />
          </div>
        </div>
      </aside>
    </Show>
  )
}

function FooterText(props: { icon: JSX.Element; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md px-2 py-1 text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-strong"
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </button>
  )
}

// Íconos PIXEL (8-bit) del footer — mismo lenguaje visual que el logo ZENKAI.
// Cuadrícula de 12×12 con celdas rectas: nada de curvas ni gradientes. Se dibuja
// con <rect> discretos para que el look "arcade / terminal" sea consistente con
// la marca. Escala fija a 15px para que combine con el resto del sidebar.
type Celda = [number, number] // [x, y] en la grilla 12×12
function IcoPixel(props: { celdas: Celda[] }) {
  return (
    <svg width="15" height="15" viewBox="0 0 12 12" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">
      <For each={props.celdas}>
        {([x, y]) => <rect x={x} y={y} width="1" height="1" />}
      </For>
    </svg>
  )
}
// Engranaje 8-bit: cuadrado con "dientes" en las 4 direcciones y hueco central.
const IcoAjustes = () => (
  <IcoPixel
    celdas={[
      [5, 1], [6, 1],
      [2, 2], [5, 2], [6, 2], [9, 2],
      [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3],
      [3, 4], [4, 4], [7, 4], [8, 4],
      [1, 5], [2, 5], [3, 5], [8, 5], [9, 5], [10, 5],
      [1, 6], [2, 6], [3, 6], [8, 6], [9, 6], [10, 6],
      [3, 7], [4, 7], [7, 7], [8, 7],
      [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8],
      [2, 9], [5, 9], [6, 9], [9, 9],
      [5, 10], [6, 10],
    ]}
  />
)
// Reloj 8-bit: marco cuadrado con dos manecillas y pip central.
const IcoTareas = () => (
  <IcoPixel
    celdas={[
      [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1],
      [2, 2], [9, 2],
      [1, 3], [10, 3],
      [1, 4], [5, 4], [10, 4],
      [1, 5], [5, 5], [10, 5],
      [1, 6], [5, 6], [6, 6], [7, 6], [10, 6],
      [1, 7], [10, 7],
      [1, 8], [10, 8],
      [2, 9], [9, 9],
      [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10],
    ]}
  />
)
// Signo de pregunta 8-bit dentro de un marco.
const IcoAyuda = () => (
  <IcoPixel
    celdas={[
      [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1],
      [2, 2], [9, 2],
      [1, 3], [4, 3], [5, 3], [6, 3], [10, 3],
      [1, 4], [3, 4], [7, 4], [10, 4],
      [1, 5], [6, 5], [10, 5],
      [1, 6], [5, 6], [10, 6],
      [1, 7], [5, 7], [10, 7],
      [1, 8], [5, 8], [10, 8],
      [2, 9], [9, 9],
      [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10],
    ]}
  />
)

function SessionRow(props: {
  record: HomeSessionRecord
  sessions: ReturnType<typeof createHomeSessionsController>
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || "Nuevo chat")
  const active = createMemo(() => props.sessions.tab.isOpen(props.record))
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal("")

  const startRename = () => {
    setDraft(title())
    setEditing(true)
  }
  const commitRename = () => {
    if (!editing()) return
    setEditing(false)
    props.onRename(draft())
  }
  const confirmDelete = () => {
    const ok = typeof window === "undefined" ? true : window.confirm(`¿Borrar "${title()}"? Esta acción no se puede deshacer.`)
    if (ok) props.onDelete()
  }

  return (
    <div
      class="group relative flex w-full items-center rounded-md text-14-regular text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
      classList={{ "bg-v2-overlay-simple-overlay-hover !text-v2-text-text-strong": active() && !editing() }}
    >
      <Show when={active()}>
        <span
          class="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full"
          style={{ "background-color": "#EC5B2B" }}
        />
      </Show>

      <Show
        when={!editing()}
        fallback={
          <input
            type="text"
            value={draft()}
            ref={(el) => queueMicrotask(() => { el.focus(); el.select() })}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitRename()
              } else if (e.key === "Escape") {
                e.preventDefault()
                setEditing(false)
              }
            }}
            class="min-w-0 flex-1 rounded-md border border-v2-border-border-base bg-v2-background-bg-layer-02 py-1 pl-3 pr-2 text-14-regular text-v2-text-text-strong focus:outline-none"
          />
        }
      >
        <button
          type="button"
          class="min-w-0 flex-1 truncate py-1.5 pl-3 pr-2 text-left"
          title={title()}
          onClick={() => props.sessions.session.open(props.record.session)}
        >
          {title()}
        </button>

        {/* Acciones inline al hover: renombrar / borrar (sin desplegable, no se corta) */}
        <div class="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Renombrar"
            aria-label="Renombrar chat"
            class="flex size-6 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-strong"
            onClick={(e) => {
              e.stopPropagation()
              startRename()
            }}
          >
            <IconV2 name="edit" size="small" />
          </button>
          <button
            type="button"
            title="Borrar"
            aria-label="Borrar chat"
            class="flex size-6 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-status-text-danger"
            onClick={(e) => {
              e.stopPropagation()
              confirmDelete()
            }}
          >
            <IconV2 name="close" size="small" />
          </button>
        </div>
      </Show>
    </div>
  )
}
