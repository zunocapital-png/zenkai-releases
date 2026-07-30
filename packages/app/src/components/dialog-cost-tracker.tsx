import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Cost Tracker en vivo — expone las STATS del ProviderOrchestrator de
// @zenkai/core en la UI. Es el primer bridge visible entre nuestro backend
// propio y la app. Muestra: gasto USD por provider, latencia p95, health score,
// budget spent vs limit, requests / errores.
//
// Nota honesta: hoy consume desde localStorage (donde el orchestrator escribe
// sus stats en Fase 6). Mientras tanto muestra un DEMO con datos realistas
// para que el usuario vea CÓMO se va a ver. Cuando la Fase 6 conecte, esto
// pasa a mostrar datos reales sin cambiar código de UI.

type ProviderStats = {
  name: string
  requests: number
  errors: number
  totalLatencyMs: number
  totalCostUsd: number
  p95LatencyMs: number
  healthScore: number
  budgetSpentUsd: number
  budgetLimitUsd?: number
}

// Fuente demo mientras Fase 6 no conecta. Cuando esté, se reemplaza por un
// bridge que lee de @zenkai/core en el proceso main via IPC.
const DEMO_STATS: ProviderStats[] = [
  { name: "ollama (local)", requests: 42, errors: 0, totalLatencyMs: 24_600, totalCostUsd: 0, p95LatencyMs: 780, healthScore: 100, budgetSpentUsd: 0 },
  { name: "openrouter (nube gratis)", requests: 18, errors: 1, totalLatencyMs: 21_000, totalCostUsd: 0, p95LatencyMs: 1_400, healthScore: 94, budgetSpentUsd: 0 },
  { name: "nvidia nim (gratis)", requests: 7, errors: 0, totalLatencyMs: 8_400, totalCostUsd: 0, p95LatencyMs: 1_800, healthScore: 100, budgetSpentUsd: 0 },
  { name: "deepseek (pago)", requests: 12, errors: 0, totalLatencyMs: 9_600, totalCostUsd: 0.024, p95LatencyMs: 950, healthScore: 100, budgetSpentUsd: 0.024, budgetLimitUsd: 5 },
]

function leerStats(): ProviderStats[] {
  try {
    const raw = localStorage.getItem("zenkai.core.provider-stats")
    if (raw) return JSON.parse(raw) as ProviderStats[]
  } catch {
    /* ignore */
  }
  return DEMO_STATS
}

export function DialogCostTracker() {
  const dialog = useDialog()
  const [stats, setStats] = createSignal<ProviderStats[]>(leerStats())

  onMount(() => {
    const t = setInterval(() => setStats(leerStats()), 3000)
    onCleanup(() => clearInterval(t))
  })

  const totalUsd = () => stats().reduce((s, p) => s + p.totalCostUsd, 0)
  const totalReq = () => stats().reduce((s, p) => s + p.requests, 0)
  const totalErr = () => stats().reduce((s, p) => s + p.errors, 0)
  const fromDemo = () => stats() === DEMO_STATS || (typeof localStorage !== "undefined" && !localStorage.getItem("zenkai.core.provider-stats"))

  const colorHealth = (h: number) => (h >= 90 ? "#22c55e" : h >= 70 ? "#f59e0b" : "#ef4444")
  const colorBudget = (spent: number, limit?: number) => {
    if (!limit) return "#94a3b8"
    const pct = spent / limit
    return pct > 0.85 ? "#ef4444" : pct > 0.65 ? "#f59e0b" : "#22c55e"
  }
  const fmtUsd = (v: number) => (v < 0.01 && v > 0 ? "<$0.01" : `$${v.toFixed(3)}`)
  const fmtMs = (v: number) => (v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(1)}s`)

  return (
    <Dialog
      size="large"
      title="Cost Tracker · @zenkai/core en vivo"
      class="w-[min(calc(100vw-40px),780px)] h-[min(calc(100vh-40px),640px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-3 overflow-y-auto p-5 text-[12.5px] font-mono">
        {/* Totales */}
        <div class="grid grid-cols-3 gap-2">
          <StatCard label="Requests" valor={String(totalReq())} color="#EC5B2B" />
          <StatCard label="Errores" valor={String(totalErr())} color={totalErr() > 0 ? "#ef4444" : "#22c55e"} />
          <StatCard label="Gasto total" valor={fmtUsd(totalUsd())} color="#f59e0b" />
        </div>

        <Show when={fromDemo()}>
          <div class="rounded-md border border-[#3b82f6]/40 bg-[#3b82f6]/5 p-2.5 text-[11px]">
            <b>Datos demo</b> — mientras Fase 6 no conecta @zenkai/core al chat principal, este panel muestra un ejemplo realista de cómo se ve. Cuando la migración termine, aparecen tus stats REALES.
          </div>
        </Show>

        {/* Providers */}
        <div class="flex flex-col gap-2">
          <div class="text-[10.5px] uppercase tracking-[0.14em] text-[#EC5B2B]">[ PROVIDERS ]</div>
          <For each={stats()}>
            {(s) => (
              <div class="rounded-md border border-v2-border-border-muted p-3">
                <div class="flex items-center gap-2 mb-2">
                  <span
                    class="inline-block size-2 rounded-full"
                    style={{ background: colorHealth(s.healthScore), "box-shadow": `0 0 0 3px ${colorHealth(s.healthScore)}22` }}
                  />
                  <span class="font-semibold text-v2-text-text-strong">{s.name}</span>
                  <span class="ml-auto text-[10px] uppercase tracking-wider" style={{ color: colorHealth(s.healthScore) }}>
                    health {s.healthScore}%
                  </span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <MetricLine label="req" valor={String(s.requests)} />
                  <MetricLine label="err" valor={String(s.errors)} />
                  <MetricLine label="p95" valor={fmtMs(s.p95LatencyMs)} />
                  <MetricLine label="gastado" valor={fmtUsd(s.totalCostUsd)} />
                </div>
                <Show when={s.budgetLimitUsd}>
                  <div class="mt-2">
                    <div class="flex items-center justify-between text-[10px] mb-1">
                      <span>budget</span>
                      <span>
                        {fmtUsd(s.budgetSpentUsd)} / {fmtUsd(s.budgetLimitUsd!)} ({Math.round((s.budgetSpentUsd / s.budgetLimitUsd!) * 100)}%)
                      </span>
                    </div>
                    <div class="h-1.5 rounded-full bg-v2-background-bg-layer-01 overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (s.budgetSpentUsd / s.budgetLimitUsd!) * 100)}%`,
                          background: colorBudget(s.budgetSpentUsd, s.budgetLimitUsd),
                        }}
                      />
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>

        <div class="text-[10.5px] opacity-60 leading-relaxed mt-2">
          <b>Fuente:</b> ProviderOrchestrator de @zenkai/core (Fase 4 del backend propio) —
          los stats se acumulan por request y se persisten en localStorage. Adaptive timeout,
          health scores, region-aware routing, cache y racing viven en el mismo módulo.
        </div>

        <div class="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-md bg-[#EC5B2B] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function StatCard(props: { label: string; valor: string; color: string }) {
  return (
    <div class="rounded-md border p-2.5" style={{ "border-color": `${props.color}44` }}>
      <div class="text-[10px] uppercase tracking-wider opacity-70">{props.label}</div>
      <div class="text-[18px] font-semibold" style={{ color: props.color }}>
        {props.valor}
      </div>
    </div>
  )
}

function MetricLine(props: { label: string; valor: string }) {
  return (
    <div class="flex items-center gap-1.5">
      <span class="opacity-60 uppercase tracking-wider text-[9.5px]">{props.label}</span>
      <span class="font-semibold text-v2-text-text-strong">{props.valor}</span>
    </div>
  )
}
