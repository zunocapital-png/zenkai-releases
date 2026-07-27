import { Component, createSignal, createMemo, For, Show } from "solid-js"

type Severity = "critical" | "warning" | "info"

interface ReviewFinding {
  id: string
  severity: Severity
  file: string
  line: number
  description: string
  suggestedFix?: string
}

interface CodeReviewPanelProps {
  findings: ReviewFinding[]
  onApplyFix?: (finding: ReviewFinding) => void
  onApplyAllSafe?: () => void
  onFileClick?: (file: string, line: number) => void
}

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; bg: string; text: string; border: string }> = {
  critical: {
    label: "Critical",
    dot: "bg-red-500",
    bg: "bg-red-500/8",
    text: "text-red-500",
    border: "border-red-500/20",
  },
  warning: {
    label: "Warning",
    dot: "bg-yellow-500",
    bg: "bg-yellow-500/8",
    text: "text-yellow-500",
    border: "border-yellow-500/20",
  },
  info: {
    label: "Info",
    dot: "bg-blue-400",
    bg: "bg-blue-400/8",
    text: "text-blue-400",
    border: "border-blue-400/20",
  },
}

function SeverityBadge(props: { severity: Severity; count: number }) {
  const config = () => SEVERITY_CONFIG[props.severity]
  return (
    <div class={`flex items-center gap-1.5 rounded-md px-2 py-1 ${config().bg}`}>
      <div class={`h-2 w-2 rounded-full ${config().dot}`} />
      <span class={`text-[11px] font-medium ${config().text}`}>
        {props.count} {config().label}
      </span>
    </div>
  )
}

function FindingCard(props: {
  finding: ReviewFinding
  onApplyFix?: () => void
  onFileClick?: () => void
}) {
  const [expanded, setExpanded] = createSignal(false)
  const config = () => SEVERITY_CONFIG[props.finding.severity]

  return (
    <div class={`rounded-lg border ${config().border} ${config().bg} transition-colors`}>
      <button
        type="button"
        class="flex w-full items-start gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded(!expanded())}
      >
        <div class={`mt-1 h-2 w-2 shrink-0 rounded-full ${config().dot}`} />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-[12px] text-text-base">{props.finding.description}</span>
          <button
            type="button"
            class="self-start text-[10px] font-medium text-[#EC5B2B] transition-colors hover:text-[#EC5B2B]/70"
            onClick={(e) => {
              e.stopPropagation()
              props.onFileClick?.()
            }}
          >
            {props.finding.file}:{props.finding.line}
          </button>
        </div>
        <svg
          class="mt-1 h-3 w-3 shrink-0 text-text-dimmed-base transition-transform"
          classList={{ "rotate-180": expanded() }}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M2.5 4.5l3.5 3 3.5-3" />
        </svg>
      </button>

      <Show when={expanded() && props.finding.suggestedFix}>
        <div class="border-t border-border-base px-3 py-2">
          <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
            Suggested Fix
          </span>
          <pre class="mt-1 overflow-x-auto rounded bg-surface-raised-base/50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-text-base">
            {props.finding.suggestedFix}
          </pre>
          <Show when={props.onApplyFix}>
            <button
              type="button"
              class="mt-2 rounded-md bg-[#EC5B2B] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[#d44f24]"
              onClick={(e) => {
                e.stopPropagation()
                props.onApplyFix?.()
              }}
            >
              Apply Fix
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export const CodeReviewPanel: Component<CodeReviewPanelProps> = (props) => {
  const [filterSeverity, setFilterSeverity] = createSignal<Severity | null>(null)

  const counts = createMemo(() => ({
    critical: props.findings.filter((f) => f.severity === "critical").length,
    warning: props.findings.filter((f) => f.severity === "warning").length,
    info: props.findings.filter((f) => f.severity === "info").length,
  }))

  const grouped = createMemo(() => {
    const active = filterSeverity()
    const filtered = active ? props.findings.filter((f) => f.severity === active) : props.findings

    const groups: Record<Severity, ReviewFinding[]> = { critical: [], warning: [], info: [] }
    for (const f of filtered) groups[f.severity].push(f)
    return groups
  })

  const safeFixes = createMemo(() =>
    props.findings.filter((f) => f.suggestedFix && f.severity !== "critical"),
  )

  return (
    <div class="flex flex-col gap-3 rounded-xl border border-border-base bg-surface-primary-base p-4">
      <div class="flex items-center justify-between">
        <span class="text-[13px] font-bold text-text-base">Code Review</span>
        <Show when={safeFixes().length > 0 && props.onApplyAllSafe}>
          <button
            type="button"
            class="rounded-md bg-[#EC5B2B] px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-[#d44f24]"
            onClick={props.onApplyAllSafe}
          >
            Apply {safeFixes().length} Safe Fixes
          </button>
        </Show>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          classList={{
            "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors": true,
            "bg-[#EC5B2B] text-white": filterSeverity() === null,
            "bg-surface-raised-base text-text-dimmed-base hover:text-text-base": filterSeverity() !== null,
          }}
          onClick={() => setFilterSeverity(null)}
        >
          All ({props.findings.length})
        </button>
        <Show when={counts().critical > 0}>
          <button
            type="button"
            classList={{
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors": true,
              "bg-red-500 text-white": filterSeverity() === "critical",
              "bg-red-500/10 text-red-500 hover:bg-red-500/20": filterSeverity() !== "critical",
            }}
            onClick={() => setFilterSeverity(filterSeverity() === "critical" ? null : "critical")}
          >
            {counts().critical} Critical
          </button>
        </Show>
        <Show when={counts().warning > 0}>
          <button
            type="button"
            classList={{
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors": true,
              "bg-yellow-500 text-white": filterSeverity() === "warning",
              "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20": filterSeverity() !== "warning",
            }}
            onClick={() => setFilterSeverity(filterSeverity() === "warning" ? null : "warning")}
          >
            {counts().warning} Warning
          </button>
        </Show>
        <Show when={counts().info > 0}>
          <button
            type="button"
            classList={{
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors": true,
              "bg-blue-400 text-white": filterSeverity() === "info",
              "bg-blue-400/10 text-blue-400 hover:bg-blue-400/20": filterSeverity() !== "info",
            }}
            onClick={() => setFilterSeverity(filterSeverity() === "info" ? null : "info")}
          >
            {counts().info} Info
          </button>
        </Show>
      </div>

      <div class="flex items-center gap-3">
        <SeverityBadge severity="critical" count={counts().critical} />
        <SeverityBadge severity="warning" count={counts().warning} />
        <SeverityBadge severity="info" count={counts().info} />
      </div>

      <div class="flex flex-col gap-2">
        <For each={(["critical", "warning", "info"] as Severity[]).filter((s) => grouped()[s].length > 0)}>
          {(severity) => (
            <div class="flex flex-col gap-1.5">
              <For each={grouped()[severity]}>
                {(finding) => (
                  <FindingCard
                    finding={finding}
                    onApplyFix={props.onApplyFix ? () => props.onApplyFix!(finding) : undefined}
                    onFileClick={props.onFileClick ? () => props.onFileClick!(finding.file, finding.line) : undefined}
                  />
                )}
              </For>
            </div>
          )}
        </For>
      </div>

      <Show when={props.findings.length === 0}>
        <div class="flex flex-col items-center gap-2 py-8 text-text-dimmed-base">
          <svg class="h-8 w-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="text-[12px]">No issues found</span>
        </div>
      </Show>
    </div>
  )
}
