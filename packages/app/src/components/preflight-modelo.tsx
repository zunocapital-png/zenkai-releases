import { createResource, createSignal, onCleanup, Show } from "solid-js"

// Banner de pre-flight sobre el compositor. Detecta si el modelo local seleccionado
// (o el que el router va a elegir en modo "auto") soporta la capability 'tools'.
// Si NO la soporta, muestra un banner amarillo explicando el problema y qué hacer.
// Segunda capa del fail-safe: la primera vive en el router (nunca elige un modelo
// sin tools), esta le da visibilidad al usuario cuando algo puede salir mal.
export function PreflightModelo() {
  const [pulse, setPulse] = createSignal(0)
  const t = setInterval(() => setPulse((n) => n + 1), 10_000)
  onCleanup(() => clearInterval(t))
  // "Descartado" recuerda el ESTADO en el que se descartó, no un boolean.
  // Cuando el estado cambia, el banner reaparece: la promesa del title
  // ("vuelve a aparecer si sigue el problema") pasa a ser real.
  const [descartadoEstado, setDescartadoEstado] = createSignal<string | undefined>(undefined)

  const [diag] = createResource(
    pulse,
    async () => {
      try {
        const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) })
        if (!res.ok) return { estado: "sin_servicio" as const }
        const data = (await res.json()) as {
          models?: Array<{ name: string; capabilities?: string[] }>
        }
        const total = (data.models ?? []).length
        const conTools = (data.models ?? []).filter(
          (m) => Array.isArray(m?.capabilities) && m.capabilities.includes("tools"),
        )
        if (total === 0) return { estado: "sin_modelos" as const }
        if (conTools.length === 0) return { estado: "sin_tools" as const, sugerido: "qwen3:14b" }
        return { estado: "ok" as const }
      } catch {
        return { estado: "sin_servicio" as const }
      }
    },
    { initialValue: { estado: "ok" as const } },
  )

  const debeMostrar = () => diag().estado !== "ok" && descartadoEstado() !== diag().estado

  return (
    <Show when={debeMostrar()}>
      <div
        class="mx-2 mb-1.5 flex items-start gap-2.5 rounded-md border px-3 py-2 text-[11.5px]"
        style={{
          "border-color":
            diag().estado === "sin_tools" ? "rgba(245,158,11,0.4)" : "rgba(239,68,68,0.4)",
          background:
            diag().estado === "sin_tools" ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)",
          color: diag().estado === "sin_tools" ? "#f59e0b" : "#ef4444",
        }}
        role="alert"
      >
        <span class="mt-[2px] shrink-0">
          <svg width="12" height="12" viewBox="0 0 12 12" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">
            {/* Triángulo de advertencia pixel */}
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
          <div class="font-semibold">
            {diag().estado === "sin_servicio" && "El servicio de IA local no responde"}
            {diag().estado === "sin_modelos" && "No hay modelos instalados"}
            {diag().estado === "sin_tools" && "El modelo activo no soporta el agente"}
          </div>
          <div class="opacity-85 mt-0.5 text-v2-text-text-muted">
            {diag().estado === "sin_servicio" &&
              "Se reintentará automáticamente en segundos. Si no arranca, revisá la sección Diagnóstico."}
            {diag().estado === "sin_modelos" &&
              "Descargá qwen3:14b (recomendado) desde Ajustes → Modelos, o conectá un proveedor de nube."}
            {diag().estado === "sin_tools" &&
              "Ninguno de tus modelos soporta 'tools'. Descargá qwen3:14b o qwen2.5-coder:7b — el agente los necesita para responder."}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDescartadoEstado(diag().estado)}
          class="shrink-0 rounded p-1 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Descartar aviso"
          title="Descartar (vuelve a aparecer si el problema cambia)"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </Show>
  )
}
