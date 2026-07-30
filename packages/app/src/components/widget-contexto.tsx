import { createMemo, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { useLayout } from "@/context/layout"

// Widget mínimo en el compositor que muestra el uso del contexto (tokens usados
// vs límite del modelo). Antes el usuario NO tenía visibilidad y las respuestas
// cortaban de golpe. Se muestra solo cuando el uso pasa 40% para no ser ruido.
export function WidgetContexto() {
  const sync = useSync()
  const layout = useLayout()

  const sessionID = createMemo(() => {
    const route = layout.route()
    if (route.type === "session") return route.sessionId
    return undefined
  })

  const uso = createMemo<{ pct: number; total: number; limite: number } | undefined>(() => {
    const id = sessionID()
    if (!id) return undefined
    const info = sync().session.get(id)
    if (!info) return undefined
    // Tomamos los tokens totales acumulados de la sesión y el límite del modelo.
    // Ambos pueden venir undefined al principio (no hay respuesta todavía).
    const tokens = (info as unknown as { tokens?: { total?: number; limit?: number } }).tokens
    const total = tokens?.total ?? 0
    const limite = tokens?.limit ?? 0
    if (!limite || !total) return undefined
    return { pct: total / limite, total, limite }
  })

  const color = () => {
    const u = uso()
    if (!u) return "#22c55e"
    if (u.pct > 0.85) return "#ef4444"
    if (u.pct > 0.65) return "#f59e0b"
    return "#22c55e"
  }

  const fmt = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return `${n}`
  }

  return (
    <Show when={uso() && uso()!.pct > 0.4 ? uso() : undefined}>
      {(u) => (
        <div
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-mono transition-colors"
          style={{
            background: `${color()}15`,
            border: `1px solid ${color()}40`,
            color: color(),
          }}
          title={`Contexto usado: ${u().total.toLocaleString()} / ${u().limite.toLocaleString()} tokens`}
        >
          <span class="inline-block size-[6px] rounded-full" style={{ background: color() }} />
          <span class="font-semibold">{Math.round(u().pct * 100)}%</span>
          <span class="opacity-75">
            {fmt(u().total)}/{fmt(u().limite)}
          </span>
        </div>
      )}
    </Show>
  )
}
