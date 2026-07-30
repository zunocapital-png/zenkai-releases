import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { produce } from "solid-js/store"
import { Binary } from "@opencode-ai/core/util/binary"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { useSettingsCommand } from "@/components/settings-dialog"
import { getAuthInfo } from "@/auth/license-manager"
import { createHomeController } from "@/pages/home/home-controller"
import { createHomeSessionsController, type HomeSessionRecord } from "@/pages/home/home-sessions-controller"
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
  const openSettings = useSettingsCommand()
  const dialog = useDialog()

  const [query, setQuery] = createSignal("")
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

  const openDiagnostico = () => {
    void import("@/components/dialog-diagnostico").then((x) => dialog.show(() => <x.DialogDiagnostico />))
  }
  const openCrearAgente = () => {
    void import("@/components/dialog-crear-agente").then((x) => dialog.show(() => <x.DialogCrearAgente />))
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

  // Filtro por título (case-insensitive); descarta grupos que queden vacíos.
  const filteredGroups = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return dedupedGroups()
    return dedupedGroups()
      .map((group) => ({
        ...group,
        sessions: group.sessions.filter((record) =>
          (sessionTitle(record.session.title) || "Nuevo chat").toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.sessions.length > 0)
  })

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

        {/* Nuevo chat */}
        <div class="shrink-0 px-2 pb-2">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-lg border border-v2-border-border-muted px-2.5 py-2 text-left text-14-medium text-v2-text-text-strong transition-colors hover:border-[#EC5B2B]/50 hover:bg-[#EC5B2B]/8 disabled:opacity-40 disabled:pointer-events-none"
            disabled={!sessions.session.canCreate()}
            onClick={() => sessions.session.create()}
          >
            <IconV2 name="edit" size="small" style={{ color: "#EC5B2B" }} />
            <span class="min-w-0 flex-1 truncate">Nuevo chat</span>
          </button>
        </div>

        {/* Buscador de chats */}
        <div class="shrink-0 px-2 pb-2">
          <div class="flex items-center gap-2 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-1.5 focus-within:border-v2-border-border-base">
            <IconV2 name="magnifying-glass" size="small" class="shrink-0 text-v2-icon-icon-muted" />
            <input
              type="text"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder="Buscar chats…"
              class="min-w-0 flex-1 bg-transparent text-14-regular text-v2-text-text-base placeholder:text-v2-text-text-faint focus:outline-none"
            />
            <Show when={query()}>
              <button
                type="button"
                class="shrink-0 text-v2-icon-icon-muted transition-colors hover:text-v2-text-text-strong"
                aria-label="Limpiar búsqueda"
                onClick={() => setQuery("")}
              >
                <IconV2 name="xmark-small" size="small" />
              </button>
            </Show>
          </div>
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
                  {query().trim() ? "Sin resultados" : "Sin chats todavía"}
                </p>
              }
            >
              {(group) => (
                <div class="flex flex-col gap-0.5 pb-2">
                  <div class="select-none px-2 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-v2-text-text-faint">
                    {group.title}
                  </div>
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
          {/* Fila de íconos */}
          <div class="flex items-center gap-1 px-2 pb-1.5">
            <FooterIcon icon="settings-gear" label="Ajustes" onClick={() => openSettings()} />
            <FooterIcon icon="plus" label="Crear agente" onClick={openCrearAgente} />
            <FooterIcon icon="timer" label="Tareas programadas" onClick={openTareas} />
            <FooterIcon icon="monitor" label="Diagnóstico" onClick={openDiagnostico} />
            <FooterIcon icon="help" label="Ayuda" onClick={openHelp} />
          </div>
        </div>
      </aside>
    </Show>
  )
}

function FooterIcon(props: {
  icon: "settings-gear" | "help" | "monitor" | "plus" | "timer"
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      class="flex size-8 items-center justify-center rounded-md text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-strong"
      onClick={props.onClick}
    >
      <IconV2 name={props.icon} size="small" />
    </button>
  )
}

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
