import { Component, createSignal, createEffect, onCleanup, For, Show } from "solid-js"

type SuggestionType = "typo" | "related" | "action"

interface Suggestion {
  id: string
  type: SuggestionType
  text: string
  action?: () => void
}

interface QuickAction {
  label: string
  icon: string
  action: () => void
}

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { label: "Explain more", icon: "💡", action: () => {} },
  { label: "Show code", icon: "📝", action: () => {} },
  { label: "Run tests", icon: "🧪", action: () => {} },
  { label: "Apply fix", icon: "🔧", action: () => {} },
]

export const AiSuggestions: Component<{
  suggestions?: Suggestion[]
  quickActions?: QuickAction[]
  position?: { x: number; y: number }
  onDismiss?: (id: string) => void
  onDismissAll?: () => void
  autoHideMs?: number
}> = (props) => {
  const [visible, setVisible] = createSignal(true)
  const [dismissed, setDismissed] = createSignal<Set<string>>(new Set())
  let autoHideTimer: ReturnType<typeof setTimeout> | undefined

  const activeSuggestions = () =>
    (props.suggestions ?? []).filter((s) => !dismissed().has(s.id))

  const actions = () => props.quickActions ?? DEFAULT_QUICK_ACTIONS

  const dismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]))
    props.onDismiss?.(id)
  }

  const dismissAll = () => {
    setVisible(false)
    props.onDismissAll?.()
  }

  const resetAutoHide = () => {
    if (autoHideTimer) clearTimeout(autoHideTimer)
    autoHideTimer = setTimeout(() => setVisible(false), props.autoHideMs ?? 10000)
  }

  createEffect(() => {
    if (activeSuggestions().length > 0) {
      setVisible(true)
      resetAutoHide()
    }
  })

  onCleanup(() => {
    if (autoHideTimer) clearTimeout(autoHideTimer)
  })

  const positionStyle = () => {
    if (props.position) {
      return {
        position: "fixed" as const,
        left: `${props.position.x}px`,
        top: `${props.position.y}px`,
      }
    }
    return {
      position: "fixed" as const,
      bottom: "80px",
      right: "24px",
    }
  }

  return (
    <Show when={visible() && activeSuggestions().length > 0}>
      <div
        class="z-40 flex max-w-sm flex-col gap-2"
        style={positionStyle()}
        onMouseEnter={() => {
          if (autoHideTimer) clearTimeout(autoHideTimer)
        }}
        onMouseLeave={resetAutoHide}
      >
        <For each={activeSuggestions()}>
          {(suggestion) => (
            <div
              class="flex items-start gap-2 rounded-xl border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-layer-01)] p-3 shadow-[var(--v2-elevation-floating)] animate-in slide-in-from-right"
            >
              <span class="mt-0.5 text-sm">
                {suggestion.type === "typo" ? "🔤" : suggestion.type === "related" ? "💡" : "⚡"}
              </span>
              <div class="flex flex-1 flex-col gap-1">
                <span class="text-xs font-medium text-[var(--v2-text-text-faint)]">
                  {suggestion.type === "typo" ? "Did you mean...?" : suggestion.type === "related" ? "Try also..." : "Quick action"}
                </span>
                <span class="text-sm text-[var(--v2-text-text-base)]">{suggestion.text}</span>
                <Show when={suggestion.action}>
                  <button
                    class="mt-1 self-start rounded-lg bg-[#EC5B2B]/10 px-2.5 py-1 text-xs font-medium text-[#EC5B2B] transition-colors hover:bg-[#EC5B2B]/20"
                    onClick={suggestion.action}
                  >
                    Apply
                  </button>
                </Show>
              </div>
              <button
                class="shrink-0 rounded p-0.5 text-[var(--v2-icon-icon-muted)] transition-colors hover:text-[var(--v2-icon-icon-base)]"
                onClick={() => dismiss(suggestion.id)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          )}
        </For>

        <Show when={actions().length > 0}>
          <div class="flex flex-wrap gap-1.5 rounded-xl border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-layer-01)] p-2 shadow-[var(--v2-elevation-floating)]">
            <For each={actions()}>
              {(action) => (
                <button
                  class="flex items-center gap-1.5 rounded-lg border border-[var(--v2-border-border-muted)] px-2.5 py-1.5 text-xs text-[var(--v2-text-text-muted)] transition-colors hover:border-[#EC5B2B] hover:text-[#EC5B2B]"
                  onClick={action.action}
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        <button
          class="self-end text-[11px] text-[var(--v2-text-text-faint)] transition-colors hover:text-[var(--v2-text-text-muted)]"
          onClick={dismissAll}
        >
          Dismiss all
        </button>
      </div>
    </Show>
  )
}
