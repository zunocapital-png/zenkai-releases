import { Component, createSignal, createEffect, For, Show } from "solid-js"

type ExecutionStatus = "idle" | "running" | "success" | "error"

interface CodeOutputPanelProps {
  code: string
  language: string
  output?: string
  stderr?: string
  exitCode?: number
  executionTime?: number
  status?: ExecutionStatus
  onRerun?: () => void
  onCopyOutput?: () => void
}

const LANG_LABELS: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  rust: "Rust",
  go: "Go",
  java: "Java",
  bash: "Bash",
  sh: "Shell",
}

const ANSI_COLORS: Record<string, string> = {
  "30": "text-gray-900 dark:text-gray-300",
  "31": "text-red-500",
  "32": "text-green-500",
  "33": "text-yellow-500",
  "34": "text-blue-500",
  "35": "text-purple-500",
  "36": "text-cyan-500",
  "37": "text-gray-300",
  "90": "text-gray-500",
  "91": "text-red-400",
  "92": "text-green-400",
  "93": "text-yellow-400",
  "94": "text-blue-400",
  "95": "text-purple-400",
  "96": "text-cyan-400",
}

function parseAnsiLine(raw: string): Array<{ text: string; color?: string }> {
  const segments: Array<{ text: string; color?: string }> = []
  let current = ""
  let currentColor: string | undefined
  let i = 0

  while (i < raw.length) {
    if (raw[i] === "\x1b" && raw[i + 1] === "[") {
      if (current) {
        segments.push({ text: current, color: currentColor })
        current = ""
      }
      const end = raw.indexOf("m", i)
      if (end === -1) break
      const code = raw.slice(i + 2, end)
      if (code === "0" || code === "") {
        currentColor = undefined
      } else {
        currentColor = ANSI_COLORS[code]
      }
      i = end + 1
    } else {
      current += raw[i]
      i++
    }
  }
  if (current) segments.push({ text: current, color: currentColor })
  return segments
}

function StatusIcon(props: { status: ExecutionStatus }) {
  return (
    <Show when={props.status !== "idle"}>
      <div class="flex items-center gap-1.5">
        <Show when={props.status === "running"}>
          <svg class="h-4 w-4 animate-spin text-[#EC5B2B]" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span class="text-[11px] text-[#EC5B2B]">Running</span>
        </Show>
        <Show when={props.status === "success"}>
          <svg class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          <span class="text-[11px] text-green-500">Success</span>
        </Show>
        <Show when={props.status === "error"}>
          <svg class="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
          <span class="text-[11px] text-red-500">Error</span>
        </Show>
      </div>
    </Show>
  )
}

export const CodeOutputPanel: Component<CodeOutputPanelProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal(false)
  const [copiedOutput, setCopiedOutput] = createSignal(false)

  const status = () => props.status ?? "idle"
  const langLabel = () => LANG_LABELS[props.language] ?? props.language

  const outputLines = () => {
    const combined = [props.output, props.stderr].filter(Boolean).join("\n")
    return combined ? combined.split("\n") : []
  }

  const isErrorLine = (line: string) =>
    /error|Error|ERR|FAIL|panic|traceback/i.test(line)

  const handleCopyOutput = async () => {
    const text = outputLines().join("\n")
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedOutput(true)
      setTimeout(() => setCopiedOutput(false), 1500)
      props.onCopyOutput?.()
    } catch {}
  }

  return (
    <div class="flex flex-col overflow-hidden rounded-lg border border-border-base bg-surface-primary-base">
      <button
        type="button"
        class="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-surface-raised-base/50"
        onClick={() => setCollapsed(!collapsed())}
      >
        <svg
          class="h-3 w-3 text-text-dimmed-base transition-transform"
          classList={{ "rotate-90": !collapsed() }}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4.5 2l4 4-4 4" />
        </svg>
        <span class="rounded bg-[#EC5B2B]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#EC5B2B]">
          {langLabel()}
        </span>
        <div class="flex-1" />
        <StatusIcon status={status()} />
        <Show when={props.executionTime !== undefined}>
          <span class="text-[10px] text-text-dimmed-base">
            {props.executionTime! < 1000
              ? `${props.executionTime}ms`
              : `${(props.executionTime! / 1000).toFixed(2)}s`}
          </span>
        </Show>
        <Show when={props.exitCode !== undefined && props.exitCode !== 0}>
          <span class="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
            exit {props.exitCode}
          </span>
        </Show>
      </button>

      <Show when={!collapsed()}>
        <div class="border-t border-border-base">
          <pre class="max-h-48 overflow-auto bg-surface-raised-base/30 px-3 py-2 text-[11px] leading-relaxed text-text-base">
            <code>{props.code}</code>
          </pre>
        </div>

        <Show when={outputLines().length > 0}>
          <div class="border-t border-border-base">
            <div class="flex items-center justify-between px-3 py-1.5">
              <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
                Output
              </span>
              <div class="flex items-center gap-1.5">
                <Show when={props.onRerun}>
                  <button
                    type="button"
                    class="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-text-dimmed-base transition-colors hover:bg-surface-raised-base hover:text-text-base"
                    onClick={props.onRerun}
                    disabled={status() === "running"}
                  >
                    <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M2 8a6 6 0 0 1 10.47-4M14 8a6 6 0 0 1-10.47 4" stroke-linecap="round" />
                      <path d="M13 1v3.5h-3.5M3 15v-3.5h3.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    Re-run
                  </button>
                </Show>
                <button
                  type="button"
                  class="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-text-dimmed-base transition-colors hover:bg-surface-raised-base hover:text-text-base"
                  onClick={handleCopyOutput}
                >
                  <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="5" y="5" width="9" height="9" rx="1.5" />
                    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
                  </svg>
                  {copiedOutput() ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <pre class="max-h-64 overflow-auto px-3 pb-2 font-mono text-[11px] leading-relaxed">
              <For each={outputLines()}>
                {(line) => (
                  <div
                    classList={{
                      "bg-red-500/8 text-red-400 -mx-3 px-3": isErrorLine(line),
                    }}
                  >
                    <For each={parseAnsiLine(line)}>
                      {(seg) => (
                        <span class={seg.color ?? "text-text-base"}>{seg.text}</span>
                      )}
                    </For>
                    {"\n"}
                  </div>
                )}
              </For>
            </pre>
          </div>
        </Show>

        <Show when={outputLines().length === 0 && status() !== "running"}>
          <div class="border-t border-border-base px-3 py-4 text-center text-[11px] text-text-dimmed-base">
            No output
          </div>
        </Show>
      </Show>
    </div>
  )
}
