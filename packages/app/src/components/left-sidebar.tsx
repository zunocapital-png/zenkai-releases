import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useSettingsCommand } from "@/components/settings-dialog"
import { createHomeController } from "@/pages/home/home-controller"
import {
  createHomeSessionsController,
  type HomeSessionRecord,
} from "@/pages/home/home-sessions-controller"
import { sessionTitle } from "@/utils/session-title"

const STORAGE_KEY = "zenkai.leftSidebar.collapsed"

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

// Panel lateral izquierdo fijo estilo Claude: nuevo chat, historial por fecha,
// y accesos a Ajustes / Ayuda. Reusa los controllers del home para navegar y
// obtener el índice de sesiones recientes del servidor enfocado.
export function LeftSidebar() {
  const home = createHomeController()
  const sessions = createHomeSessionsController(home)
  const openSettings = useSettingsCommand()
  const dialog = useDialog()

  const [collapsed, setCollapsed] = createSignal(readCollapsed())
  const toggle = () => {
    const next = !collapsed()
    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
    } catch {
      /* ignore */
    }
  }

  const openHelp = () => {
    void import("@/components/dialog-help-guide").then((x) => {
      void dialog.show(() => <x.DialogHelpGuide />)
    })
  }

  const groups = sessions.data.groups
  const loading = createMemo(() => sessions.data.loading())

  return (
    <aside
      class="relative flex h-full shrink-0 flex-col border-r border-v2-border-border-muted bg-v2-background-bg-layer-01 transition-[width] duration-200"
      classList={{ "w-[260px]": !collapsed(), "w-[52px]": collapsed() }}
    >
      {/* Header: título + colapsar */}
      <div
        class="flex h-12 shrink-0 items-center gap-1 px-2"
        classList={{ "justify-between": !collapsed(), "justify-center": collapsed() }}
      >
        <Show when={!collapsed()}>
          <span class="pl-1 text-13-medium text-v2-text-text-muted select-none">Chats</span>
        </Show>
        <Tooltip value={collapsed() ? "Expandir" : "Colapsar"} placement="right">
          <IconButtonV2
            variant="ghost"
            size="small"
            icon={<IconV2 name="sidebar-right" size="small" />}
            aria-label={collapsed() ? "Expandir panel" : "Colapsar panel"}
            onClick={toggle}
          />
        </Tooltip>
      </div>

      {/* Nuevo chat */}
      <div class="shrink-0 px-2 pb-2">
        <Show
          when={!collapsed()}
          fallback={
            <div class="flex justify-center">
              <Tooltip value="Nuevo chat" placement="right">
                <IconButtonV2
                  variant="ghost"
                  size="small"
                  icon={<IconV2 name="edit" size="small" />}
                  aria-label="Nuevo chat"
                  disabled={!sessions.session.canCreate()}
                  onClick={() => sessions.session.create()}
                />
              </Tooltip>
            </div>
          }
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-14-medium text-v2-text-text-strong transition-colors hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-40 disabled:pointer-events-none"
            disabled={!sessions.session.canCreate()}
            onClick={() => sessions.session.create()}
          >
            <IconV2 name="edit" size="small" class="text-v2-icon-icon-muted" />
            <span class="min-w-0 flex-1 truncate">Nuevo chat</span>
          </button>
        </Show>
      </div>

      {/* Historial */}
      <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar px-2">
        <Show when={!collapsed()}>
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
              each={groups()}
              fallback={
                <p class="px-2 pt-2 text-13-regular text-v2-text-text-faint select-none">Sin chats todavía</p>
              }
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
        </Show>
      </div>

      {/* Footer: Ajustes / Ayuda */}
      <div
        class="shrink-0 border-t border-v2-border-border-muted p-2"
        classList={{ "flex flex-col gap-0.5": !collapsed(), "flex flex-col items-center gap-1": collapsed() }}
      >
        <Show
          when={!collapsed()}
          fallback={
            <>
              <Tooltip value="Ajustes" placement="right">
                <IconButtonV2
                  variant="ghost"
                  size="small"
                  icon={<IconV2 name="settings-gear" size="small" />}
                  aria-label="Ajustes"
                  onClick={() => openSettings()}
                />
              </Tooltip>
              <Tooltip value="Ayuda" placement="right">
                <IconButtonV2
                  variant="ghost"
                  size="small"
                  icon={<IconV2 name="help" size="small" />}
                  aria-label="Ayuda"
                  onClick={openHelp}
                />
              </Tooltip>
            </>
          }
        >
          <FooterButton icon="settings-gear" label="Ajustes" onClick={() => openSettings()} />
          <FooterButton icon="help" label="Ayuda" onClick={openHelp} />
        </Show>
      </div>
    </aside>
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

function SessionRow(props: {
  record: HomeSessionRecord
  sessions: ReturnType<typeof createHomeSessionsController>
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || "Nuevo chat")
  const active = createMemo(() => props.sessions.tab.isOpen(props.record))
  return (
    <button
      type="button"
      class="flex w-full items-center rounded-md px-2 py-1.5 text-left text-14-regular text-v2-text-text-base transition-colors hover:bg-v2-overlay-simple-overlay-hover"
      classList={{ "bg-v2-overlay-simple-overlay-hover text-v2-text-text-strong": active() }}
      title={title()}
      onClick={() => props.sessions.session.open(props.record.session)}
    >
      <span class="min-w-0 flex-1 truncate">{title()}</span>
    </button>
  )
}
