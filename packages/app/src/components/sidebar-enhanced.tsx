import { Component, createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js"

type SidebarTab = "chat" | "files" | "git" | "plugins" | "settings"

interface ChatSession {
  id: string
  title: string
  timestamp: number
  pinned?: boolean
  tags?: { label: string; color: string }[]
}

interface FileNode {
  name: string
  path: string
  type: "file" | "directory"
  children?: FileNode[]
  status?: "modified" | "error" | "new" | "deleted"
}

interface SidebarSection {
  label: string
  collapsed: boolean
  items: ChatSession[]
}

const TAB_ICONS: Record<SidebarTab, string> = {
  chat: "💬",
  files: "📁",
  git: "🔀",
  plugins: "🧩",
  settings: "⚙️",
}

const STATUS_COLORS: Record<string, string> = {
  modified: "#f59e0b",
  error: "#ef4444",
  new: "#22c55e",
  deleted: "#6b7280",
}

const groupSessionsByDate = (sessions: ChatSession[]): SidebarSection[] => {
  const now = Date.now()
  const day = 86400000
  const today: ChatSession[] = []
  const yesterday: ChatSession[] = []
  const thisWeek: ChatSession[] = []
  const older: ChatSession[] = []

  for (const s of sessions) {
    const diff = now - s.timestamp
    if (diff < day) today.push(s)
    else if (diff < day * 2) yesterday.push(s)
    else if (diff < day * 7) thisWeek.push(s)
    else older.push(s)
  }

  const sections: SidebarSection[] = []
  if (today.length) sections.push({ label: "Today", collapsed: false, items: today })
  if (yesterday.length) sections.push({ label: "Yesterday", collapsed: false, items: yesterday })
  if (thisWeek.length) sections.push({ label: "This Week", collapsed: false, items: thisWeek })
  if (older.length) sections.push({ label: "Older", collapsed: true, items: older })
  return sections
}

const FileTreeNode: Component<{ node: FileNode; depth: number }> = (props) => {
  const [expanded, setExpanded] = createSignal(props.depth < 2)

  return (
    <div>
      <button
        class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]"
        style={{ "padding-left": `${props.depth * 16 + 8}px` }}
        onClick={() => props.node.type === "directory" && setExpanded((v) => !v)}
      >
        <Show when={props.node.type === "directory"}>
          <svg
            class="shrink-0 text-[var(--v2-icon-icon-muted)] transition-transform"
            classList={{ "rotate-90": expanded() }}
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </Show>
        <Show when={props.node.type === "file"}>
          <span class="w-3" />
        </Show>
        <span class="text-xs">
          {props.node.type === "directory" ? "📁" : "📄"}
        </span>
        <span class="flex-1 truncate text-[var(--v2-text-text-base)]">{props.node.name}</span>
        <Show when={props.node.status}>
          <div class="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[props.node.status!] }} />
        </Show>
      </button>
      <Show when={props.node.type === "directory" && expanded() && props.node.children}>
        <For each={props.node.children}>
          {(child) => <FileTreeNode node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </div>
  )
}

export const SidebarEnhanced: Component<{
  sessions?: ChatSession[]
  files?: FileNode[]
  onNewChat?: () => void
  onSelectSession?: (id: string) => void
  onOpenSettings?: () => void
  onSearch?: () => void
  initialWidth?: number
}> = (props) => {
  const [activeTab, setActiveTab] = createSignal<SidebarTab>("chat")
  const [width, setWidth] = createSignal(props.initialWidth ?? 280)
  const [isResizing, setIsResizing] = createSignal(false)
  const [collapsedSections, setCollapsedSections] = createSignal<Set<string>>(new Set())

  const pinnedSessions = createMemo(() => (props.sessions ?? []).filter((s) => s.pinned))
  const unpinnedSessions = createMemo(() => (props.sessions ?? []).filter((s) => !s.pinned))
  const dateGroups = createMemo(() => groupSessionsByDate(unpinnedSessions()))

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const handleMouseDown = () => {
    setIsResizing(true)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing()) return
    const newWidth = Math.min(Math.max(200, e.clientX), 500)
    setWidth(newWidth)
  }

  const handleMouseUp = () => {
    setIsResizing(false)
  }

  onMount(() => {
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  })

  onCleanup(() => {
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
  })

  return (
    <div
      class="relative flex h-full flex-col border-r border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-deep)]"
      style={{ width: `${width()}px` }}
    >
      <div class="flex border-b border-[var(--v2-border-border-muted)]">
        <For each={(["chat", "files", "git", "plugins", "settings"] as SidebarTab[])}>
          {(tab) => (
            <button
              class="flex-1 py-2.5 text-center text-sm transition-colors"
              classList={{
                "text-[#EC5B2B] border-b-2 border-[#EC5B2B]": activeTab() === tab,
                "text-[var(--v2-text-text-muted)] hover:text-[var(--v2-text-text-base)]": activeTab() !== tab,
              }}
              onClick={() => setActiveTab(tab)}
              title={tab.charAt(0).toUpperCase() + tab.slice(1)}
            >
              {TAB_ICONS[tab]}
            </button>
          )}
        </For>
      </div>

      <div class="flex-1 overflow-y-auto">
        <Show when={activeTab() === "chat"}>
          <div class="flex flex-col gap-1 p-2">
            <Show when={pinnedSessions().length > 0}>
              <div class="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)]">
                Pinned
              </div>
              <For each={pinnedSessions()}>
                {(session) => (
                  <button
                    class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]"
                    onClick={() => props.onSelectSession?.(session.id)}
                  >
                    <span class="text-xs text-[var(--v2-text-text-faint)]">📌</span>
                    <span class="flex-1 truncate text-[var(--v2-text-text-base)]">{session.title}</span>
                    <Show when={session.tags}>
                      <div class="flex gap-1">
                        <For each={session.tags}>
                          {(tag) => (
                            <div class="h-2 w-2 rounded-full" style={{ background: tag.color }} title={tag.label} />
                          )}
                        </For>
                      </div>
                    </Show>
                  </button>
                )}
              </For>
              <div class="mx-2 my-1 border-b border-[var(--v2-border-border-muted)]" />
            </Show>

            <For each={dateGroups()}>
              {(section) => (
                <div>
                  <button
                    class="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)] hover:text-[var(--v2-text-text-muted)]"
                    onClick={() => toggleSection(section.label)}
                  >
                    <svg
                      class="shrink-0 transition-transform"
                      classList={{ "rotate-90": !collapsedSections().has(section.label) }}
                      width="10" height="10" viewBox="0 0 12 12" fill="none"
                    >
                      <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    {section.label}
                  </button>
                  <Show when={!collapsedSections().has(section.label)}>
                    <For each={section.items}>
                      {(session) => (
                        <button
                          class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]"
                          onClick={() => props.onSelectSession?.(session.id)}
                        >
                          <span class="flex-1 truncate text-[var(--v2-text-text-base)]">{session.title}</span>
                          <Show when={session.tags}>
                            <div class="flex gap-1">
                              <For each={session.tags}>
                                {(tag) => (
                                  <div class="h-2 w-2 rounded-full" style={{ background: tag.color }} title={tag.label} />
                                )}
                              </For>
                            </div>
                          </Show>
                        </button>
                      )}
                    </For>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={activeTab() === "files"}>
          <div class="p-1">
            <For each={props.files ?? []}>
              {(node) => <FileTreeNode node={node} depth={0} />}
            </For>
            <Show when={!props.files?.length}>
              <div class="py-8 text-center text-sm text-[var(--v2-text-text-muted)]">
                No files loaded
              </div>
            </Show>
          </div>
        </Show>

        <Show when={activeTab() === "git"}>
          <div class="flex flex-col items-center gap-2 p-4 text-sm text-[var(--v2-text-text-muted)]">
            <span class="text-2xl">🔀</span>
            <span>Git integration</span>
            <span class="text-xs text-[var(--v2-text-text-faint)]">Ctrl+Shift+G to open panel</span>
          </div>
        </Show>

        <Show when={activeTab() === "plugins"}>
          <div class="flex flex-col items-center gap-2 p-4 text-sm text-[var(--v2-text-text-muted)]">
            <span class="text-2xl">🧩</span>
            <span>Plugin Manager</span>
            <span class="text-xs text-[var(--v2-text-text-faint)]">Ctrl+Shift+P to manage</span>
          </div>
        </Show>

        <Show when={activeTab() === "settings"}>
          <div class="flex flex-col items-center gap-2 p-4 text-sm text-[var(--v2-text-text-muted)]">
            <span class="text-2xl">⚙️</span>
            <span>Settings</span>
            <span class="text-xs text-[var(--v2-text-text-faint)]">Ctrl+, to open</span>
          </div>
        </Show>
      </div>

      <div class="flex items-center justify-between border-t border-[var(--v2-border-border-muted)] px-2 py-2">
        <button
          class="rounded-lg p-2 text-[var(--v2-icon-icon-muted)] transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)] hover:text-[#EC5B2B]"
          onClick={props.onNewChat}
          title="New Chat"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="rounded-lg p-2 text-[var(--v2-icon-icon-muted)] transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)] hover:text-[#EC5B2B]"
          onClick={props.onSearch}
          title="Search"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M11.5 11.5L14 14M8.5 3C10.433 3 12 4.567 12 6.5S10.433 10 8.5 10 5 8.433 5 6.5 6.567 3 8.5 3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="rounded-lg p-2 text-[var(--v2-icon-icon-muted)] transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)] hover:text-[#EC5B2B]"
          onClick={props.onOpenSettings}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.5" />
            <path d="M13.5 8c0-.4-.2-.7-.4-1l.9-1.4-.7-1.3H11.7l-.7-.7V2.3L9.7 1.6 8.3 2.5c-.3-.2-.6-.4-1-.4L7 .5H5.7l-.4 1.6c-.4 0-.7.2-1 .4L2.9 1.6l-1.3.7.4 1.6-.4.7H.3l-.3 1.3 1.4.9c-.2.3-.4.6-.4 1l-1.6.4.3 1.3 1.6.4c0 .4.2.7.4 1l-.9 1.4.7 1.3h1.6l.7.7v1.3l1.3.7 1.4-.9c.3.2.6.4 1 .4l.4 1.6H9l.4-1.6c.4 0 .7-.2 1-.4l1.4.9 1.3-.7-.4-1.6.4-.7h1.3l.3-1.3-1.4-.9c.2-.3.4-.6.4-1z" stroke="currentColor" stroke-width="0" fill="none" />
          </svg>
        </button>
      </div>

      <div
        class="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-[#EC5B2B]/30"
        classList={{ "bg-[#EC5B2B]/50": isResizing() }}
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
