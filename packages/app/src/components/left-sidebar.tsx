import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useSettingsCommand } from "@/components/settings-dialog"
import { createHomeController } from "@/pages/home/home-controller"
import { createHomeSessionsController, type HomeSessionRecord } from "@/pages/home/home-sessions-controller"
import { sessionTitle } from "@/utils/session-title"
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
const [leftSidebarCollapsed, setLeftSidebarCollapsed] = createSignal(readCollapsed())
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

  const openHelp = () => {
    void import("@/components/dialog-help-guide").then((x) => {
      void dialog.show(() => <x.DialogHelpGuide />)
    })
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

        {/* Historial */}
        <div class="min-h-0 flex-1 overflow-y-auto px-2">
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
              each={dedupedGroups()}
              fallback={<p class="px-2 pt-2 text-13-regular text-v2-text-text-faint select-none">Sin chats todavía</p>}
            >
              {(group) => (
                <div class="flex flex-col gap-0.5 pb-2">
                  <div class="select-none px-2 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-v2-text-text-faint">
                    {group.title}
                  </div>
                  <For each={group.sessions}>{(record) => <SessionRow record={record} sessions={sessions} />}</For>
                </div>
              )}
            </For>
          </Show>
        </div>

        {/* Footer: Ajustes / Ayuda */}
        <div class="flex shrink-0 flex-col gap-0.5 border-t border-v2-border-border-muted p-2">
          <FooterButton icon="settings-gear" label="Ajustes" onClick={() => openSettings()} />
          <FooterButton icon="help" label="Ayuda" onClick={openHelp} />
        </div>
      </aside>
    </Show>
  )
}

function FooterButton(props: { icon: "settings-gear" | "help"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-14-regular text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-strong"
      onClick={props.onClick}
    >
      <IconV2 name={props.icon} size="small" class="text-v2-icon-icon-muted" />
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
    </button>
  )
}

function SessionRow(props: { record: HomeSessionRecord; sessions: ReturnType<typeof createHomeSessionsController> }) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || "Nuevo chat")
  const active = createMemo(() => props.sessions.tab.isOpen(props.record))
  return (
    <button
      type="button"
      class="group relative flex w-full items-center rounded-md py-1.5 pl-3 pr-2 text-left text-14-regular text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
      classList={{ "bg-v2-overlay-simple-overlay-hover !text-v2-text-text-strong": active() }}
      title={title()}
      onClick={() => props.sessions.session.open(props.record.session)}
    >
      <Show when={active()}>
        <span
          class="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full"
          style={{ "background-color": "#EC5B2B" }}
        />
      </Show>
      <span class="min-w-0 flex-1 truncate">{title()}</span>
    </button>
  )
}
