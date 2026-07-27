import { createSignal, onMount, For, Show } from "solid-js"
import { ZenkaiLogo } from "./zenkai-logo"
import { MatrixRain } from "./matrix-rain"

type QuickAction = {
  label: string
  icon: string
  shortcut?: string
  action: () => void
}

type RecentSession = {
  id: string
  title: string
  timestamp: string
}

type SplashScreenProps = {
  onNewChat?: () => void
  onOpenProject?: () => void
  onSettings?: () => void
  onPlugins?: () => void
  onSessionSelect?: (id: string) => void
  recentSessions?: RecentSession[]
}

const QUICK_ACTIONS: (keyof Pick<SplashScreenProps, "onNewChat" | "onOpenProject" | "onSettings" | "onPlugins">)[] = [
  "onNewChat",
  "onOpenProject",
  "onSettings",
  "onPlugins",
]

const ACTION_META: Record<string, { label: string; icon: string; shortcut?: string }> = {
  onNewChat: {
    label: "Nuevo chat",
    icon: "M12 4.5v15m7.5-7.5h-15",
    shortcut: "Ctrl+N",
  },
  onOpenProject: {
    label: "Abrir proyecto",
    icon: "M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z",
    shortcut: "Ctrl+O",
  },
  onSettings: {
    label: "Configuracion",
    icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7 7 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a7 7 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.212-1.281c-.062-.374-.312-.686-.644-.87a7 7 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7 7 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    shortcut: "Ctrl+,",
  },
  onPlugins: {
    label: "Plugins",
    icon: "M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.4 48.4 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a49 49 0 0 1-.998 5.14 1.5 1.5 0 0 0 1.446 1.88h3.679a2.25 2.25 0 0 0 2.192-1.752l.028-.123a2.25 2.25 0 0 0-.11-1.4 2.251 2.251 0 0 1 1.53-3.093c.487-.13.819-.576.819-1.08v0c0-.088-.007-.175-.02-.26a2.25 2.25 0 0 1 .926-2.153l.1-.073a2.25 2.25 0 0 0 .706-2.867 2.25 2.25 0 0 1 .306-2.502c.388-.45.595-1.027.595-1.625 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959Z",
  },
}

export function SplashScreen(props: SplashScreenProps) {
  const [visible, setVisible] = createSignal(false)

  onMount(() => {
    requestAnimationFrame(() => setVisible(true))
  })

  const actions = () =>
    QUICK_ACTIONS.map((key) => ({
      key,
      ...ACTION_META[key],
      handler: props[key],
    }))

  return (
    <div
      class="flex flex-col items-center justify-center h-full w-full select-none transition-opacity duration-500"
      classList={{ "opacity-0": !visible(), "opacity-100": visible() }}
    >
      <div class="flex flex-col items-center gap-10 max-w-lg w-full px-6">
        <div class="flex flex-col items-center gap-3">
          <ZenkaiLogo size={72} animate />
          <h1 class="zenkai-wordmark text-lg tracking-[0.15em] mt-1">ZENKAI</h1>
          <p class="text-sm text-[var(--v2-text-text-muted,#808080)]">
            AI Coding Assistant
          </p>
          <p class="text-[10px] text-[var(--v2-text-text-muted,#555)] mt-1">
            by Zuno Company - Maycol Velazquez
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2.5 w-full max-w-xs">
          <For each={actions()}>
            {(action) => (
              <button
                type="button"
                onClick={() => action.handler?.()}
                class="group flex flex-col items-center gap-2 px-4 py-3.5 rounded-xl border border-[var(--v2-border-border-base,#222)] bg-[var(--v2-surface-surface-base,#111)] hover:border-[#EC5B2B]/40 hover:bg-[#EC5B2B]/5 transition-all duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="size-5 text-[var(--v2-text-text-muted,#808080)] group-hover:text-[#EC5B2B] transition-colors"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d={action.icon} />
                </svg>
                <span class="text-xs text-[var(--v2-text-text-base,#ccc)] group-hover:text-[var(--v2-text-text-strong,#eee)] transition-colors">
                  {action.label}
                </span>
              </button>
            )}
          </For>
        </div>

        <Show when={props.recentSessions && props.recentSessions.length > 0}>
          <div class="w-full max-w-xs">
            <p class="text-xs text-[var(--v2-text-text-muted,#808080)] mb-2 uppercase tracking-wider">
              Recientes
            </p>
            <div class="flex flex-col gap-0.5">
              <For each={props.recentSessions?.slice(0, 5)}>
                {(session) => (
                  <button
                    type="button"
                    onClick={() => props.onSessionSelect?.(session.id)}
                    class="flex items-center justify-between px-3 py-2 rounded-lg text-left hover:bg-[var(--v2-surface-surface-raised,#1a1a1a)] transition-colors group"
                  >
                    <span class="text-sm text-[var(--v2-text-text-base,#ccc)] truncate mr-3 group-hover:text-[var(--v2-text-text-strong,#eee)]">
                      {session.title}
                    </span>
                    <span class="text-xs text-[var(--v2-text-text-muted,#666)] shrink-0">
                      {session.timestamp}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="flex items-center gap-4 text-[10px] text-[var(--v2-text-text-muted,#555)]">
          <span>
            <kbd class="px-1 py-0.5 rounded border border-[var(--v2-border-border-base,#333)] text-[9px]">Ctrl+N</kbd>{" "}
            nuevo chat
          </span>
          <span>
            <kbd class="px-1 py-0.5 rounded border border-[var(--v2-border-border-base,#333)] text-[9px]">Ctrl+K</kbd>{" "}
            comandos
          </span>
          <span>
            <kbd class="px-1 py-0.5 rounded border border-[var(--v2-border-border-base,#333)] text-[9px]">Ctrl+,</kbd>{" "}
            config
          </span>
        </div>
      </div>

      <div class="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <MatrixRain opacity={0.08} speed={140} />
        <div
          class="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(236,91,43,0.06) 0%, transparent 70%)",
          }}
        />
      </div>
    </div>
  )
}
