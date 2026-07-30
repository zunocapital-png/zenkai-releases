import { createMemo, For, Show } from "solid-js"
import { useLayout } from "@/context/layout"
import { usePermission } from "@/context/permission"
import { useSync } from "@/context/sync"

// Banner visible en el compositor cuando el agente pidió permiso y todavía no
// respondiste. Antes el chat quedaba "colgado" sin respuesta porque el diálogo
// nativo no aparecía; con este banner el usuario SIEMPRE ve qué está pidiendo
// y con qué botón aprueba o rechaza. Es el fix real que permite volver a modo
// Manual/Aceptar sin bloqueos.
export function BannerPermisoPendiente() {
  const sync = useSync()
  const permission = usePermission()
  const layout = useLayout()

  const sessionID = createMemo(() => {
    const route = layout.route()
    if (route.type === "session") return route.sessionId
    return undefined
  })

  const pendientes = createMemo(() => {
    const id = sessionID()
    if (!id) return []
    const lista = (sync().data as unknown as { permission?: Record<string, Array<{ id: string; title?: string; description?: string; toolName?: string }>> })
      .permission?.[id]
    return lista ?? []
  })

  const primero = () => pendientes()[0]

  const aprobar = (opcion: "once" | "always") => {
    const p = primero()
    const id = sessionID()
    if (!p || !id) return
    permission.respond({
      sessionID: id,
      permissionID: p.id,
      response: opcion,
    })
  }
  const rechazar = () => {
    const p = primero()
    const id = sessionID()
    if (!p || !id) return
    permission.respond({
      sessionID: id,
      permissionID: p.id,
      response: "reject",
    })
  }

  return (
    <Show when={primero()}>
      {(p) => (
        <div
          class="mx-2 mb-1.5 flex flex-col gap-2 rounded-md border px-3 py-2.5"
          style={{
            "border-color": "rgba(239,68,68,0.45)",
            background: "rgba(239,68,68,0.08)",
          }}
          role="alert"
        >
          <div class="flex items-start gap-2.5">
            <span class="mt-[3px] shrink-0">
              <svg width="12" height="12" viewBox="0 0 12 12" shape-rendering="crispEdges" fill="#ef4444" aria-hidden="true">
                {[
                  [5, 1], [6, 1],
                  [4, 2], [5, 2], [6, 2], [7, 2],
                  [4, 3], [5, 3], [6, 3], [7, 3],
                  [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4],
                  [3, 5], [4, 5], [7, 5], [8, 5],
                  [2, 6], [3, 6], [5, 6], [6, 6], [8, 6], [9, 6],
                  [2, 7], [3, 7], [5, 7], [6, 7], [8, 7], [9, 7],
                  [1, 8], [2, 8], [9, 8], [10, 8],
                  [1, 9], [2, 9], [5, 9], [6, 9], [9, 9], [10, 9],
                  [1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10],
                ].map(([x, y]) => (
                  <rect x={x} y={y} width="1" height="1" />
                ))}
              </svg>
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-[12px] font-semibold text-[#ef4444]">
                La IA está esperando tu permiso
              </div>
              <div class="text-[11.5px] text-v2-text-text-muted mt-0.5">
                <Show when={p().title} fallback={<>Herramienta: {p().toolName ?? "desconocida"}</>}>
                  {p().title}
                </Show>
                <Show when={p().description}>
                  <div class="mt-0.5 opacity-75 line-clamp-2">{p().description}</div>
                </Show>
              </div>
              <Show when={pendientes().length > 1}>
                <div class="mt-1 text-[10.5px] opacity-60">
                  ({pendientes().length - 1} más en cola)
                </div>
              </Show>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={() => aprobar("once")}
              class="flex items-center gap-1.5 rounded-md bg-[#22c55e] px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <path d="m5 12 5 5L20 6" />
              </svg>
              Permitir
            </button>
            <button
              type="button"
              onClick={() => aprobar("always")}
              class="flex items-center gap-1.5 rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-2.5 py-1 text-[11px] font-medium text-[#22c55e] transition-colors hover:bg-[#22c55e]/20"
              title="Aprueba esta acción ahora y todas las iguales en el futuro"
            >
              Permitir siempre
            </button>
            <button
              type="button"
              onClick={rechazar}
              class="flex items-center gap-1.5 rounded-md border border-[#ef4444]/40 bg-[#ef4444]/5 px-2.5 py-1 text-[11px] font-medium text-[#ef4444] transition-colors hover:bg-[#ef4444]/15"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              Rechazar
            </button>
            <For each={pendientes().slice(0, 3)}>
              {(_, i) => (
                <span
                  class="text-[9px] opacity-40 ml-0.5"
                  style={{ display: i() === 0 ? "none" : "inline" }}
                >
                  ●
                </span>
              )}
            </For>
          </div>
        </div>
      )}
    </Show>
  )
}
