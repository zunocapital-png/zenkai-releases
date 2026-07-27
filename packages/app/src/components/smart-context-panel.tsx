import { Component, createSignal, For, Show } from "solid-js"

type ContextItemType = "system" | "rag" | "memory" | "file" | "git"

interface ContextItem {
  type: ContextItemType
  label: string
  content: string
  tokens: number
  relevance: number
}

interface SmartContextPanelProps {
  items: ContextItem[]
  totalTokens: number
  maxTokens: number
  onRemove?: (index: number) => void
  onAddFile?: () => void
}

const TYPE_COLORS: Record<ContextItemType, { bg: string; text: string; dot: string }> = {
  system: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-500" },
  rag: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-500" },
  memory: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-500" },
  file: { bg: "bg-[#EC5B2B]/10", text: "text-[#EC5B2B]", dot: "bg-[#EC5B2B]" },
  git: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-500" },
}

const TYPE_LABELS: Record<ContextItemType, string> = {
  system: "System",
  rag: "RAG",
  memory: "Memory",
  file: "File",
  git: "Git",
}

function TokenBudgetBar(props: { used: number; max: number }) {
  const percentage = () => Math.min(100, Math.round((props.used / props.max) * 100))
  const barColor = () => {
    const pct = percentage()
    if (pct > 90) return "bg-red-500"
    if (pct > 70) return "bg-yellow-500"
    return "bg-[#EC5B2B]"
  }

  return (
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between text-[11px] font-medium text-text-dimmed-base">
        <span>Token Budget</span>
        <span class="tabular-nums">
          {props.used.toLocaleString()} / {props.max.toLocaleString()} tokens
        </span>
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised-base">
        <div
          class={`h-full rounded-full transition-all duration-300 ${barColor()}`}
          style={{ width: `${percentage()}%` }}
        />
      </div>
    </div>
  )
}

function ContextItemCard(props: {
  item: ContextItem
  index: number
  onRemove?: () => void
}) {
  const [expanded, setExpanded] = createSignal(false)
  const colors = () => TYPE_COLORS[props.item.type]

  return (
    <div
      class={`rounded-lg border border-border-base ${colors().bg} overflow-hidden transition-all duration-200`}
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-raised-base/50"
        onClick={() => setExpanded(!expanded())}
      >
        <div class={`h-2 w-2 shrink-0 rounded-full ${colors().dot}`} />
        <span class={`text-[10px] font-bold uppercase tracking-wider ${colors().text}`}>
          {TYPE_LABELS[props.item.type]}
        </span>
        <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-text-base">
          {props.item.label}
        </span>
        <span class="shrink-0 text-[10px] tabular-nums text-text-dimmed-base">
          {props.item.tokens}t
        </span>
        <Show when={props.item.relevance < 1}>
          <span class="shrink-0 text-[10px] tabular-nums text-text-dimmed-base">
            {Math.round(props.item.relevance * 100)}%
          </span>
        </Show>
        <Show when={props.onRemove}>
          <button
            type="button"
            class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/20"
            onClick={(e) => {
              e.stopPropagation()
              props.onRemove?.()
            }}
          >
            Remove
          </button>
        </Show>
      </button>
      <Show when={expanded()}>
        <div class="border-t border-border-base px-3 py-2">
          <pre class="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-text-dimmed-base">
            {props.item.content.slice(0, 2000)}
            <Show when={props.item.content.length > 2000}>
              <span class="text-text-dimmed-base">... ({props.item.content.length - 2000} chars truncated)</span>
            </Show>
          </pre>
        </div>
      </Show>
    </div>
  )
}

export const SmartContextPanel: Component<SmartContextPanelProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal(false)

  const grouped = () => {
    const groups: Record<ContextItemType, ContextItem[]> = {
      system: [],
      rag: [],
      memory: [],
      file: [],
      git: [],
    }
    for (const item of props.items) {
      groups[item.type].push(item)
    }
    return groups
  }

  const sectionOrder: ContextItemType[] = ["system", "rag", "memory", "file", "git"]

  return (
    <div class="flex flex-col gap-3 rounded-xl border border-border-base bg-surface-primary-base p-4">
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="flex items-center gap-2 text-[13px] font-bold text-text-base hover:text-[#EC5B2B]"
          onClick={() => setCollapsed(!collapsed())}
        >
          <span classList={{ "rotate-[-90deg]": collapsed() }} class="inline-block transition-transform">
            &#9660;
          </span>
          Smart Context
        </button>
        <div class="flex items-center gap-2">
          <Show when={props.onAddFile}>
            <button
              type="button"
              class="rounded-md border border-[#EC5B2B]/30 bg-[#EC5B2B]/10 px-2.5 py-1 text-[11px] font-medium text-[#EC5B2B] hover:bg-[#EC5B2B]/20"
              onClick={() => props.onAddFile?.()}
            >
              + Add File
            </button>
          </Show>
          <span class="text-[11px] tabular-nums text-text-dimmed-base">
            {props.items.length} items
          </span>
        </div>
      </div>

      <Show when={!collapsed()}>
        <TokenBudgetBar used={props.totalTokens} max={props.maxTokens} />

        <div class="flex flex-wrap gap-1.5">
          <For each={sectionOrder}>
            {(type) => (
              <Show when={grouped()[type].length > 0}>
                <div class={`flex items-center gap-1 rounded-full px-2 py-0.5 ${TYPE_COLORS[type].bg}`}>
                  <div class={`h-1.5 w-1.5 rounded-full ${TYPE_COLORS[type].dot}`} />
                  <span class={`text-[10px] font-medium ${TYPE_COLORS[type].text}`}>
                    {TYPE_LABELS[type]} ({grouped()[type].length})
                  </span>
                </div>
              </Show>
            )}
          </For>
        </div>

        <div class="flex flex-col gap-1.5">
          <For each={props.items}>
            {(item, index) => (
              <ContextItemCard
                item={item}
                index={index()}
                onRemove={props.onRemove ? () => props.onRemove?.(index()) : undefined}
              />
            )}
          </For>
        </div>

        <Show when={props.items.length === 0}>
          <div class="py-6 text-center text-[12px] text-text-dimmed-base">
            No context loaded
          </div>
        </Show>
      </Show>
    </div>
  )
}
