import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Evolution Engine (idea del Tomo III de la charla AIOS). Analiza el estado del
// router en vivo, detecta patrones (upstreams con muchos fallos, latencia alta,
// modelos sin tools) y GENERA propuestas de mejora concretas para el usuario.
// No modifica nada por sí solo — muestra recomendaciones accionables. Es la
// semilla de un motor evolutivo real.
type Sugerencia = {
  severidad: "alta" | "media" | "baja"
  titulo: string
  detalle: string
  accion: string
  color: string
}

type Health = {
  upstreams?: Array<{
    name: string
    breaker: { estado: string; reabreEn: number; intentosFallidos: number }
    latenciaMediaMs: number
  }>
}

type OllamaTag = {
  name: string
  capabilities?: string[]
}

async function fetchHealth(): Promise<Health> {
  try {
    const r = await fetch("http://localhost:20128/v1/health", { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return {}
    return (await r.json()) as Health
  } catch {
    return {}
  }
}

async function fetchModelos(): Promise<OllamaTag[]> {
  try {
    const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) })
    if (!r.ok) return []
    return ((await r.json()) as { models?: OllamaTag[] }).models ?? []
  } catch {
    return []
  }
}

function generarSugerencias(health: Health, modelos: OllamaTag[]): Sugerencia[] {
  const sugs: Sugerencia[] = []

  // 1. Modelos sin tools instalados que ocupan disco.
  const sinTools = modelos.filter((m) => !(m.capabilities ?? []).includes("tools"))
  if (sinTools.length > 0 && modelos.length > sinTools.length) {
    sugs.push({
      severidad: "baja",
      titulo: `${sinTools.length} modelo(s) sin capability 'tools'`,
      detalle: `${sinTools.map((m) => m.name).join(", ")} no soportan tool-calls — ocupan disco sin poder ser usados por el agente.`,
      accion: "Borralos con 'ollama rm <nombre>' o dejalos solo si los usás para chat directo.",
      color: "#f59e0b",
    })
  }

  // 2. Upstreams con breaker abierto o muchos fallos.
  const rotos = (health.upstreams ?? []).filter(
    (u) => u.breaker.estado === "open" || u.breaker.intentosFallidos >= 3,
  )
  for (const u of rotos) {
    sugs.push({
      severidad: "alta",
      titulo: `Upstream '${u.name}' con ${u.breaker.intentosFallidos} fallos`,
      detalle: `Estado: ${u.breaker.estado}. Está siendo salteado por el router — no aporta al failover.`,
      accion: u.name === "ollama" ? "Verificá que Ollama esté corriendo." : "Chequeá la API key o el endpoint en Ajustes → Proveedores.",
      color: "#ef4444",
    })
  }

  // 3. Latencia alta (>3s) sugiere elegir modelo más chico.
  const lentos = (health.upstreams ?? []).filter((u) => u.latenciaMediaMs > 3000)
  for (const u of lentos) {
    sugs.push({
      severidad: "media",
      titulo: `Upstream '${u.name}' lento`,
      detalle: `Latencia media ${Math.round(u.latenciaMediaMs)}ms — más de 3 segundos para el primer byte.`,
      accion: "Si es local, probá un modelo más chico. Si es nube, revisá el plan o cambiá de proveedor.",
      color: "#f59e0b",
    })
  }

  // 4. Modelos con tools recomendados que faltan.
  const conTools = modelos.filter((m) => (m.capabilities ?? []).includes("tools"))
  if (conTools.length === 0 && modelos.length > 0) {
    sugs.push({
      severidad: "alta",
      titulo: "Sin ningún modelo local con tools",
      detalle: "Ninguno de los modelos instalados soporta el agente. El chat local no puede funcionar.",
      accion: "Descargá qwen3:14b o qwen2.5-coder:7b desde Ajustes → Modelos.",
      color: "#ef4444",
    })
  }
  if (conTools.length > 0 && !conTools.some((m) => m.name.startsWith("qwen3"))) {
    sugs.push({
      severidad: "baja",
      titulo: "Sin qwen3 instalado",
      detalle: "qwen3 es la generación más nueva de Qwen (soporta thinking). Podría dar mejores respuestas.",
      accion: "Ejecutá 'ollama pull qwen3:8b' (5GB) o qwen3:14b (9GB) según la RAM de tu equipo.",
      color: "#94a3b8",
    })
  }

  // 5. Si todo está bien, lo confirmamos.
  if (sugs.length === 0) {
    sugs.push({
      severidad: "baja",
      titulo: "Todo funciona bien",
      detalle: "No detectamos patrones a mejorar en este momento.",
      accion: "Volvé cuando la app haya tenido más uso o algo empiece a fallar.",
      color: "#22c55e",
    })
  }

  return sugs
}

export function DialogEvolution() {
  const dialog = useDialog()
  const [pulse, setPulse] = createSignal(0)

  onMount(() => {
    const t = setInterval(() => setPulse((n) => n + 1), 10_000)
    onCleanup(() => clearInterval(t))
  })

  const [analisis] = createResource(pulse, async () => {
    const [h, m] = await Promise.all([fetchHealth(), fetchModelos()])
    return generarSugerencias(h, m)
  }, { initialValue: [] })

  return (
    <Dialog
      size="large"
      title="Evolution Engine · Propuestas de mejora"
      class="w-[min(calc(100vw-40px),720px)] h-[min(calc(100vh-40px),600px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-3 overflow-y-auto p-6 text-[13px] text-v2-text-text-base font-mono">
        <div class="rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/5 p-3">
          <div class="text-[12px] leading-relaxed">
            <span class="text-[#EC5B2B] font-semibold">Evolution Engine</span> — analiza el estado real del sistema y propone mejoras. NO modifica nada — sugiere.
          </div>
          <div class="text-[10.5px] opacity-60 mt-1">Refresh cada 10s</div>
        </div>

        <Show
          when={analisis().length > 0}
          fallback={<div class="opacity-60 text-[11px]">Analizando…</div>}
        >
          <For each={analisis()}>
            {(s) => (
              <div class="rounded-md border p-3" style={{ "border-color": `${s.color}44` }}>
                <div class="flex items-center gap-2 mb-1">
                  <span
                    class="text-[9.5px] uppercase tracking-wider font-semibold px-1.5 py-[1px] rounded"
                    style={{ background: `${s.color}22`, color: s.color }}
                  >
                    {s.severidad}
                  </span>
                  <span class="text-[12.5px] font-semibold text-v2-text-text-strong">{s.titulo}</span>
                </div>
                <div class="text-[11.5px] opacity-85 mt-1">{s.detalle}</div>
                <div class="text-[11px] opacity-70 mt-1.5">
                  <span class="text-[#EC5B2B]">›</span> {s.accion}
                </div>
              </div>
            )}
          </For>
        </Show>

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
