import { Component, For, Show, createSignal, createMemo } from "solid-js"

interface DiffHunk {
  oldStart: number
  newStart: number
  lines: string[]
}

interface DiffFile {
  file: string
  hunks: DiffHunk[]
}

interface GitDiffViewerProps {
  diffs: DiffFile[]
}

type ViewMode = "unified" | "split"

interface ParsedLine {
  type: "add" | "del" | "ctx" | "header"
  content: string
  oldNum: number | null
  newNum: number | null
}

function parseHunkLines(hunk: DiffHunk): ParsedLine[] {
  const result: ParsedLine[] = []
  let oldLine = hunk.oldStart
  let newLine = hunk.newStart
  for (const raw of hunk.lines) {
    if (raw.startsWith("@@")) {
      result.push({ type: "header", content: raw, oldNum: null, newNum: null })
      continue
    }
    if (raw.startsWith("+")) {
      result.push({ type: "add", content: raw.slice(1), oldNum: null, newNum: newLine })
      newLine++
    } else if (raw.startsWith("-")) {
      result.push({ type: "del", content: raw.slice(1), oldNum: oldLine, newNum: null })
      oldLine++
    } else {
      const line = raw.startsWith(" ") ? raw.slice(1) : raw
      result.push({ type: "ctx", content: line, oldNum: oldLine, newNum: newLine })
      oldLine++
      newLine++
    }
  }
  return result
}

interface SplitRow {
  left: ParsedLine | null
  right: ParsedLine | null
}

function buildSplitRows(parsed: ParsedLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  while (i < parsed.length) {
    const line = parsed[i]!
    if (line.type === "header") {
      rows.push({ left: line, right: line })
      i++
      continue
    }
    if (line.type === "ctx") {
      rows.push({ left: line, right: line })
      i++
      continue
    }
    if (line.type === "del") {
      const dels: ParsedLine[] = []
      while (i < parsed.length && parsed[i]!.type === "del") {
        dels.push(parsed[i]!)
        i++
      }
      const adds: ParsedLine[] = []
      while (i < parsed.length && parsed[i]!.type === "add") {
        adds.push(parsed[i]!)
        i++
      }
      const max = Math.max(dels.length, adds.length)
      for (let j = 0; j < max; j++) {
        rows.push({ left: dels[j] ?? null, right: adds[j] ?? null })
      }
      continue
    }
    if (line.type === "add") {
      rows.push({ left: null, right: line })
      i++
      continue
    }
    i++
  }
  return rows
}

function fileStats(hunks: DiffHunk[]): { adds: number; dels: number } {
  let adds = 0
  let dels = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) adds++
      else if (line.startsWith("-") && !line.startsWith("---")) dels++
    }
  }
  return { adds, dels }
}

const LineNum: Component<{ num: number | null }> = (props) => (
  <span class="inline-block w-10 text-right pr-2 select-none text-v2-text-text-muted text-[11px] font-mono opacity-50 shrink-0">
    {props.num ?? ""}
  </span>
)

const UnifiedView: Component<{ hunks: DiffHunk[] }> = (props) => {
  const parsed = createMemo(() => props.hunks.flatMap(parseHunkLines))

  return (
    <div class="font-mono text-[12px] leading-5">
      <For each={parsed()}>
        {(line) => (
          <div
            class={
              line.type === "add"
                ? "bg-green-500/10 text-green-400"
                : line.type === "del"
                  ? "bg-red-500/10 text-red-400"
                  : line.type === "header"
                    ? "bg-v2-background-bg-deep text-v2-text-text-muted text-[11px] py-0.5"
                    : "text-v2-text-text-base"
            }
          >
            <div class="flex">
              <LineNum num={line.oldNum} />
              <LineNum num={line.newNum} />
              <span class="w-4 shrink-0 text-center select-none opacity-60">
                {line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "header" ? "" : " "}
              </span>
              <span class="flex-1 min-w-0 whitespace-pre overflow-x-auto">{line.content}</span>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

const SplitView: Component<{ hunks: DiffHunk[] }> = (props) => {
  const rows = createMemo(() => {
    const parsed = props.hunks.flatMap(parseHunkLines)
    return buildSplitRows(parsed)
  })

  const renderSide = (line: ParsedLine | null, side: "left" | "right") => {
    if (!line) {
      return <div class="flex-1 min-w-0 bg-v2-background-bg-deep" />
    }
    const bg =
      line.type === "header"
        ? "bg-v2-background-bg-deep"
        : line.type === "del" && side === "left"
          ? "bg-red-500/10"
          : line.type === "add" && side === "right"
            ? "bg-green-500/10"
            : ""
    const fg =
      line.type === "del" && side === "left"
        ? "text-red-400"
        : line.type === "add" && side === "right"
          ? "text-green-400"
          : line.type === "header"
            ? "text-v2-text-text-muted text-[11px]"
            : "text-v2-text-text-base"

    return (
      <div class={`flex-1 min-w-0 flex ${bg} ${fg}`}>
        <LineNum num={side === "left" ? line.oldNum : line.newNum} />
        <span class="flex-1 min-w-0 whitespace-pre overflow-x-auto">{line.content}</span>
      </div>
    )
  }

  return (
    <div class="font-mono text-[12px] leading-5">
      <For each={rows()}>
        {(row) => (
          <div class="flex">
            {renderSide(row.left, "left")}
            <div class="w-px bg-v2-border-border-muted shrink-0" />
            {renderSide(row.right, "right")}
          </div>
        )}
      </For>
    </div>
  )
}

export const GitDiffViewer: Component<GitDiffViewerProps> = (props) => {
  const [mode, setMode] = createSignal<ViewMode>("unified")
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())

  const toggle = (file: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between px-3 py-1.5">
        <span class="text-[13px] font-[530] text-v2-text-text-base">
          {props.diffs.length} file{props.diffs.length !== 1 ? "s" : ""} changed
        </span>
        <div class="flex items-center gap-1 rounded-md border border-v2-border-border-muted overflow-hidden">
          <button
            class={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
              mode() === "unified"
                ? "bg-[#EC5B2B] text-white"
                : "text-v2-text-text-muted hover:text-v2-text-text-base"
            }`}
            onClick={() => setMode("unified")}
          >
            Unified
          </button>
          <button
            class={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
              mode() === "split"
                ? "bg-[#EC5B2B] text-white"
                : "text-v2-text-text-muted hover:text-v2-text-text-base"
            }`}
            onClick={() => setMode("split")}
          >
            Split
          </button>
        </div>
      </div>

      <For each={props.diffs}>
        {(diff) => {
          const stats = createMemo(() => fileStats(diff.hunks))
          const isCollapsed = createMemo(() => collapsed().has(diff.file))

          return (
            <div class="border border-v2-border-border-muted rounded-lg overflow-hidden">
              <button
                class="w-full flex items-center gap-2 px-3 py-2 bg-v2-background-bg-deep hover:bg-v2-background-bg-base transition-colors text-left"
                onClick={() => toggle(diff.file)}
              >
                <span
                  class="text-v2-text-text-muted text-[11px] transition-transform shrink-0"
                  style={{ transform: isCollapsed() ? "rotate(-90deg)" : "rotate(0deg)" }}
                >
                  ▼
                </span>
                <span class="text-[12px] font-mono text-v2-text-text-base truncate flex-1 min-w-0">
                  {diff.file}
                </span>
                <Show when={stats().adds > 0}>
                  <span class="text-[11px] font-mono text-green-400 shrink-0">+{stats().adds}</span>
                </Show>
                <Show when={stats().dels > 0}>
                  <span class="text-[11px] font-mono text-red-400 shrink-0">-{stats().dels}</span>
                </Show>
              </button>
              <Show when={!isCollapsed()}>
                <div class="border-t border-v2-border-border-muted overflow-x-auto">
                  <Show when={mode() === "unified"} fallback={<SplitView hunks={diff.hunks} />}>
                    <UnifiedView hunks={diff.hunks} />
                  </Show>
                </div>
              </Show>
            </div>
          )
        }}
      </For>
    </div>
  )
}
