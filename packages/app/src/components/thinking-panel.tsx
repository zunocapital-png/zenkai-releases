import { Component, createSignal, For, Show, Switch, Match } from "solid-js"

interface ThinkingStep {
  id: string
  title: string
  content: string
  status: "thinking" | "done" | "error"
  durationMs?: number
}

interface ThinkingPanelProps {
  steps: ThinkingStep[]
  isActive: boolean
  onSkip?: () => void
  defaultExpanded?: boolean
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function StepStatusIcon(props: { status: "thinking" | "done" | "error" }) {
  return (
    <Switch>
      <Match when={props.status === "thinking"}>
        <div class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#EC5B2B] border-t-transparent" />
      </Match>
      <Match when={props.status === "done"}>
        <div class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500/20">
          <svg class="h-2.5 w-2.5 text-green-400" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </Match>
      <Match when={props.status === "error"}>
        <div class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/20">
          <svg class="h-2.5 w-2.5 text-red-400" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
      </Match>
    </Switch>
  )
}

function StepCard(props: { step: ThinkingStep }) {
  const [expanded, setExpanded] = createSignal(false)

  return (
    <div
      classList={{
        "rounded-lg border overflow-hidden transition-colors": true,
        "border-[#EC5B2B]/30 bg-[#EC5B2B]/5": props.step.status === "thinking",
        "border-border-base bg-surface-raised-stronger-non-alpha": props.step.status === "done",
        "border-red-500/30 bg-red-500/5": props.step.status === "error",
      }}
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-raised-base"
        onClick={() => setExpanded((v) => !v)}
      >
        <StepStatusIcon status={props.step.status} />
        <span class="flex-1 text-[12px] font-[530] text-text-base">{props.step.title}</span>
        <Show when={props.step.durationMs !== undefined}>
          <span class="shrink-0 text-[11px] tabular-nums text-text-weak">{formatDuration(props.step.durationMs!)}</span>
        </Show>
        <svg
          class={`h-3 w-3 shrink-0 text-text-dimmed-base transition-transform ${expanded() ? "rotate-90" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div
        class="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ "grid-template-rows": expanded() ? "1fr" : "0fr" }}
      >
        <div class="overflow-hidden">
          <div class="border-t border-border-base/50 px-3 py-2">
            <p class="whitespace-pre-wrap text-[12px] leading-relaxed text-text-strong">{props.step.content}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export const ThinkingPanel: Component<ThinkingPanelProps> = (props) => {
  const [visible, setVisible] = createSignal(props.defaultExpanded ?? true)

  const doneCount = () => props.steps.filter((s) => s.status === "done").length
  const progressPct = () => (props.steps.length > 0 ? (doneCount() / props.steps.length) * 100 : 0)
  const totalMs = () => props.steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0)

  return (
    <div class="flex flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha">
      <div class="flex items-center justify-between border-b border-border-base px-3 py-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="shrink-0 w-5 h-5 flex items-center justify-center text-text-dimmed-base hover:text-text-base transition-colors"
            onClick={() => setVisible((v) => !v)}
          >
            <svg
              class={`w-3.5 h-3.5 transition-transform ${visible() ? "rotate-90" : ""}`}
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span class="text-[12px] font-bold uppercase tracking-wider text-[#EC5B2B]">Thinking</span>
          <Show when={props.steps.length > 0}>
            <span class="text-[11px] tabular-nums text-text-weak">
              {doneCount()}/{props.steps.length}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Show when={totalMs() > 0}>
            <span class="text-[11px] tabular-nums text-text-weak">{formatDuration(totalMs())}</span>
          </Show>
          <Show when={props.isActive && props.onSkip}>
            <button
              type="button"
              class="rounded px-3 py-1 text-[11px] font-medium text-[#EC5B2B] hover:bg-[#EC5B2B]/10 transition-colors"
              onClick={() => props.onSkip?.()}
            >
              Skip to answer
            </button>
          </Show>
        </div>
      </div>

      <Show when={props.steps.length > 0}>
        <div class="px-3 py-2 border-b border-border-base">
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised-base">
            <div
              class="h-full rounded-full transition-all duration-300 ease-out"
              classList={{
                "bg-[#EC5B2B]": props.isActive,
                "bg-green-500": !props.isActive && progressPct() === 100,
                "bg-[#EC5B2B]/60": !props.isActive && progressPct() < 100,
              }}
              style={{ width: `${progressPct()}%` }}
            />
          </div>
        </div>
      </Show>

      <div
        class="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ "grid-template-rows": visible() ? "1fr" : "0fr" }}
      >
        <div class="overflow-hidden">
          <div class="flex flex-col gap-2 p-3">
            <For each={props.steps}>
              {(step) => <StepCard step={step} />}
            </For>
          </div>

          <Show when={!props.isActive && props.steps.length > 0}>
            <div class="flex items-center justify-end border-t border-border-base px-3 py-1.5">
              <span class="text-[11px] tabular-nums text-text-weak">
                Total: {formatDuration(totalMs())}
              </span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
