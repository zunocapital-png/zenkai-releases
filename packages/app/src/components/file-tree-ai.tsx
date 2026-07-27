import { Component, createSignal, createMemo, For, Show } from "solid-js"

type FileStatus = "normal" | "new" | "modified" | "error" | "ignored"

interface FileNode {
  name: string
  path: string
  type: "file" | "directory"
  status?: FileStatus
  aiAnnotation?: string
  children?: FileNode[]
}

interface ContextMenuAction {
  label: string
  icon: string
  action: () => void
}

interface FileTreeAiProps {
  root: FileNode[]
  selectedPath?: string
  onSelect?: (path: string) => void
  onExplainFile?: (path: string) => void
  onGenerateTests?: (path: string) => void
  onFindUsages?: (path: string) => void
  onRefactor?: (path: string) => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
}

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  ".ts": { icon: "TS", color: "text-blue-400" },
  ".tsx": { icon: "TX", color: "text-blue-400" },
  ".js": { icon: "JS", color: "text-yellow-400" },
  ".jsx": { icon: "JX", color: "text-yellow-400" },
  ".py": { icon: "PY", color: "text-green-400" },
  ".rs": { icon: "RS", color: "text-[#EC5B2B]" },
  ".go": { icon: "GO", color: "text-cyan-400" },
  ".java": { icon: "JA", color: "text-red-400" },
  ".json": { icon: "{}", color: "text-yellow-300" },
  ".md": { icon: "MD", color: "text-gray-400" },
  ".css": { icon: "CS", color: "text-purple-400" },
  ".html": { icon: "HT", color: "text-[#EC5B2B]" },
  ".yml": { icon: "YM", color: "text-pink-400" },
  ".yaml": { icon: "YM", color: "text-pink-400" },
  ".toml": { icon: "TM", color: "text-gray-400" },
  ".sql": { icon: "SQ", color: "text-blue-300" },
  ".sh": { icon: "SH", color: "text-green-300" },
  ".env": { icon: "EN", color: "text-yellow-500" },
  ".lock": { icon: "LK", color: "text-gray-500" },
}

const STATUS_COLORS: Record<FileStatus, string> = {
  normal: "",
  new: "text-green-400",
  modified: "text-yellow-400",
  error: "text-red-400",
  ignored: "text-gray-500 opacity-50",
}

const STATUS_DOT: Record<FileStatus, string> = {
  normal: "",
  new: "bg-green-400",
  modified: "bg-yellow-400",
  error: "bg-red-400",
  ignored: "",
}

function getFileIcon(name: string): { icon: string; color: string } {
  const ext = name.includes(".") ? "." + name.split(".").pop()! : ""
  return FILE_ICONS[ext] ?? { icon: "F", color: "text-gray-400" }
}

function matchesSearch(node: FileNode, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  if (node.name.toLowerCase().includes(q)) return true
  if (node.children) return node.children.some((c) => matchesSearch(c, q))
  return false
}

function TreeNode(props: {
  node: FileNode
  depth: number
  selectedPath?: string
  searchQuery?: string
  onSelect?: (path: string) => void
  contextActions: (path: string) => ContextMenuAction[]
}) {
  const [expanded, setExpanded] = createSignal(props.depth < 2)
  const [showTooltip, setShowTooltip] = createSignal(false)
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null)

  const isDir = () => props.node.type === "directory"
  const status = () => props.node.status ?? "normal"
  const fileIcon = () => (isDir() ? null : getFileIcon(props.node.name))
  const isSelected = () => props.selectedPath === props.node.path
  const visible = () => matchesSearch(props.node, props.searchQuery ?? "")

  const handleClick = () => {
    if (isDir()) {
      setExpanded(!expanded())
    } else {
      props.onSelect?.(props.node.path)
    }
  }

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })

    const close = () => {
      setContextMenu(null)
      document.removeEventListener("click", close)
    }
    document.addEventListener("click", close)
  }

  return (
    <Show when={visible()}>
      <div>
        <button
          type="button"
          class="group flex w-full items-center gap-1 rounded px-1 py-[3px] text-left transition-colors hover:bg-surface-raised-base/50"
          classList={{
            "bg-[#EC5B2B]/10": isSelected(),
          }}
          style={{ "padding-left": `${props.depth * 14 + 4}px` }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Show when={isDir()}>
            <svg
              class="h-3 w-3 shrink-0 text-text-dimmed-base transition-transform"
              classList={{ "rotate-90": expanded() }}
              viewBox="0 0 12 12"
              fill="currentColor"
            >
              <path d="M4.5 2l4 4-4 4" />
            </svg>
            <svg class="h-3.5 w-3.5 shrink-0 text-[#EC5B2B]" viewBox="0 0 16 16" fill="currentColor">
              <Show
                when={expanded()}
                fallback={
                  <path d="M1.5 3A1.5 1.5 0 013 1.5h3.586a1.5 1.5 0 011.06.44l.915.914A1.5 1.5 0 009.587 3.3H13a1.5 1.5 0 011.5 1.5v8.2a1.5 1.5 0 01-1.5 1.5H3a1.5 1.5 0 01-1.5-1.5V3z" />
                }
              >
                <path d="M.78 6.02A1.5 1.5 0 012.27 4.8H13.5a1.5 1.5 0 011.5 1.5v.22l-1.22 5.5A1.5 1.5 0 0112.3 13.3H3.7a1.5 1.5 0 01-1.48-1.28L.78 6.02z" />
              </Show>
            </svg>
          </Show>

          <Show when={!isDir()}>
            <span class={`shrink-0 font-mono text-[9px] font-bold ${fileIcon()!.color}`}>
              {fileIcon()!.icon}
            </span>
          </Show>

          <span
            class="min-w-0 flex-1 truncate text-[12px]"
            classList={{
              [STATUS_COLORS[status()]]: status() !== "normal",
              "text-text-base": status() === "normal",
              "font-medium": isSelected(),
            }}
          >
            {props.node.name}
          </span>

          <Show when={status() !== "normal" && status() !== "ignored"}>
            <div class={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status()]}`} />
          </Show>

          <Show when={props.node.aiAnnotation}>
            <svg class="h-3 w-3 shrink-0 text-[#EC5B2B] opacity-0 transition-opacity group-hover:opacity-100" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7 5a1 1 0 012 0v3a1 1 0 01-2 0V5zm1 7a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
          </Show>
        </button>

        <Show when={showTooltip() && props.node.aiAnnotation}>
          <div class="ml-6 mr-2 mb-0.5 rounded border border-[#EC5B2B]/20 bg-[#EC5B2B]/5 px-2 py-1" style={{ "margin-left": `${props.depth * 14 + 22}px` }}>
            <span class="text-[10px] text-[#EC5B2B]">{props.node.aiAnnotation}</span>
          </div>
        </Show>

        <Show when={contextMenu()}>
          <div
            class="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border border-border-base bg-surface-primary-base py-1 shadow-lg"
            style={{ left: `${contextMenu()!.x}px`, top: `${contextMenu()!.y}px` }}
          >
            <For each={props.contextActions(props.node.path)}>
              {(action) => (
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-text-base transition-colors hover:bg-[#EC5B2B]/10 hover:text-[#EC5B2B]"
                  onClick={() => {
                    action.action()
                    setContextMenu(null)
                  }}
                >
                  <span class="w-4 text-center text-[12px]">{action.icon}</span>
                  {action.label}
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show when={isDir() && expanded() && props.node.children}>
          <For each={props.node.children}>
            {(child) => (
              <TreeNode
                node={child}
                depth={props.depth + 1}
                selectedPath={props.selectedPath}
                searchQuery={props.searchQuery}
                onSelect={props.onSelect}
                contextActions={props.contextActions}
              />
            )}
          </For>
        </Show>
      </div>
    </Show>
  )
}

export const FileTreeAi: Component<FileTreeAiProps> = (props) => {
  const [localSearch, setLocalSearch] = createSignal(props.searchQuery ?? "")

  const contextActions = (path: string): ContextMenuAction[] => [
    { label: "Explain this file", icon: "💡", action: () => props.onExplainFile?.(path) },
    { label: "Generate tests", icon: "🧪", action: () => props.onGenerateTests?.(path) },
    { label: "Find usages", icon: "🔍", action: () => props.onFindUsages?.(path) },
    { label: "Refactor", icon: "🔧", action: () => props.onRefactor?.(path) },
  ]

  const statusCounts = createMemo(() => {
    let newCount = 0
    let modifiedCount = 0
    let errorCount = 0

    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.status === "new") newCount++
        if (n.status === "modified") modifiedCount++
        if (n.status === "error") errorCount++
        if (n.children) walk(n.children)
      }
    }
    walk(props.root)
    return { new: newCount, modified: modifiedCount, error: errorCount }
  })

  return (
    <div class="flex h-full flex-col overflow-hidden rounded-lg border border-border-base bg-surface-primary-base">
      <div class="flex items-center gap-2 border-b border-border-base px-3 py-1.5">
        <span class="text-[11px] font-bold text-text-base">Files</span>
        <div class="flex-1" />
        <Show when={statusCounts().new > 0}>
          <span class="rounded bg-green-500/10 px-1.5 py-0.5 text-[9px] font-medium text-green-400">
            +{statusCounts().new}
          </span>
        </Show>
        <Show when={statusCounts().modified > 0}>
          <span class="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-medium text-yellow-400">
            ~{statusCounts().modified}
          </span>
        </Show>
        <Show when={statusCounts().error > 0}>
          <span class="rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400">
            !{statusCounts().error}
          </span>
        </Show>
      </div>

      <div class="px-2 py-1.5">
        <input
          type="text"
          placeholder="Filter files..."
          value={localSearch()}
          onInput={(e) => {
            setLocalSearch(e.currentTarget.value)
            props.onSearchChange?.(e.currentTarget.value)
          }}
          class="w-full rounded border border-border-base bg-transparent px-2 py-1 text-[11px] text-text-base placeholder:text-text-dimmed-base focus:border-[#EC5B2B] focus:outline-none"
        />
      </div>

      <div class="flex-1 overflow-y-auto px-1 pb-2">
        <For each={props.root}>
          {(node) => (
            <TreeNode
              node={node}
              depth={0}
              selectedPath={props.selectedPath}
              searchQuery={localSearch()}
              onSelect={props.onSelect}
              contextActions={contextActions}
            />
          )}
        </For>

        <Show when={props.root.length === 0}>
          <div class="py-6 text-center text-[11px] text-text-dimmed-base">
            No files
          </div>
        </Show>
      </div>
    </div>
  )
}
