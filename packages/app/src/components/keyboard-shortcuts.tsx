import { Component, createSignal, createMemo, For, Show } from "solid-js"

type ShortcutCategory = "general" | "editor" | "navigation" | "git" | "ai" | "plugins"

interface Shortcut {
  id: string
  label: string
  keys: string
  category: ShortcutCategory
}

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: "General",
  editor: "Editor",
  navigation: "Navigation",
  git: "Git",
  ai: "AI",
  plugins: "Plugins",
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: "command-palette", label: "Command Palette", keys: "Ctrl+K", category: "general" },
  { id: "new-chat", label: "New Chat", keys: "Ctrl+N", category: "general" },
  { id: "settings", label: "Open Settings", keys: "Ctrl+,", category: "general" },
  { id: "close-tab", label: "Close Tab", keys: "Ctrl+W", category: "general" },
  { id: "toggle-sidebar", label: "Toggle Sidebar", keys: "Ctrl+B", category: "general" },
  { id: "search", label: "Search", keys: "Ctrl+F", category: "general" },
  { id: "copy", label: "Copy", keys: "Ctrl+C", category: "editor" },
  { id: "paste", label: "Paste", keys: "Ctrl+V", category: "editor" },
  { id: "cut", label: "Cut", keys: "Ctrl+X", category: "editor" },
  { id: "undo", label: "Undo", keys: "Ctrl+Z", category: "editor" },
  { id: "redo", label: "Redo", keys: "Ctrl+Shift+Z", category: "editor" },
  { id: "select-all", label: "Select All", keys: "Ctrl+A", category: "editor" },
  { id: "next-session", label: "Next Session", keys: "Ctrl+Tab", category: "navigation" },
  { id: "prev-session", label: "Previous Session", keys: "Ctrl+Shift+Tab", category: "navigation" },
  { id: "go-home", label: "Go Home", keys: "Ctrl+H", category: "navigation" },
  { id: "focus-input", label: "Focus Input", keys: "Ctrl+L", category: "navigation" },
  { id: "git-panel", label: "Git Panel", keys: "Ctrl+Shift+G", category: "git" },
  { id: "git-commit", label: "Git Commit", keys: "Ctrl+Shift+C", category: "git" },
  { id: "git-push", label: "Git Push", keys: "Ctrl+Shift+U", category: "git" },
  { id: "debug-panel", label: "Debug Panel", keys: "Ctrl+Shift+D", category: "ai" },
  { id: "send-message", label: "Send Message", keys: "Enter", category: "ai" },
  { id: "stop-generation", label: "Stop Generation", keys: "Escape", category: "ai" },
  { id: "regenerate", label: "Regenerate Response", keys: "Ctrl+Shift+R", category: "ai" },
  { id: "plugins-manager", label: "Plugins Manager", keys: "Ctrl+Shift+P", category: "plugins" },
  { id: "perf-monitor", label: "Performance Monitor", keys: "Ctrl+Shift+M", category: "plugins" },
]

const formatKeyEvent = (e: KeyboardEvent): string => {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl")
  if (e.shiftKey) parts.push("Shift")
  if (e.altKey) parts.push("Alt")
  const key = e.key
  if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key)
  }
  return parts.join("+")
}

export const KeyboardShortcuts: Component<{
  shortcuts?: Shortcut[]
  onUpdate?: (shortcuts: Shortcut[]) => void
}> = (props) => {
  const [shortcuts, setShortcuts] = createSignal<Shortcut[]>(props.shortcuts ?? [...DEFAULT_SHORTCUTS])
  const [filter, setFilter] = createSignal("")
  const [selectedCategory, setSelectedCategory] = createSignal<ShortcutCategory | "all">("all")
  const [rebindingId, setRebindingId] = createSignal<string | null>(null)
  const [conflict, setConflict] = createSignal<{ id: string; existingLabel: string } | null>(null)

  const categories: (ShortcutCategory | "all")[] = ["all", "general", "editor", "navigation", "git", "ai", "plugins"]

  const filtered = createMemo(() => {
    let items = shortcuts()
    if (selectedCategory() !== "all") {
      items = items.filter((s) => s.category === selectedCategory())
    }
    const q = filter().toLowerCase().trim()
    if (q) {
      items = items.filter((s) => s.label.toLowerCase().includes(q) || s.keys.toLowerCase().includes(q))
    }
    return items
  })

  const grouped = createMemo(() => {
    const groups = new Map<ShortcutCategory, Shortcut[]>()
    for (const s of filtered()) {
      const list = groups.get(s.category) ?? []
      list.push(s)
      groups.set(s.category, list)
    }
    return groups
  })

  const startRebind = (id: string) => {
    setRebindingId(id)
    setConflict(null)
  }

  const handleRebindKey = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return

    const newKeys = formatKeyEvent(e)
    const currentId = rebindingId()
    if (!currentId) return

    const existing = shortcuts().find((s) => s.keys === newKeys && s.id !== currentId)
    if (existing) {
      setConflict({ id: existing.id, existingLabel: existing.label })
      return
    }

    setShortcuts((prev) => prev.map((s) => (s.id === currentId ? { ...s, keys: newKeys } : s)))
    setRebindingId(null)
    setConflict(null)
    props.onUpdate?.(shortcuts())
  }

  const resetToDefaults = () => {
    setShortcuts([...DEFAULT_SHORTCUTS])
    props.onUpdate?.(DEFAULT_SHORTCUTS)
  }

  return (
    <div class="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold text-[var(--v2-text-text-base)]">Keyboard Shortcuts</div>
        <button
          onClick={resetToDefaults}
          class="rounded-lg border border-[var(--v2-border-border-muted)] px-3 py-1.5 text-sm text-[var(--v2-text-text-muted)] transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]"
        >
          Reset to Defaults
        </button>
      </div>

      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--v2-icon-icon-muted)]" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M11.5 11.5L14 14M8.5 3C10.433 3 12 4.567 12 6.5S10.433 10 8.5 10 5 8.433 5 6.5 6.567 3 8.5 3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Filter shortcuts..."
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            class="w-full rounded-lg border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-base)] py-2 pl-9 pr-3 text-sm text-[var(--v2-text-text-base)] placeholder:text-[var(--v2-text-text-faint)] outline-none"
          />
        </div>
      </div>

      <div class="flex gap-1 overflow-x-auto">
        <For each={categories}>
          {(cat) => (
            <button
              class="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              classList={{
                "bg-[#EC5B2B] text-white": selectedCategory() === cat,
                "text-[var(--v2-text-text-muted)] hover:bg-[var(--v2-overlay-simple-overlay-hover)]": selectedCategory() !== cat,
              }}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
            </button>
          )}
        </For>
      </div>

      <Show when={conflict()}>
        {(c) => (
          <div class="flex items-center gap-2 rounded-lg border border-[var(--v2-state-border-warning)] bg-[var(--v2-state-bg-warning)] px-3 py-2 text-sm text-[var(--v2-state-fg-warning)]">
            <span>Conflict: this shortcut is already used by "{c().existingLabel}"</span>
            <button onClick={() => setConflict(null)} class="ml-auto text-xs underline">Dismiss</button>
          </div>
        )}
      </Show>

      <div class="flex flex-col gap-1">
        <For each={Array.from(grouped().entries())}>
          {([category, items]) => (
            <>
              <div class="mt-2 px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)]">
                {CATEGORY_LABELS[category]}
              </div>
              <For each={items}>
                {(shortcut) => (
                  <div
                    class="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]"
                    classList={{ "bg-[var(--v2-overlay-simple-overlay-hover)]": rebindingId() === shortcut.id }}
                  >
                    <span class="text-sm text-[var(--v2-text-text-base)]">{shortcut.label}</span>
                    <button
                      class="min-w-[120px] rounded-lg border px-3 py-1 text-center text-sm transition-colors"
                      classList={{
                        "border-[#EC5B2B] bg-[#EC5B2B]/10 text-[#EC5B2B] animate-pulse": rebindingId() === shortcut.id,
                        "border-[var(--v2-border-border-muted)] text-[var(--v2-text-text-muted)] hover:border-[var(--v2-border-border-strong)]": rebindingId() !== shortcut.id,
                      }}
                      onClick={() => startRebind(shortcut.id)}
                      onKeyDown={(e) => {
                        if (rebindingId() === shortcut.id) handleRebindKey(e)
                      }}
                    >
                      {rebindingId() === shortcut.id ? "Press keys..." : shortcut.keys}
                    </button>
                  </div>
                )}
              </For>
            </>
          )}
        </For>
      </div>

      <Show when={filtered().length === 0}>
        <div class="py-8 text-center text-sm text-[var(--v2-text-text-muted)]">
          No shortcuts match your filter
        </div>
      </Show>
    </div>
  )
}
