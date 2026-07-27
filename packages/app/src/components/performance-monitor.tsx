import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"

type RequestRecord = {
  id: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  timestamp: number
}

type PerfStats = {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalLatencyMs: number
  avgLatencyMs: number
  minLatencyMs: number
  maxLatencyMs: number
}

type PerformanceMonitorProps = {
  getStats?: () => PerfStats
  getHistory?: (limit: number) => RequestRecord[]
  getSavings?: () => { totalSaved: number; breakdown: Array<{ model: string; tokens: number; cost: number }> }
  modelName?: string
  modelSize?: string
  quantization?: string
  memoryUsage?: { ram: number; ramTotal: number; vram?: number; vramTotal?: number }
  cpuUsage?: number
  gpuUsage?: number
}

const fmt = (n: number, d = 0) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(d)
}

const ms = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`
  return `${Math.round(n)}ms`
}

function Sparkline(props: { values: number[]; width?: number; height?: number }) {
  const w = () => props.width ?? 200
  const h = () => props.height ?? 32

  const points = () => {
    const vals = props.values
    if (vals.length < 2) return ""
    const max = Math.max(...vals, 1)
    const min = Math.min(...vals, 0)
    const range = max - min || 1
    const step = w() / (vals.length - 1)
    return vals.map((v, i) => `${i * step},${h() - ((v - min) / range) * (h() - 4) - 2}`).join(" ")
  }

  return (
    <Show when={props.values.length >= 2} fallback={<div class="flex h-8 items-center text-[11px] text-text-weak">No data yet</div>}>
      <svg width={w()} height={h()} class="overflow-visible">
        <polyline points={points()} fill="none" stroke="#EC5B2B" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx={w()} cy={points().split(" ").pop()?.split(",")[1]} r="2.5" fill="#EC5B2B" />
      </svg>
    </Show>
  )
}

function UsageBar(props: { value: number; total: number; label: string; unit?: string }) {
  const pct = () => (props.total > 0 ? (props.value / props.total) * 100 : 0)
  const display = () => {
    const u = props.unit ?? "MB"
    return `${fmt(props.value)} / ${fmt(props.total)} ${u}`
  }

  return (
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-text-weak">{props.label}</span>
        <span class="text-[11px] tabular-nums text-text-strong">{display()}</span>
      </div>
      <div class="h-2 w-full overflow-hidden rounded-full bg-surface-raised-base">
        <div
          classList={{
            "h-full rounded-full transition-all duration-300": true,
            "bg-[#EC5B2B]": pct() > 80,
            "bg-yellow-500": pct() > 60 && pct() <= 80,
            "bg-green-500": pct() <= 60,
          }}
          style={{ width: `${Math.min(pct(), 100)}%` }}
        />
      </div>
    </div>
  )
}

function UtilGauge(props: { value?: number; label: string }) {
  const pct = () => props.value ?? 0
  const r = 20
  const c = 2 * Math.PI * r
  const offset = () => c * (1 - pct() / 100)

  return (
    <div class="flex flex-col items-center gap-1">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" stroke-width="4" class="text-surface-raised-base" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="#EC5B2B"
          stroke-width="4"
          stroke-dasharray={c}
          stroke-dashoffset={offset()}
          stroke-linecap="round"
          transform="rotate(-90 26 26)"
          class="transition-all duration-300"
        />
        <text x="26" y="26" text-anchor="middle" dominant-baseline="central" class="fill-text-strong font-mono text-[11px] font-bold">
          {props.value !== undefined ? `${Math.round(pct())}%` : "—"}
        </text>
      </svg>
      <span class="text-[10px] font-bold uppercase tracking-wider text-text-weak">{props.label}</span>
    </div>
  )
}

function StatCell(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <div class="flex flex-col items-center gap-0.5 rounded-lg bg-surface-raised-base px-3 py-2">
      <span class="text-[10px] font-bold uppercase tracking-wider text-text-weak">{props.label}</span>
      <span
        classList={{
          "font-mono text-[14px] font-bold tabular-nums": true,
          "text-[#EC5B2B]": !!props.highlight,
          "text-text-strong": !props.highlight,
        }}
      >
        {props.value}
      </span>
    </div>
  )
}

export function PerformanceMonitor(props: PerformanceMonitorProps) {
  const [state, setState] = createStore({
    stats: { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0, totalLatencyMs: 0, avgLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0 } as PerfStats,
    latencies: [] as number[],
    savings: 0,
    breakdown: [] as Array<{ model: string; tokens: number; cost: number }>,
  })
  const [collapsed, setCollapsed] = createSignal(false)

  let interval: ReturnType<typeof setInterval> | undefined

  onMount(() => {
    const tick = () => {
      if (props.getStats) {
        const s = props.getStats()
        setState("stats", s)
      }
      if (props.getHistory) {
        const h = props.getHistory(20)
        setState("latencies", h.map((r) => r.latencyMs))
      }
      if (props.getSavings) {
        const sv = props.getSavings()
        setState("savings", sv.totalSaved)
        setState("breakdown", sv.breakdown)
      }
    }
    tick()
    interval = setInterval(tick, 2000)
  })

  onCleanup(() => {
    if (interval !== undefined) clearInterval(interval)
  })

  const totalTokens = () => state.stats.totalInputTokens + state.stats.totalOutputTokens

  return (
    <div
      classList={{
        "flex flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha": true,
        "h-10": collapsed(),
      }}
    >
      <div class="flex items-center justify-between border-b border-border-base px-3 py-1.5">
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-bold uppercase tracking-wider text-[#EC5B2B]">Performance</span>
          <Show when={props.modelName}>
            <span class="rounded bg-surface-raised-base px-1.5 py-0.5 text-[10px] font-medium text-text-strong">{props.modelName}</span>
          </Show>
          <Show when={props.modelSize}>
            <span class="text-[10px] text-text-weak">{props.modelSize}</span>
          </Show>
          <Show when={props.quantization}>
            <span class="rounded bg-[#EC5B2B]/10 px-1.5 py-0.5 text-[10px] text-[#EC5B2B]">{props.quantization}</span>
          </Show>
        </div>
        <button
          type="button"
          class="rounded p-1 text-text-weak transition-colors hover:bg-surface-raised-base hover:text-text-strong"
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <Show when={!collapsed()}>
              <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </Show>
            <Show when={collapsed()}>
              <path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </Show>
          </svg>
        </button>
      </div>

      <Show when={!collapsed()}>
        <div class="flex flex-col gap-3 p-3">
          <div class="grid grid-cols-4 gap-2">
            <StatCell label="Requests" value={fmt(state.stats.totalRequests)} />
            <StatCell label="Avg Latency" value={ms(state.stats.avgLatencyMs)} />
            <StatCell label="Tokens" value={fmt(totalTokens())} />
            <StatCell label="Saved" value={`$${state.savings.toFixed(2)}`} highlight />
          </div>

          <div class="rounded-lg bg-surface-raised-base p-3">
            <div class="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-weak">Response Latency (last 20)</div>
            <Sparkline values={state.latencies} width={280} height={36} />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg bg-surface-raised-base p-3">
              <div class="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-weak">Token Usage</div>
              <div class="flex items-end gap-3">
                <div class="flex flex-col">
                  <span class="text-[10px] text-text-weak">Input</span>
                  <span class="font-mono text-[13px] font-bold tabular-nums text-text-strong">{fmt(state.stats.totalInputTokens)}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-[10px] text-text-weak">Output</span>
                  <span class="font-mono text-[13px] font-bold tabular-nums text-[#EC5B2B]">{fmt(state.stats.totalOutputTokens)}</span>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-center gap-4 rounded-lg bg-surface-raised-base p-3">
              <UtilGauge value={props.cpuUsage} label="CPU" />
              <UtilGauge value={props.gpuUsage} label="GPU" />
            </div>
          </div>

          <Show when={props.memoryUsage}>
            {(mem) => (
              <div class="flex flex-col gap-2 rounded-lg bg-surface-raised-base p-3">
                <UsageBar value={mem().ram} total={mem().ramTotal} label="RAM" />
                <Show when={mem().vram !== undefined && mem().vramTotal !== undefined}>
                  <UsageBar value={mem().vram!} total={mem().vramTotal!} label="VRAM" />
                </Show>
              </div>
            )}
          </Show>

          <Show when={state.savings > 0}>
            <div class="rounded-lg border border-[#EC5B2B]/30 bg-[#EC5B2B]/5 p-3">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold uppercase tracking-wider text-text-weak">Cost Savings</span>
                <span class="font-mono text-[16px] font-bold text-[#EC5B2B]">${state.savings.toFixed(2)}</span>
              </div>
              <div class="mt-1 text-[11px] text-text-weak">vs equivalent cloud API pricing</div>
              <Show when={state.breakdown.length > 0}>
                <div class="mt-2 flex flex-col gap-0.5">
                  <For each={state.breakdown}>
                    {(entry) => (
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-text-weak">{entry.model}</span>
                        <span class="tabular-nums text-text-strong">{fmt(entry.tokens)} tok / ${entry.cost.toFixed(3)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
