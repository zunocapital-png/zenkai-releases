import { Component, createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js"

interface CommandHistoryEntry {
  command: string
  output?: string
  exitCode?: number
  timestamp: number
}

interface AiSuggestion {
  command: string
  description: string
}

interface TerminalEnhancedProps {
  workingDirectory: string
  processStatus?: "idle" | "running" | "stopped" | "error"
  history?: CommandHistoryEntry[]
  aiSuggestions?: AiSuggestion[]
  aiExplanation?: string
  onExecute?: (command: string) => void
  onExplainCommand?: (command: string) => void
  onAcceptSuggestion?: (command: string) => void
}

const CMD_HIGHLIGHTS: Array<{ pattern: RegExp; color: string }> = [
  { pattern: /^(git|npm|npx|yarn|pnpm|bun|cargo|go|pip|python|node|deno)\b/, color: "text-[#EC5B2B]" },
  { pattern: /\b(--[\w-]+)/, color: "text-cyan-400" },
  { pattern: /\b(-\w)\b/, color: "text-cyan-400" },
  { pattern: /(\|)/, color: "text-yellow-400" },
  { pattern: /(&&|\|\|)/, color: "text-yellow-400" },
  { pattern: /(["'])(?:(?=(\\?))\2.)*?\1/, color: "text-green-400" },
]

function highlightCommand(cmd: string): string {
  return cmd
}

function StatusDot(props: { status: string }) {
  return (
    <div
      classList={{
        "h-2 w-2 rounded-full shrink-0": true,
        "bg-gray-500": props.status === "idle",
        "bg-green-500 animate-pulse": props.status === "running",
        "bg-yellow-500": props.status === "stopped",
        "bg-red-500": props.status === "error",
      }}
    />
  )
}

export const TerminalEnhanced: Component<TerminalEnhancedProps> = (props) => {
  const [input, setInput] = createSignal("")
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  const [showSuggestions, setShowSuggestions] = createSignal(false)
  const [showExplanation, setShowExplanation] = createSignal(false)
  const [selectedSuggestion, setSelectedSuggestion] = createSignal(0)
  let inputRef: HTMLInputElement | undefined
  let outputRef: HTMLDivElement | undefined

  const history = () => props.history ?? []
  const suggestions = () => props.aiSuggestions ?? []
  const processStatus = () => props.processStatus ?? "idle"

  const filteredSuggestions = () => {
    const q = input().toLowerCase()
    if (!q) return suggestions().slice(0, 5)
    return suggestions().filter((s) => s.command.toLowerCase().includes(q)).slice(0, 5)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (showSuggestions() && filteredSuggestions().length > 0) {
        setSelectedSuggestion(Math.max(0, selectedSuggestion() - 1))
        return
      }
      const cmds = history().map((h) => h.command)
      if (cmds.length === 0) return
      const next = historyIndex() + 1
      if (next < cmds.length) {
        setHistoryIndex(next)
        setInput(cmds[cmds.length - 1 - next]!)
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (showSuggestions() && filteredSuggestions().length > 0) {
        setSelectedSuggestion(Math.min(filteredSuggestions().length - 1, selectedSuggestion() + 1))
        return
      }
      const cmds = history().map((h) => h.command)
      const next = historyIndex() - 1
      if (next >= 0) {
        setHistoryIndex(next)
        setInput(cmds[cmds.length - 1 - next]!)
      } else {
        setHistoryIndex(-1)
        setInput("")
      }
    } else if (e.key === "Tab" && showSuggestions() && filteredSuggestions().length > 0) {
      e.preventDefault()
      const suggestion = filteredSuggestions()[selectedSuggestion()]
      if (suggestion) {
        setInput(suggestion.command)
        setShowSuggestions(false)
        props.onAcceptSuggestion?.(suggestion.command)
      }
    } else if (e.key === "Enter") {
      e.preventDefault()
      const cmd = input().trim()
      if (!cmd) return
      props.onExecute?.(cmd)
      setInput("")
      setHistoryIndex(-1)
      setShowSuggestions(false)
    } else if (e.key === "Escape") {
      setShowSuggestions(false)
    }
  }

  createEffect(() => {
    const val = input()
    setShowSuggestions(val.length > 0 && filteredSuggestions().length > 0)
    setSelectedSuggestion(0)
  })

  createEffect(() => {
    history()
    if (outputRef) {
      outputRef.scrollTop = outputRef.scrollHeight
    }
  })

  return (
    <div class="flex h-full flex-col overflow-hidden rounded-lg border border-border-base bg-surface-primary-base">
      <div class="flex items-center gap-2 border-b border-border-base px-3 py-1.5">
        <StatusDot status={processStatus()} />
        <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
          Terminal
        </span>
        <div class="flex-1" />
        <span class="max-w-[200px] truncate text-[10px] text-text-dimmed-base">
          {props.workingDirectory}
        </span>
        <span
          classList={{
            "rounded px-1.5 py-0.5 text-[10px] font-medium": true,
            "bg-gray-500/10 text-gray-400": processStatus() === "idle",
            "bg-green-500/10 text-green-500": processStatus() === "running",
            "bg-yellow-500/10 text-yellow-500": processStatus() === "stopped",
            "bg-red-500/10 text-red-500": processStatus() === "error",
          }}
        >
          {processStatus()}
        </span>
      </div>

      <div class="flex flex-1 overflow-hidden">
        <div class="flex flex-1 flex-col overflow-hidden">
          <div ref={outputRef} class="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
            <For each={history()}>
              {(entry) => (
                <div class="mb-2">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[#EC5B2B]">$</span>
                    <span class="text-text-base">{entry.command}</span>
                    <Show when={entry.exitCode !== undefined && entry.exitCode !== 0}>
                      <span class="ml-auto text-[10px] text-red-500">
                        [{entry.exitCode}]
                      </span>
                    </Show>
                  </div>
                  <Show when={entry.output}>
                    <pre
                      classList={{
                        "mt-0.5 whitespace-pre-wrap text-text-dimmed-base": true,
                        "text-red-400": (entry.exitCode ?? 0) !== 0,
                      }}
                    >
                      {entry.output}
                    </pre>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <div class="relative border-t border-border-base">
            <Show when={showSuggestions() && filteredSuggestions().length > 0}>
              <div class="absolute bottom-full left-0 right-0 z-10 border border-border-base bg-surface-primary-base shadow-lg">
                <For each={filteredSuggestions()}>
                  {(suggestion, idx) => (
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
                      classList={{
                        "bg-[#EC5B2B]/10": idx() === selectedSuggestion(),
                        "hover:bg-surface-raised-base/50": idx() !== selectedSuggestion(),
                      }}
                      onClick={() => {
                        setInput(suggestion.command)
                        setShowSuggestions(false)
                        inputRef?.focus()
                        props.onAcceptSuggestion?.(suggestion.command)
                      }}
                    >
                      <span class="font-mono text-[11px] text-[#EC5B2B]">{suggestion.command}</span>
                      <span class="truncate text-[10px] text-text-dimmed-base">{suggestion.description}</span>
                    </button>
                  )}
                </For>
                <div class="border-t border-border-base px-3 py-1 text-[9px] text-text-dimmed-base">
                  Tab to accept &middot; Esc to dismiss
                </div>
              </div>
            </Show>

            <div class="flex items-center gap-1.5 px-3 py-2">
              <span class="font-mono text-[12px] text-[#EC5B2B]">$</span>
              <input
                ref={inputRef}
                type="text"
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command..."
                class="flex-1 bg-transparent font-mono text-[12px] text-text-base placeholder:text-text-dimmed-base focus:outline-none"
                spellcheck={false}
                autocomplete="off"
              />
              <Show when={input().trim()}>
                <button
                  type="button"
                  class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-text-dimmed-base transition-colors hover:bg-surface-raised-base hover:text-text-base"
                  onClick={() => props.onExplainCommand?.(input().trim())}
                >
                  <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="8" cy="8" r="6" />
                    <path d="M6.5 6.5a1.5 1.5 0 0 1 3 0c0 1-1.5 1-1.5 2M8 11h.01" stroke-linecap="round" />
                  </svg>
                  Explain
                </button>
              </Show>
            </div>
          </div>
        </div>

        <Show when={props.aiExplanation}>
          <div class="flex w-64 shrink-0 flex-col border-l border-border-base">
            <div class="flex items-center justify-between border-b border-border-base px-3 py-1.5">
              <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
                AI Explanation
              </span>
              <button
                type="button"
                class="rounded p-0.5 text-text-dimmed-base transition-colors hover:text-text-base"
                onClick={() => setShowExplanation(false)}
              >
                <svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M9 3L3 9M3 3l6 6" stroke-linecap="round" />
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed text-text-base">
              {props.aiExplanation}
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
