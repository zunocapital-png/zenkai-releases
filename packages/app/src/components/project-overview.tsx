import { Component, createSignal, createMemo, For, Show } from "solid-js"

interface FileTypeStat {
  extension: string
  count: number
  color: string
}

interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
}

interface DependencyInfo {
  total: number
  outdated: number
}

interface ProjectOverviewProps {
  name: string
  path: string
  language?: string
  framework?: string
  fileStats: FileTypeStat[]
  dependencies?: DependencyInfo
  testCoverage?: number
  codeQualityScore?: number
  recentCommits?: GitCommit[]
  onRunTests?: () => void
  onBuild?: () => void
  onLint?: () => void
  onFormat?: () => void
}

function PieChart(props: { stats: FileTypeStat[]; size?: number }) {
  const size = () => props.size ?? 120
  const r = () => size() / 2 - 4
  const cx = () => size() / 2
  const cy = () => size() / 2

  const total = createMemo(() => props.stats.reduce((sum, s) => sum + s.count, 0))

  const slices = createMemo(() => {
    const result: Array<{ path: string; color: string; ext: string; count: number; pct: number }> = []
    let cumulative = 0

    for (const stat of props.stats) {
      const pct = total() > 0 ? stat.count / total() : 0
      const startAngle = cumulative * 2 * Math.PI - Math.PI / 2
      cumulative += pct
      const endAngle = cumulative * 2 * Math.PI - Math.PI / 2

      if (pct === 0) continue

      const largeArc = pct > 0.5 ? 1 : 0
      const x1 = cx() + r() * Math.cos(startAngle)
      const y1 = cy() + r() * Math.sin(startAngle)
      const x2 = cx() + r() * Math.cos(endAngle)
      const y2 = cy() + r() * Math.sin(endAngle)

      const path =
        props.stats.length === 1 && pct >= 1
          ? `M ${cx()} ${cy() - r()} A ${r()} ${r()} 0 1 1 ${cx() - 0.01} ${cy() - r()} Z`
          : `M ${cx()} ${cy()} L ${x1} ${y1} A ${r()} ${r()} 0 ${largeArc} 1 ${x2} ${y2} Z`

      result.push({ path, color: stat.color, ext: stat.extension, count: stat.count, pct })
    }
    return result
  })

  return (
    <div class="flex items-center gap-4">
      <svg
        width={size()}
        height={size()}
        viewBox={`0 0 ${size()} ${size()}`}
        class="shrink-0"
      >
        <Show
          when={slices().length > 0}
          fallback={
            <circle cx={cx()} cy={cy()} r={r()} fill="none" stroke="currentColor" stroke-width="1" opacity="0.15" />
          }
        >
          <For each={slices()}>
            {(slice) => (
              <path d={slice.path} fill={slice.color} stroke="var(--surface-primary-base, #1a1a2e)" stroke-width="1.5" />
            )}
          </For>
        </Show>
        <text x={cx()} y={cy()} text-anchor="middle" dominant-baseline="central" class="fill-text-base text-[13px] font-bold">
          {total()}
        </text>
      </svg>
      <div class="flex flex-col gap-1">
        <For each={props.stats.slice(0, 6)}>
          {(stat) => (
            <div class="flex items-center gap-1.5">
              <div class="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: stat.color }} />
              <span class="text-[11px] text-text-base">{stat.extension}</span>
              <span class="text-[10px] text-text-dimmed-base">{stat.count}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function QualityGauge(props: { score: number; size?: number }) {
  const size = () => props.size ?? 80
  const r = () => size() / 2 - 6
  const cx = () => size() / 2
  const cy = () => size() / 2
  const circumference = () => 2 * Math.PI * r()
  const progress = () => Math.min(100, Math.max(0, props.score))
  const offset = () => circumference() - (progress() / 100) * circumference() * 0.75
  const rotation = () => 135

  const scoreColor = () => {
    if (progress() >= 80) return "#22c55e"
    if (progress() >= 60) return "#eab308"
    if (progress() >= 40) return "#EC5B2B"
    return "#ef4444"
  }

  return (
    <div class="flex flex-col items-center gap-1">
      <svg width={size()} height={size()} viewBox={`0 0 ${size()} ${size()}`}>
        <circle
          cx={cx()}
          cy={cy()}
          r={r()}
          fill="none"
          stroke="currentColor"
          stroke-width="4"
          opacity="0.1"
          stroke-dasharray={`${circumference() * 0.75} ${circumference() * 0.25}`}
          transform={`rotate(${rotation()} ${cx()} ${cy()})`}
        />
        <circle
          cx={cx()}
          cy={cy()}
          r={r()}
          fill="none"
          stroke={scoreColor()}
          stroke-width="4"
          stroke-linecap="round"
          stroke-dasharray={`${circumference() * 0.75} ${circumference() * 0.25}`}
          stroke-dashoffset={offset()}
          transform={`rotate(${rotation()} ${cx()} ${cy()})`}
          class="transition-all duration-700"
        />
        <text x={cx()} y={cy()} text-anchor="middle" dominant-baseline="central" class="fill-text-base text-[14px] font-bold">
          {props.score}
        </text>
      </svg>
      <span class="text-[10px] font-medium text-text-dimmed-base">Quality</span>
    </div>
  )
}

function QuickActionButton(props: { label: string; icon: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-md border border-border-base px-2.5 py-1.5 text-[11px] font-medium text-text-base transition-colors hover:border-[#EC5B2B] hover:text-[#EC5B2B] disabled:opacity-40 disabled:hover:border-border-base disabled:hover:text-text-base"
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <span class="text-[13px]">{props.icon}</span>
      {props.label}
    </button>
  )
}

export const ProjectOverview: Component<ProjectOverviewProps> = (props) => {
  return (
    <div class="flex flex-col gap-4 rounded-xl border border-border-base bg-surface-primary-base p-4">
      <div class="flex items-start justify-between">
        <div class="flex flex-col gap-1">
          <h2 class="text-[14px] font-bold text-text-base">{props.name}</h2>
          <p class="max-w-[280px] truncate text-[11px] text-text-dimmed-base">{props.path}</p>
          <div class="flex items-center gap-2 pt-0.5">
            <Show when={props.language}>
              <span class="rounded bg-[#EC5B2B]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#EC5B2B]">
                {props.language}
              </span>
            </Show>
            <Show when={props.framework}>
              <span class="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                {props.framework}
              </span>
            </Show>
          </div>
        </div>
        <Show when={props.codeQualityScore !== undefined}>
          <QualityGauge score={props.codeQualityScore!} />
        </Show>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-2">
          <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
            Files by Type
          </span>
          <PieChart stats={props.fileStats} />
        </div>

        <div class="flex flex-col gap-3">
          <Show when={props.dependencies}>
            <div class="flex flex-col gap-1">
              <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
                Dependencies
              </span>
              <div class="flex items-baseline gap-2">
                <span class="text-[18px] font-bold text-text-base">
                  {props.dependencies!.total}
                </span>
                <Show when={props.dependencies!.outdated > 0}>
                  <span class="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-500">
                    {props.dependencies!.outdated} outdated
                  </span>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={props.testCoverage !== undefined}>
            <div class="flex flex-col gap-1">
              <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
                Test Coverage
              </span>
              <div class="flex items-center gap-2">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised-base">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    classList={{
                      "bg-green-500": props.testCoverage! >= 80,
                      "bg-yellow-500": props.testCoverage! >= 50 && props.testCoverage! < 80,
                      "bg-red-500": props.testCoverage! < 50,
                    }}
                    style={{ width: `${props.testCoverage}%` }}
                  />
                </div>
                <span class="text-[12px] font-bold text-text-base">{props.testCoverage}%</span>
              </div>
            </div>
          </Show>
        </div>
      </div>

      <Show when={props.recentCommits && props.recentCommits.length > 0}>
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
            Recent Commits
          </span>
          <div class="flex flex-col gap-0.5">
            <For each={props.recentCommits!.slice(0, 5)}>
              {(commit) => (
                <div class="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-surface-raised-base/50">
                  <span class="shrink-0 font-mono text-[10px] text-[#EC5B2B]">
                    {commit.hash.slice(0, 7)}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-[11px] text-text-base">
                    {commit.message}
                  </span>
                  <span class="shrink-0 text-[10px] text-text-dimmed-base">
                    {commit.date}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-medium uppercase tracking-wider text-text-dimmed-base">
          Quick Actions
        </span>
        <div class="flex flex-wrap gap-1.5">
          <QuickActionButton label="Run Tests" icon="▶" onClick={props.onRunTests} />
          <QuickActionButton label="Build" icon="⚙" onClick={props.onBuild} />
          <QuickActionButton label="Lint" icon="✓" onClick={props.onLint} />
          <QuickActionButton label="Format" icon="≡" onClick={props.onFormat} />
        </div>
      </div>
    </div>
  )
}
