import { batch, createEffect, createSignal, For, on, onCleanup, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"

type StackFrame = {
  file: string
  line: number
  column?: number
  function: string
  code?: string
}

type ConsoleEntry = {
  id: number
  level: "error" | "warn" | "info" | "debug"
  message: string
  timestamp: number
}

type Breakpoint = {
  id: string
  file: string
  line: number
  enabled: boolean
  condition?: string
}

type WatchExpression = {
  id: string
  expression: string
  value: string
  error?: string
}

type DebugPanelProps = {
  onAnalyze?: (context: { error: string; stack: string; frames: StackFrame[] }) => void
}

let entryCounter = 0

const LEVEL_COLORS: Record<ConsoleEntry["level"], string> = {
  error: "text-[#EC5B2B]",
  warn: "text-yellow-400",
  info: "text-text-strong",
  debug: "text-text-weak",
}

const LEVEL_BG: Record<ConsoleEntry["level"], string> = {
  error: "bg-[#EC5B2B]/10",
  warn: "bg-yellow-400/10",
  info: "bg-transparent",
  debug: "bg-transparent",
}

function TabButton(props: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      classList={{
        "px-3 py-1.5 text-[12px] font-medium transition-colors": true,
        "border-b-2 border-[#EC5B2B] text-[#EC5B2B]": props.active,
        "border-b-2 border-transparent text-text-weak hover:text-text-strong": !props.active,
      }}
      onClick={props.onClick}
    >
      {props.label}
      <Show when={props.count !== undefined && props.count > 0}>
        <span class="ml-1.5 rounded-full bg-[#EC5B2B]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#EC5B2B]">{props.count}</span>
      </Show>
    </button>
  )
}

function FrameRow(props: { frame: StackFrame; index: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      classList={{
        "flex w-full items-start gap-2 px-3 py-1.5 text-left font-mono text-[12px] transition-colors": true,
        "bg-[#EC5B2B]/10 text-[#EC5B2B]": props.selected,
        "text-text-weak hover:bg-surface-raised-base": !props.selected,
      }}
      onClick={props.onClick}
    >
      <span class="shrink-0 text-text-weak opacity-50">#{props.index}</span>
      <span class="min-w-0 truncate">
        <span class="text-text-strong">{props.frame.function}</span>
        <span class="text-text-weak">
          {" "}
          {props.frame.file}:{props.frame.line}
          <Show when={props.frame.column !== undefined}>:{props.frame.column}</Show>
        </span>
      </span>
    </button>
  )
}

function VariableNode(props: { name: string; value: unknown; depth: number }) {
  const [expanded, setExpanded] = createSignal(false)
  const isObject = () => typeof props.value === "object" && props.value !== null
  const displayValue = () => {
    if (props.value === null) return "null"
    if (props.value === undefined) return "undefined"
    if (typeof props.value === "string") return `"${props.value}"`
    if (typeof props.value === "boolean") return props.value ? "true" : "false"
    if (typeof props.value === "number") return String(props.value)
    if (Array.isArray(props.value)) return `Array(${props.value.length})`
    return `{${Object.keys(props.value as Record<string, unknown>).length}}`
  }
  const typeColor = () => {
    if (props.value === null || props.value === undefined) return "text-text-weak"
    if (typeof props.value === "string") return "text-green-400"
    if (typeof props.value === "number") return "text-blue-400"
    if (typeof props.value === "boolean") return "text-[#EC5B2B]"
    return "text-text-strong"
  }

  return (
    <div style={{ "padding-left": `${props.depth * 16}px` }}>
      <button
        type="button"
        classList={{
          "flex w-full items-center gap-1 py-0.5 text-left font-mono text-[12px] hover:bg-surface-raised-base": true,
        }}
        onClick={() => isObject() && setExpanded((p) => !p)}
      >
        <Show when={isObject()}>
          <span classList={{ "text-text-weak text-[10px] w-3 text-center": true }}>{expanded() ? "▼" : "▶"}</span>
        </Show>
        <Show when={!isObject()}>
          <span class="w-3" />
        </Show>
        <span class="text-purple-400">{props.name}</span>
        <span class="text-text-weak">:</span>
        <span class={typeColor()}>{displayValue()}</span>
      </button>
      <Show when={expanded() && isObject()}>
        <For each={Object.entries(props.value as Record<string, unknown>)}>
          {([key, val]) => <VariableNode name={key} value={val} depth={props.depth + 1} />}
        </For>
      </Show>
    </div>
  )
}

export function DebugPanel(props: DebugPanelProps) {
  const [state, setState] = createStore({
    tab: "stack" as "stack" | "console" | "breakpoints" | "watch",
    errorMessage: "",
    rawStack: "",
    frames: [] as StackFrame[],
    selectedFrame: -1,
    variables: {} as Record<string, unknown>,
    console: [] as ConsoleEntry[],
    consoleFilter: "all" as "all" | ConsoleEntry["level"],
    breakpoints: [] as Breakpoint[],
    watches: [] as WatchExpression[],
    newWatch: "",
    collapsed: false,
  })

  const filteredConsole = () => {
    if (state.consoleFilter === "all") return state.console
    return state.console.filter((e) => e.level === state.consoleFilter)
  }

  const errorCount = () => state.console.filter((e) => e.level === "error").length

  const handleAnalyze = () => {
    props.onAnalyze?.({
      error: state.errorMessage,
      stack: state.rawStack,
      frames: state.frames,
    })
  }

  const addConsoleEntry = (level: ConsoleEntry["level"], message: string) => {
    setState(
      produce((s) => {
        s.console.push({ id: ++entryCounter, level, message, timestamp: Date.now() })
        if (s.console.length > 500) s.console.splice(0, s.console.length - 500)
      }),
    )
  }

  const toggleBreakpoint = (id: string) => {
    setState(
      produce((s) => {
        const bp = s.breakpoints.find((b) => b.id === id)
        if (bp) bp.enabled = !bp.enabled
      }),
    )
  }

  const removeBreakpoint = (id: string) => {
    setState(
      produce((s) => {
        const idx = s.breakpoints.findIndex((b) => b.id === id)
        if (idx >= 0) s.breakpoints.splice(idx, 1)
      }),
    )
  }

  const addWatch = () => {
    const expr = state.newWatch.trim()
    if (!expr) return
    setState(
      produce((s) => {
        s.watches.push({ id: `w_${Date.now()}`, expression: expr, value: "—", error: undefined })
        s.newWatch = ""
      }),
    )
  }

  const removeWatch = (id: string) => {
    setState(
      produce((s) => {
        const idx = s.watches.findIndex((w) => w.id === id)
        if (idx >= 0) s.watches.splice(idx, 1)
      }),
    )
  }

  const setError = (message: string, raw: string, frames: StackFrame[]) => {
    batch(() => {
      setState("errorMessage", message)
      setState("rawStack", raw)
      setState("frames", frames)
      setState("selectedFrame", frames.length > 0 ? 0 : -1)
      setState("tab", "stack")
    })
  }

  const setVariables = (vars: Record<string, unknown>) => {
    setState("variables", vars)
  }

  void setError
  void setVariables
  void addConsoleEntry

  return (
    <div
      classList={{
        "flex flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha font-mono": true,
        "h-10": state.collapsed,
      }}
    >
      <div class="flex items-center justify-between border-b border-border-base px-3 py-1.5">
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-bold uppercase tracking-wider text-[#EC5B2B]">Debug</span>
          <Show when={state.errorMessage}>
            <span class="max-w-[300px] truncate rounded bg-[#EC5B2B]/10 px-2 py-0.5 text-[11px] text-[#EC5B2B]">{state.errorMessage.split("\n")[0]}</span>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <Show when={state.errorMessage}>
            <button
              type="button"
              class="rounded px-2 py-1 text-[11px] font-medium text-[#EC5B2B] transition-colors hover:bg-[#EC5B2B]/10"
              onClick={handleAnalyze}
            >
              Analyze with AI
            </button>
          </Show>
          <button
            type="button"
            class="rounded p-1 text-text-weak transition-colors hover:bg-surface-raised-base hover:text-text-strong"
            onClick={() => setState("collapsed", (c) => !c)}
          >
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <Show when={!state.collapsed}>
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </Show>
              <Show when={state.collapsed}>
                <path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </Show>
            </svg>
          </button>
        </div>
      </div>

      <Show when={!state.collapsed}>
        <div class="flex border-b border-border-base">
          <TabButton active={state.tab === "stack"} label="Stack Trace" count={state.frames.length} onClick={() => setState("tab", "stack")} />
          <TabButton active={state.tab === "console"} label="Console" count={errorCount()} onClick={() => setState("tab", "console")} />
          <TabButton active={state.tab === "breakpoints"} label="Breakpoints" count={state.breakpoints.length} onClick={() => setState("tab", "breakpoints")} />
          <TabButton active={state.tab === "watch"} label="Watch" count={state.watches.length} onClick={() => setState("tab", "watch")} />
        </div>

        <div class="min-h-[200px] max-h-[400px] overflow-auto">
          <Show when={state.tab === "stack"}>
            <Show when={state.errorMessage} fallback={<div class="px-3 py-6 text-center text-[12px] text-text-weak">No errors captured</div>}>
              <div class="border-b border-border-base bg-[#EC5B2B]/5 px-3 py-2">
                <pre class="whitespace-pre-wrap text-[12px] text-[#EC5B2B]">{state.errorMessage}</pre>
              </div>
              <div class="flex">
                <div class="w-1/2 border-r border-border-base">
                  <div class="border-b border-border-base px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-weak">Frames</div>
                  <For each={state.frames}>
                    {(frame, i) => (
                      <FrameRow frame={frame} index={i()} selected={state.selectedFrame === i()} onClick={() => setState("selectedFrame", i())} />
                    )}
                  </For>
                </div>
                <div class="w-1/2">
                  <div class="border-b border-border-base px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-weak">Variables</div>
                  <div class="p-2">
                    <Show
                      when={Object.keys(state.variables).length > 0}
                      fallback={<div class="py-4 text-center text-[11px] text-text-weak">No variables at this frame</div>}
                    >
                      <For each={Object.entries(state.variables)}>{([key, val]) => <VariableNode name={key} value={val} depth={0} />}</For>
                    </Show>
                  </div>
                </div>
              </div>
            </Show>
          </Show>

          <Show when={state.tab === "console"}>
            <div class="flex items-center gap-1 border-b border-border-base px-3 py-1">
              <For each={["all", "error", "warn", "info", "debug"] as const}>
                {(level) => (
                  <button
                    type="button"
                    classList={{
                      "rounded px-2 py-0.5 text-[11px] font-medium transition-colors": true,
                      "bg-[#EC5B2B]/20 text-[#EC5B2B]": state.consoleFilter === level,
                      "text-text-weak hover:text-text-strong": state.consoleFilter !== level,
                    }}
                    onClick={() => setState("consoleFilter", level)}
                  >
                    {level}
                  </button>
                )}
              </For>
            </div>
            <Show when={filteredConsole().length === 0}>
              <div class="px-3 py-6 text-center text-[12px] text-text-weak">No console output</div>
            </Show>
            <For each={filteredConsole()}>
              {(entry) => (
                <div classList={{ "flex items-start gap-2 border-b border-border-base/50 px-3 py-1": true, [LEVEL_BG[entry.level]]: true }}>
                  <span class="shrink-0 text-[10px] tabular-nums text-text-weak">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  <span classList={{ "text-[12px] min-w-0 break-all": true, [LEVEL_COLORS[entry.level]]: true }}>{entry.message}</span>
                </div>
              )}
            </For>
          </Show>

          <Show when={state.tab === "breakpoints"}>
            <Show when={state.breakpoints.length === 0}>
              <div class="px-3 py-6 text-center text-[12px] text-text-weak">No breakpoints set</div>
            </Show>
            <For each={state.breakpoints}>
              {(bp) => (
                <div class="flex items-center gap-2 border-b border-border-base/50 px-3 py-1.5">
                  <button
                    type="button"
                    classList={{
                      "h-3 w-3 shrink-0 rounded-full border-2 transition-colors": true,
                      "border-[#EC5B2B] bg-[#EC5B2B]": bp.enabled,
                      "border-text-weak bg-transparent": !bp.enabled,
                    }}
                    onClick={() => toggleBreakpoint(bp.id)}
                  />
                  <span class="min-w-0 flex-1 truncate text-[12px] text-text-strong">
                    {bp.file}:{bp.line}
                  </span>
                  <Show when={bp.condition}>
                    <span class="rounded bg-surface-raised-base px-1.5 py-0.5 text-[10px] text-text-weak">{bp.condition}</span>
                  </Show>
                  <button type="button" class="text-[12px] text-text-weak transition-colors hover:text-[#EC5B2B]" onClick={() => removeBreakpoint(bp.id)}>
                    ×
                  </button>
                </div>
              )}
            </For>
          </Show>

          <Show when={state.tab === "watch"}>
            <div class="flex items-center gap-1 border-b border-border-base px-3 py-1">
              <input
                type="text"
                class="flex-1 bg-transparent text-[12px] text-text-strong placeholder:text-text-weak focus:outline-none"
                placeholder="Add watch expression..."
                value={state.newWatch}
                onInput={(e) => setState("newWatch", e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && addWatch()}
              />
              <button type="button" class="rounded px-2 py-0.5 text-[11px] font-medium text-[#EC5B2B] hover:bg-[#EC5B2B]/10" onClick={addWatch}>
                +
              </button>
            </div>
            <Show when={state.watches.length === 0}>
              <div class="px-3 py-6 text-center text-[12px] text-text-weak">No watch expressions</div>
            </Show>
            <For each={state.watches}>
              {(watch) => (
                <div class="flex items-center gap-2 border-b border-border-base/50 px-3 py-1.5">
                  <span class="text-[12px] text-purple-400">{watch.expression}</span>
                  <span class="text-[12px] text-text-weak">=</span>
                  <span classList={{ "flex-1 text-[12px]": true, "text-[#EC5B2B]": !!watch.error, "text-text-strong": !watch.error }}>
                    {watch.error ?? watch.value}
                  </span>
                  <button type="button" class="text-[12px] text-text-weak transition-colors hover:text-[#EC5B2B]" onClick={() => removeWatch(watch.id)}>
                    ×
                  </button>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}
