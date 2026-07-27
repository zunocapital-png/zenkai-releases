import { Component, createSignal, For, Show } from "solid-js"

interface CharDiff {
  type: "add" | "remove" | "unchanged"
  text: string
}

interface DiffLine {
  type: "add" | "remove" | "context"
  content: string
  oldLineNum?: number
  newLineNum?: number
  charDiffs?: CharDiff[]
}

interface FileDiff {
  filePath: string
  additions: number
  deletions: number
  lines: DiffLine[]
  status: "pending" | "applied" | "rejected"
}

interface DiffPreviewProps {
  diffs: FileDiff[]
  onApply: (filePath: string) => void
  onReject: (filePath: string) => void
  onEdit: (filePath: string) => void
  onApplyAll: () => void
}

function DiffLineView(props: { line: DiffLine }) {
  const bgClass = () => {
    if (props.line.type === "add") return "bg-green-500/10"
    if (props.line.type === "remove") return "bg-red-500/10"
    return ""
  }

  const lineNumClass = () => {
    if (props.line.type === "add") return "text-green-400"
    if (props.line.type === "remove") return "text-red-400"
    return "text-text-dimmed-base"
  }

  const prefix = () => {
    if (props.line.type === "add") return "+"
    if (props.line.type === "remove") return "-"
    return " "
  }

  return (
    <div class={`flex items-start font-mono text-[12px] leading-[20px] ${bgClass()}`}>
      <span class={`w-[40px] shrink-0 text-right pr-2 select-none ${lineNumClass()}`}>
        {props.line.type === "remove" ? props.line.oldLineNum ?? "" : ""}
      </span>
      <span class={`w-[40px] shrink-0 text-right pr-2 select-none ${lineNumClass()}`}>
        {props.line.type === "add" ? props.line.newLineNum ?? "" : props.line.type === "context" ? props.line.newLineNum ?? "" : ""}
      </span>
      <span class={`w-[16px] shrink-0 select-none ${lineNumClass()}`}>{prefix()}</span>
      <span class="flex-1 whitespace-pre-wrap break-all">
        <Show
          when={props.line.charDiffs && props.line.charDiffs.length > 0}
          fallback={<span class="text-text-base">{props.line.content}</span>}
        >
          <For each={props.line.charDiffs}>
            {(chunk) => {
              const chunkClass = () => {
                if (chunk.type === "add") return "bg-green-500/30"
                if (chunk.type === "remove") return "bg-red-500/30"
                return ""
              }
              return <span class={`text-text-base ${chunkClass()}`}>{chunk.text}</span>
            }}
          </For>
        </Show>
      </span>
    </div>
  )
}

function FileDiffHeader(props: {
  filePath: string
  additions: number
  deletions: number
  status: "pending" | "applied" | "rejected"
  expanded: boolean
  onToggle: () => void
  onApply: () => void
  onReject: () => void
  onEdit: () => void
}) {
  const statusBadge = () => {
    if (props.status === "applied")
      return <span class="text-[11px] font-medium text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">Applied</span>
    if (props.status === "rejected")
      return <span class="text-[11px] font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Rejected</span>
    return null
  }

  return (
    <div class="flex items-center justify-between px-3 py-2 bg-surface-raised-base border-b border-border-base">
      <div class="flex items-center gap-2 min-w-0">
        <button
          class="shrink-0 w-5 h-5 flex items-center justify-center text-text-dimmed-base hover:text-text-base transition-colors"
          onClick={props.onToggle}
        >
          <svg
            class={`w-3.5 h-3.5 transition-transform ${props.expanded ? "rotate-90" : ""}`}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <span class="text-[12px] font-[530] text-text-base truncate">{props.filePath}</span>
        <span class="text-[11px] font-medium text-green-400">+{props.additions}</span>
        <span class="text-[11px] font-medium text-red-400">-{props.deletions}</span>
        {statusBadge()}
      </div>
      <Show when={props.status === "pending"}>
        <div class="flex items-center gap-1.5 shrink-0 ml-2">
          <button
            class="text-[11px] font-medium px-2 py-1 rounded text-green-400 hover:bg-green-500/10 transition-colors"
            onClick={props.onApply}
          >
            Apply
          </button>
          <button
            class="text-[11px] font-medium px-2 py-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={props.onReject}
          >
            Reject
          </button>
          <button
            class="text-[11px] font-medium px-2 py-1 rounded text-v2-text-text-muted hover:bg-surface-primary-base transition-colors"
            onClick={props.onEdit}
          >
            Edit
          </button>
        </div>
      </Show>
    </div>
  )
}

function FileDiffCard(props: {
  diff: FileDiff
  onApply: () => void
  onReject: () => void
  onEdit: () => void
}) {
  const [expanded, setExpanded] = createSignal(true)

  return (
    <div class="rounded-lg border border-border-base overflow-hidden">
      <FileDiffHeader
        filePath={props.diff.filePath}
        additions={props.diff.additions}
        deletions={props.diff.deletions}
        status={props.diff.status}
        expanded={expanded()}
        onToggle={() => setExpanded((v) => !v)}
        onApply={props.onApply}
        onReject={props.onReject}
        onEdit={props.onEdit}
      />
      <Show when={expanded()}>
        <div class="overflow-x-auto bg-v2-background-bg-base">
          <For each={props.diff.lines}>
            {(line) => <DiffLineView line={line} />}
          </For>
        </div>
      </Show>
    </div>
  )
}

export const DiffPreview: Component<DiffPreviewProps> = (props) => {
  const pendingCount = () => props.diffs.filter((d) => d.status === "pending").length

  return (
    <div class="flex flex-col gap-3">
      <Show when={pendingCount() > 1}>
        <div class="flex items-center justify-between">
          <span class="text-[13px] font-medium text-text-base">
            {props.diffs.length} file{props.diffs.length !== 1 ? "s" : ""} changed
          </span>
          <button
            class="text-[12px] font-medium px-3 py-1.5 rounded-md bg-[#EC5B2B] text-white hover:bg-[#d44f25] transition-colors"
            onClick={props.onApplyAll}
          >
            Apply All
          </button>
        </div>
      </Show>
      <For each={props.diffs}>
        {(diff) => (
          <FileDiffCard
            diff={diff}
            onApply={() => props.onApply(diff.filePath)}
            onReject={() => props.onReject(diff.filePath)}
            onEdit={() => props.onEdit(diff.filePath)}
          />
        )}
      </For>
    </div>
  )
}
