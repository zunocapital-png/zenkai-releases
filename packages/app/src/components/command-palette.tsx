import { Component, createSignal, createEffect, createMemo, onMount, onCleanup, Show, For } from "solid-js"
import { Dialog as Kobalte } from "@kobalte/core/dialog"
import fuzzysort from "fuzzysort"

type CategoryType = "files" | "commands" | "sessions" | "agents" | "settings" | "plugins"

interface PaletteItem {
  id: string
  label: string
  category: CategoryType
  icon: string
  description?: string
  shortcut?: string
  action?: () => void
}

const CATEGORY_ICONS: Record<CategoryType, string> = {
  files: "📄",
  commands: "⚡",
  sessions: "💬",
  agents: "🤖",
  settings: "⚙️",
  plugins: "🧩",
}

const CATEGORY_LABELS: Record<CategoryType, string> = {
  files: "Files",
  commands: "Commands",
  sessions: "Sessions",
  agents: "Agents",
  settings: "Settings",
  plugins: "Plugins",
}

const DEFAULT_ITEMS: PaletteItem[] = [
  { id: "cmd-new-chat", label: "New Chat", category: "commands", icon: "⚡", shortcut: "Ctrl+N" },
  { id: "cmd-open-settings", label: "Open Settings", category: "commands", icon: "⚡", shortcut: "Ctrl+," },
  { id: "cmd-toggle-sidebar", label: "Toggle Sidebar", category: "commands", icon: "⚡", shortcut: "Ctrl+B" },
  { id: "cmd-git-panel", label: "Git Panel", category: "commands", icon: "⚡", shortcut: "Ctrl+Shift+G" },
  { id: "cmd-debug", label: "Debug Panel", category: "commands", icon: "⚡", shortcut: "Ctrl+Shift+D" },
  { id: "cmd-plugins", label: "Plugins Manager", category: "commands", icon: "⚡", shortcut: "Ctrl+Shift+P" },
  { id: "cmd-performance", label: "Performance Monitor", category: "commands", icon: "⚡", shortcut: "Ctrl+Shift+M" },
  { id: "cmd-theme", label: "Theme Editor", category: "commands", icon: "⚡" },
  { id: "cmd-shortcuts", label: "Keyboard Shortcuts", category: "commands", icon: "⚡" },
  { id: "agent-default", label: "Default Agent", category: "agents", icon: "🤖" },
  { id: "agent-code-review", label: "Code Review Agent", category: "agents", icon: "🤖" },
  { id: "agent-debug", label: "Debug Agent", category: "agents", icon: "🤖" },
  { id: "settings-general", label: "General Settings", category: "settings", icon: "⚙️" },
  { id: "settings-providers", label: "Provider Settings", category: "settings", icon: "⚙️" },
  { id: "settings-models", label: "Model Settings", category: "settings", icon: "⚙️" },
  { id: "settings-keybinds", label: "Keybind Settings", category: "settings", icon: "⚙️" },
]

export const CommandPalette: Component<{
  items?: PaletteItem[]
  recentItems?: PaletteItem[]
  onSelect?: (item: PaletteItem) => void
}> = (props) => {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  let inputRef: HTMLInputElement | undefined

  const allItems = createMemo(() => [...DEFAULT_ITEMS, ...(props.items ?? [])])

  const recentItems = createMemo(() => props.recentItems ?? allItems().slice(0, 3))

  const filteredItems = createMemo(() => {
    const q = query().trim()
    if (!q) {
      const categories: CategoryType[] = ["files", "commands", "sessions", "agents", "settings", "plugins"]
      return categories.flatMap((cat) => allItems().filter((item) => item.category === cat))
    }
    const results = fuzzysort.go(q, allItems(), { keys: ["label", "description"], limit: 20 })
    return results.map((r) => r.obj)
  })

  const groupedItems = createMemo(() => {
    const groups = new Map<CategoryType, PaletteItem[]>()
    for (const item of filteredItems()) {
      const list = groups.get(item.category) ?? []
      list.push(item)
      groups.set(item.category, list)
    }
    return groups
  })

  const flatList = createMemo(() => filteredItems())

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      setOpen((prev) => !prev)
    }
  }

  const handleListKeyDown = (e: KeyboardEvent) => {
    const items = flatList()
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % items.length)
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
        break
      case "Enter":
        e.preventDefault()
        if (items[selectedIndex()]) {
          selectItem(items[selectedIndex()])
        }
        break
      case "Escape":
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  const selectItem = (item: PaletteItem) => {
    item.action?.()
    props.onSelect?.(item)
    setOpen(false)
    setQuery("")
    setSelectedIndex(0)
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown)
  })

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown)
  })

  createEffect(() => {
    if (open()) {
      setTimeout(() => inputRef?.focus(), 50)
      setSelectedIndex(0)
    }
  })

  createEffect(() => {
    query()
    setSelectedIndex(0)
  })

  return (
    <Kobalte.Root open={open()} onOpenChange={setOpen}>
      <Kobalte.Portal>
        <Kobalte.Overlay class="fixed inset-0 z-50 bg-[var(--v2-overlay-simple-overlay-scrim)]" />
        <Kobalte.Content
          class="fixed left-1/2 top-[15%] z-50 w-[560px] max-w-[90vw] -translate-x-1/2 rounded-xl border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-layer-01)] shadow-[var(--v2-elevation-overlay)]"
          onKeyDown={handleListKeyDown}
        >
          <div class="flex items-center gap-2 border-b border-[var(--v2-border-border-muted)] px-4 py-3">
            <span class="text-[var(--v2-icon-icon-muted)]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 11.5L14 14M8.5 3C10.433 3 12 4.567 12 6.5S10.433 10 8.5 10 5 8.433 5 6.5 6.567 3 8.5 3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search commands, files, sessions..."
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              class="flex-1 bg-transparent text-sm text-[var(--v2-text-text-base)] placeholder:text-[var(--v2-text-text-faint)] outline-none"
            />
            <kbd class="rounded border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--v2-text-text-muted)]">
              ESC
            </kbd>
          </div>
          <div class="max-h-[400px] overflow-y-auto p-1">
            <Show when={!query() && recentItems().length > 0}>
              <div class="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)]">
                Recent
              </div>
              <For each={recentItems()}>
                {(item) => {
                  const idx = () => flatList().indexOf(item)
                  return (
                    <button
                      class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                      classList={{
                        "bg-[var(--v2-overlay-simple-overlay-hover)]": idx() === selectedIndex(),
                        "hover:bg-[var(--v2-overlay-simple-overlay-hover)]": idx() !== selectedIndex(),
                      }}
                      onClick={() => selectItem(item)}
                      onMouseEnter={() => setSelectedIndex(idx())}
                    >
                      <span class="text-base">{CATEGORY_ICONS[item.category]}</span>
                      <span class="flex-1 text-[var(--v2-text-text-base)]">{item.label}</span>
                      <Show when={item.shortcut}>
                        <kbd class="rounded border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--v2-text-text-muted)]">
                          {item.shortcut}
                        </kbd>
                      </Show>
                    </button>
                  )
                }}
              </For>
              <div class="mx-3 my-1 border-b border-[var(--v2-border-border-muted)]" />
            </Show>
            <For each={Array.from(groupedItems().entries())}>
              {([category, items]) => (
                <>
                  <div class="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)]">
                    {CATEGORY_LABELS[category]}
                  </div>
                  <For each={items}>
                    {(item) => {
                      const idx = () => flatList().indexOf(item)
                      return (
                        <button
                          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                          classList={{
                            "bg-[var(--v2-overlay-simple-overlay-hover)]": idx() === selectedIndex(),
                            "hover:bg-[var(--v2-overlay-simple-overlay-hover)]": idx() !== selectedIndex(),
                          }}
                          onClick={() => selectItem(item)}
                          onMouseEnter={() => setSelectedIndex(idx())}
                        >
                          <span class="text-base">{CATEGORY_ICONS[item.category]}</span>
                          <div class="flex flex-1 flex-col">
                            <span class="text-[var(--v2-text-text-base)]">{item.label}</span>
                            <Show when={item.description}>
                              <span class="text-xs text-[var(--v2-text-text-muted)]">{item.description}</span>
                            </Show>
                          </div>
                          <Show when={item.shortcut}>
                            <kbd class="rounded border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--v2-text-text-muted)]">
                              {item.shortcut}
                            </kbd>
                          </Show>
                        </button>
                      )
                    }}
                  </For>
                </>
              )}
            </For>
            <Show when={filteredItems().length === 0}>
              <div class="px-3 py-8 text-center text-sm text-[var(--v2-text-text-muted)]">
                No results found
              </div>
            </Show>
          </div>
          <div class="flex items-center gap-4 border-t border-[var(--v2-border-border-muted)] px-4 py-2 text-[11px] text-[var(--v2-text-text-faint)]">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte.Root>
  )
}
