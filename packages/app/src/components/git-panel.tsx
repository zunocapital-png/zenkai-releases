import { Component, For, Show, createSignal, createMemo, onCleanup } from "solid-js"
import { ScrollView } from "@opencode-ai/ui/scroll-view"

interface FileEntry {
  file: string
  status: "M" | "A" | "D" | "U" | "?"
  staged: boolean
}

interface Commit {
  hash: string
  message: string
  author: string
  timeAgo: string
}

interface BlameLine {
  hash: string
  author: string
  date: string
  message: string
  startLine: number
  lines: string[]
}

interface GitPanelProps {
  branch?: string
  branches?: string[]
  files?: FileEntry[]
  commits?: Commit[]
  remoteStatus?: { ahead: number; behind: number }
  onSwitchBranch?: (branch: string) => void
  onStage?: (file: string) => void
  onUnstage?: (file: string) => void
  onStageAll?: () => void
  onCommit?: (message: string) => void
  onPush?: () => void
  onPull?: () => void
  onFileClick?: (file: string) => void
  onCommitClick?: (hash: string) => void
}

type PanelTab = "changes" | "history" | "blame"

const STATUS_LABELS: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  U: "Untracked",
  "?": "Untracked",
}

const STATUS_COLORS: Record<string, string> = {
  M: "text-yellow-400",
  A: "text-green-400",
  D: "text-red-400",
  U: "text-v2-text-text-muted",
  "?": "text-v2-text-text-muted",
}

const ActionButton: Component<{
  label: string
  onClick: () => void
  variant?: "primary" | "secondary"
  disabled?: boolean
  class?: string
}> = (props) => (
  <button
    class={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      props.variant === "primary"
        ? "bg-[#EC5B2B] text-white hover:bg-[#d4512a]"
        : "bg-v2-background-bg-deep text-v2-text-text-base hover:bg-v2-background-bg-base border border-v2-border-border-muted"
    } ${props.class ?? ""}`}
    onClick={props.onClick}
    disabled={props.disabled}
  >
    {props.label}
  </button>
)

export const GitPanel: Component<GitPanelProps> = (props) => {
  const [tab, setTab] = createSignal<PanelTab>("changes")
  const [commitMsg, setCommitMsg] = createSignal("")
  const [branchOpen, setBranchOpen] = createSignal(false)

  let dropdownRef: HTMLDivElement | undefined

  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setBranchOpen(false)
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("mousedown", handleClickOutside)
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside))
  }

  const staged = createMemo(() => (props.files ?? []).filter((f) => f.staged))
  const unstaged = createMemo(() => (props.files ?? []).filter((f) => !f.staged && f.status !== "?" && f.status !== "U"))
  const untracked = createMemo(() => (props.files ?? []).filter((f) => f.status === "?" || f.status === "U"))

  const handleCommit = () => {
    const msg = commitMsg().trim()
    if (!msg) return
    props.onCommit?.(msg)
    setCommitMsg("")
  }

  return (
    <div class="flex flex-col h-full bg-v2-background-bg-base border-l border-v2-border-border-muted">
      <div class="flex items-center gap-2 px-3 py-2.5 border-b border-v2-border-border-muted">
        <div class="relative" ref={dropdownRef}>
          <button
            class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] font-[530] text-v2-text-text-base hover:bg-v2-background-bg-deep transition-colors"
            onClick={() => setBranchOpen(!branchOpen())}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="text-[#EC5B2B]">
              <path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM11 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" stroke="currentColor" stroke-width="1.2" />
              <path d="M5 7v2M11 7v2c0 1.1-.9 2-2 2H7" stroke="currentColor" stroke-width="1.2" />
            </svg>
            <span class="truncate max-w-[140px]">{props.branch ?? "main"}</span>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" class="text-v2-text-text-muted">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
          <Show when={branchOpen()}>
            <div class="absolute top-full left-0 mt-1 w-48 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-deep shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
              <For each={props.branches ?? []}>
                {(branch) => (
                  <button
                    class={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-v2-background-bg-base transition-colors ${
                      branch === props.branch ? "text-[#EC5B2B] font-medium" : "text-v2-text-text-base"
                    }`}
                    onClick={() => {
                      props.onSwitchBranch?.(branch)
                      setBranchOpen(false)
                    }}
                  >
                    {branch === props.branch ? `* ${branch}` : branch}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="ml-auto flex items-center gap-1.5">
          <Show when={props.remoteStatus}>
            {(status) => (
              <span class="text-[11px] text-v2-text-text-muted">
                <Show when={status().ahead > 0}>
                  <span class="text-[#EC5B2B]">{status().ahead}↑</span>
                </Show>
                <Show when={status().behind > 0}>
                  <span class="text-blue-400 ml-1">{status().behind}↓</span>
                </Show>
              </span>
            )}
          </Show>
          <ActionButton label="Pull" onClick={() => props.onPull?.()} variant="secondary" />
          <ActionButton label="Push" onClick={() => props.onPush?.()} variant="secondary" />
        </div>
      </div>

      <div class="flex border-b border-v2-border-border-muted">
        {(["changes", "history"] as const).map((t) => (
          <button
            class={`flex-1 px-3 py-2 text-[12px] font-medium transition-colors ${
              tab() === t
                ? "text-[#EC5B2B] border-b-2 border-[#EC5B2B]"
                : "text-v2-text-text-muted hover:text-v2-text-text-base"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "changes" ? "Changes" : "History"}
          </button>
        ))}
      </div>

      <ScrollView class="flex-1 min-h-0">
        <Show when={tab() === "changes"}>
          <div class="flex flex-col">
            <div class="px-3 py-2 border-b border-v2-border-border-muted">
              <textarea
                class="w-full bg-v2-background-bg-deep border border-v2-border-border-muted rounded-md px-2.5 py-2 text-[12px] text-v2-text-text-base placeholder:text-v2-text-text-muted resize-none focus:outline-none focus:border-[#EC5B2B] transition-colors"
                rows={3}
                placeholder="Commit message..."
                value={commitMsg()}
                onInput={(e) => setCommitMsg(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCommit()
                }}
              />
              <div class="flex items-center gap-2 mt-2">
                <ActionButton
                  label="Commit"
                  onClick={handleCommit}
                  variant="primary"
                  disabled={!commitMsg().trim() || staged().length === 0}
                />
                <ActionButton label="Stage All" onClick={() => props.onStageAll?.()} variant="secondary" />
              </div>
            </div>

            <Show when={staged().length > 0}>
              <FileSection
                title="Staged"
                files={staged()}
                actionLabel="Unstage"
                onAction={(f) => props.onUnstage?.(f)}
                onFileClick={props.onFileClick}
              />
            </Show>
            <Show when={unstaged().length > 0}>
              <FileSection
                title="Changes"
                files={unstaged()}
                actionLabel="Stage"
                onAction={(f) => props.onStage?.(f)}
                onFileClick={props.onFileClick}
              />
            </Show>
            <Show when={untracked().length > 0}>
              <FileSection
                title="Untracked"
                files={untracked()}
                actionLabel="Stage"
                onAction={(f) => props.onStage?.(f)}
                onFileClick={props.onFileClick}
              />
            </Show>
            <Show when={(props.files ?? []).length === 0}>
              <div class="px-3 py-8 text-center text-[12px] text-v2-text-text-muted">
                Working tree clean
              </div>
            </Show>
          </div>
        </Show>

        <Show when={tab() === "history"}>
          <div class="flex flex-col">
            <For each={props.commits ?? []} fallback={
              <div class="px-3 py-8 text-center text-[12px] text-v2-text-text-muted">No commits</div>
            }>
              {(commit) => (
                <button
                  class="w-full text-left px-3 py-2.5 border-b border-v2-border-border-muted hover:bg-v2-background-bg-deep transition-colors group"
                  onClick={() => props.onCommitClick?.(commit.hash)}
                >
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="font-mono text-[11px] text-[#EC5B2B] group-hover:underline">
                      {commit.hash.slice(0, 8)}
                    </span>
                    <span class="text-[11px] text-v2-text-text-muted ml-auto shrink-0">{commit.timeAgo}</span>
                  </div>
                  <div class="text-[12px] text-v2-text-text-base truncate">{commit.message}</div>
                  <div class="text-[11px] text-v2-text-text-muted mt-0.5">{commit.author}</div>
                </button>
              )}
            </For>
          </div>
        </Show>
      </ScrollView>
    </div>
  )
}

const FileSection: Component<{
  title: string
  files: FileEntry[]
  actionLabel: string
  onAction: (file: string) => void
  onFileClick?: (file: string) => void
}> = (props) => {
  const [collapsed, setCollapsed] = createSignal(false)

  return (
    <div class="border-b border-v2-border-border-muted">
      <button
        class="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-v2-text-text-muted uppercase tracking-wide hover:bg-v2-background-bg-deep transition-colors"
        onClick={() => setCollapsed(!collapsed())}
      >
        <span
          class="text-[9px] transition-transform"
          style={{ transform: collapsed() ? "rotate(-90deg)" : "rotate(0deg)" }}
        >
          ▼
        </span>
        {props.title}
        <span class="ml-auto text-[11px] font-normal normal-case">{props.files.length}</span>
      </button>
      <Show when={!collapsed()}>
        <For each={props.files}>
          {(entry) => (
            <div class="flex items-center gap-2 px-3 py-1 hover:bg-v2-background-bg-deep transition-colors group">
              <span class={`font-mono text-[11px] font-bold w-4 shrink-0 ${STATUS_COLORS[entry.status] ?? "text-v2-text-text-muted"}`}>
                {entry.status === "?" ? "U" : entry.status}
              </span>
              <button
                class="flex-1 min-w-0 text-left text-[12px] text-v2-text-text-base truncate font-mono hover:text-[#EC5B2B] transition-colors"
                onClick={() => props.onFileClick?.(entry.file)}
                title={`${STATUS_LABELS[entry.status] ?? entry.status}: ${entry.file}`}
              >
                {entry.file}
              </button>
              <button
                class="text-[11px] text-v2-text-text-muted hover:text-[#EC5B2B] opacity-0 group-hover:opacity-100 transition-all shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onAction(entry.file)
                }}
              >
                {props.actionLabel}
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
