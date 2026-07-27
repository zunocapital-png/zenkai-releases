import { Component, For, Show, createSignal, createMemo } from "solid-js"

interface BlameBlock {
  hash: string
  author: string
  date: string
  message: string
  startLine: number
  lines: string[]
}

interface GitBlameProps {
  file: string
  blocks: BlameBlock[]
  onCommitClick?: (hash: string) => void
}

const COLORS = [
  "bg-v2-background-bg-base",
  "bg-v2-background-bg-deep",
]

export const GitBlame: Component<GitBlameProps> = (props) => {
  const [hoveredBlock, setHoveredBlock] = createSignal<string | null>(null)
  const [tooltip, setTooltip] = createSignal<{ x: number; y: number; block: BlameBlock } | null>(null)

  const allLines = createMemo(() => {
    const result: Array<{ line: string; num: number; block: BlameBlock; isFirst: boolean; colorIdx: number }> = []
    let colorIdx = 0
    for (const block of props.blocks) {
      for (let i = 0; i < block.lines.length; i++) {
        result.push({
          line: block.lines[i]!,
          num: block.startLine + i,
          block,
          isFirst: i === 0,
          colorIdx,
        })
      }
      colorIdx = (colorIdx + 1) % 2
    }
    return result
  })

  const handleMouseEnter = (block: BlameBlock, e: MouseEvent) => {
    setHoveredBlock(block.hash)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({ x: rect.left, y: rect.bottom + 4, block })
  }

  const handleMouseLeave = () => {
    setHoveredBlock(null)
    setTooltip(null)
  }

  return (
    <div class="flex flex-col border border-v2-border-border-muted rounded-lg overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 bg-v2-background-bg-deep border-b border-v2-border-border-muted">
        <span class="text-[12px] font-mono text-v2-text-text-base truncate">{props.file}</span>
        <span class="text-[11px] text-v2-text-text-muted ml-auto shrink-0">
          {props.blocks.length} block{props.blocks.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div class="overflow-x-auto font-mono text-[12px] leading-5 relative">
        <For each={allLines()}>
          {(entry) => {
            const isHovered = createMemo(() => hoveredBlock() === entry.block.hash)

            return (
              <div
                class={`flex ${COLORS[entry.colorIdx]!} ${
                  isHovered() ? "!bg-[#EC5B2B]/8" : ""
                } transition-colors`}
              >
                <Show when={entry.isFirst}>
                  <div
                    class="w-[200px] shrink-0 flex items-start gap-1.5 px-2 py-px border-r border-v2-border-border-muted cursor-pointer"
                    onMouseEnter={(e) => handleMouseEnter(entry.block, e)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => props.onCommitClick?.(entry.block.hash)}
                  >
                    <span class="text-[#EC5B2B] hover:underline">{entry.block.hash.slice(0, 8)}</span>
                    <span class="text-v2-text-text-muted truncate flex-1 min-w-0">
                      {entry.block.author}
                    </span>
                    <span class="text-v2-text-text-muted opacity-60 shrink-0">{entry.block.date}</span>
                  </div>
                </Show>
                <Show when={!entry.isFirst}>
                  <div class="w-[200px] shrink-0 border-r border-v2-border-border-muted" />
                </Show>
                <span class="inline-block w-12 text-right pr-2 select-none text-v2-text-text-muted opacity-50 shrink-0">
                  {entry.num}
                </span>
                <span class="flex-1 min-w-0 whitespace-pre text-v2-text-text-base pr-4">{entry.line}</span>
              </div>
            )
          }}
        </For>
      </div>

      <Show when={tooltip()}>
        {(tip) => (
          <div
            class="fixed z-50 px-3 py-2 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-deep shadow-lg max-w-sm"
            style={{ left: `${tip().x}px`, top: `${tip().y}px` }}
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[#EC5B2B] font-mono text-[11px]">{tip().block.hash.slice(0, 8)}</span>
              <span class="text-v2-text-text-muted text-[11px]">{tip().block.date}</span>
            </div>
            <div class="text-[12px] text-v2-text-text-base font-medium mb-0.5">{tip().block.author}</div>
            <div class="text-[11px] text-v2-text-text-muted leading-4">{tip().block.message}</div>
          </div>
        )}
      </Show>
    </div>
  )
}
