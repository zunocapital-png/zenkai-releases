import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Observability Center — panel para VER qué hace la IA internamente en tiempo
// real (idea "Observability Center" del roadmap de arquitectura). Consulta el
// endpoint /v1/health del router local y muestra: qué upstreams están arriba,
// latencia media, estado del circuit breaker, intentos fallidos, todo con
// refresco automático cada 3s.
type Health = {
  upstreams?: Array<{
    name: string
    kind: string
    base: string
    breaker: { estado: string; reabreEn: number; intentosFallidos: number }
    latenciaMediaMs: number
  }>
  timestamp?: number
}

type OllamaTag = {
  name: string
  capabilities?: string[]
  size?: number
  details?: { parameter_size?: string; quantization_level?: string }
}

export function DialogObservability() {
  const dialog = useDialog()
  const [pulse, setPulse] = createSignal(0)

  onMount(() => {
    const t = setInterval(() => setPulse((n) => n + 1), 3000)
    onCleanup(() => clearInterval(t))
  })

  const [health] = createResource(
    pulse,
    async (): Promise<Health> => {
      try {
        const r = await fetch("http://localhost:20128/v1/health", { signal: AbortSignal.timeout(1500) })
        if (!r.ok) return {}
        return (await r.json()) as Health
      } catch {
        return {}
      }
    },
    { initialValue: {} },
  )

  const [ollama] = createResource(
    pulse,
    async (): Promise<OllamaTag[]> => {
      try {
        const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) })
        if (!r.ok) return []
        const d = (await r.json()) as { models?: OllamaTag[] }
        return d.models ?? []
      } catch {
        return []
      }
    },
    { initialValue: [] },
  )

  const colorEstado = (estado: string) =>
    estado === "closed" ? "#22c55e" : estado === "half-open" ? "#f59e0b" : "#ef4444"

  const fmtLatencia = (ms: number) => (ms < 1 ? "—" : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`)
  const fmtBytes = (b?: number) => {
    if (!b) return "—"
    const gb = b / 1024 ** 3
    return `${gb.toFixed(1)} GB`
  }

  return (
    <Dialog
      size="large"
      title="Observability Center"
      class="w-[min(calc(100vw-40px),780px)] h-[min(calc(100vh-40px),640px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 font-mono text-[12.5px] text-v2-text-text-base">
        <div class="flex items-center gap-2 pb-1">
          <span class="text-[11px] uppercase tracking-[0.18em] text-[#EC5B2B]">[ ROUTER · UPSTREAMS ]</span>
          <span class="text-[10.5px] opacity-60 ml-auto">refresh cada 3s</span>
        </div>

        <div class="flex flex-col gap-2">
          <Show
            when={(health().upstreams ?? []).length > 0}
            fallback={<div class="text-[11px] opacity-60 pl-2">Router no responde (localhost:20128).</div>}
          >
            <For each={health().upstreams ?? []}>
              {(u) => (
                <div class="flex items-start gap-3 rounded-md border p-3 border-v2-border-border-muted">
                  <span
                    class="mt-1 inline-block size-2 rounded-full shrink-0"
                    style={{ background: colorEstado(u.breaker.estado), "box-shadow": `0 0 0 3px ${colorEstado(u.breaker.estado)}22` }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-v2-text-text-strong">{u.name}</span>
                      <span class="text-[10.5px] opacity-60">{u.kind}</span>
                      <span
                        class="ml-auto text-[10px] uppercase font-semibold tracking-wider"
                        style={{ color: colorEstado(u.breaker.estado) }}
                      >
                        {u.breaker.estado}
                      </span>
                    </div>
                    <div class="text-[10.5px] opacity-70 mt-1 grid grid-cols-2 md:grid-cols-3 gap-x-4">
                      <span>latencia: <b style={{ color: "#EC5B2B" }}>{fmtLatencia(u.latenciaMediaMs)}</b></span>
                      <span>fallos: {u.breaker.intentosFallidos}</span>
                      <Show when={u.breaker.reabreEn > 0}>
                        <span>reabre en: {Math.round(u.breaker.reabreEn / 1000)}s</span>
                      </Show>
                    </div>
                    <div class="text-[10px] opacity-50 mt-0.5 truncate">{u.base}</div>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="flex items-center gap-2 pt-2">
          <span class="text-[11px] uppercase tracking-[0.18em] text-[#EC5B2B]">[ MODELOS LOCALES ]</span>
          <span class="ml-auto text-[10.5px] opacity-60">{ollama().length} instalados</span>
        </div>
        <div class="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1">
          <Show
            when={ollama().length > 0}
            fallback={<div class="text-[11px] opacity-60 pl-2">Sin modelos instalados o Ollama apagado.</div>}
          >
            <For each={ollama()}>
              {(m) => (
                <div class="flex items-center gap-2 rounded-md px-2 py-1.5 border border-v2-border-border-muted">
                  <span
                    class="inline-block size-1.5 rounded-full shrink-0"
                    style={{
                      background: (m.capabilities ?? []).includes("tools") ? "#22c55e" : "#f59e0b",
                    }}
                  />
                  <span class="font-semibold truncate flex-1">{m.name}</span>
                  <span class="text-[10.5px] opacity-60 shrink-0">{m.details?.parameter_size ?? "—"}</span>
                  <span class="text-[10.5px] opacity-60 shrink-0">{m.details?.quantization_level ?? ""}</span>
                  <span class="text-[10.5px] opacity-60 shrink-0">{fmtBytes(m.size)}</span>
                  <span
                    class="text-[9.5px] uppercase tracking-wider shrink-0"
                    style={{ color: (m.capabilities ?? []).includes("tools") ? "#22c55e" : "#f59e0b" }}
                  >
                    {(m.capabilities ?? []).includes("tools") ? "tools" : "solo chat"}
                  </span>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="flex items-center gap-2 pt-2">
          <span class="text-[11px] uppercase tracking-[0.18em] text-[#EC5B2B]">[ MEMORY LAYERS ]</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          <FilaMemoria titulo="Working" desc="La conversación actual (los últimos N mensajes en contexto)." />
          <FilaMemoria titulo="Session" desc="Toda la sesión abierta. Se comprime al llegar al 88%." />
          <FilaMemoria titulo="User" desc="Preferencias y feedback tuyo (idioma, estilo, correcciones)." />
          <FilaMemoria titulo="Semantic" desc="Knowledge-graph. Hechos aprendidos, buscados por embeddings." />
          <FilaMemoria titulo="Episodic" desc="Qué ocurrió — historial de sesiones anteriores relevantes." />
          <FilaMemoria titulo="Procedural" desc="Cómo hacer cosas — comandos y patrones que ya funcionaron." />
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

function FilaMemoria(props: { titulo: string; desc: string }) {
  return (
    <div class="flex items-start gap-2 rounded-md border border-v2-border-border-muted p-2">
      <span class="text-[#EC5B2B] font-mono">›</span>
      <div>
        <div class="font-semibold text-v2-text-text-strong">{props.titulo}</div>
        <div class="opacity-75 text-[10.5px] leading-snug">{props.desc}</div>
      </div>
    </div>
  )
}
