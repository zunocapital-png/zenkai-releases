import { createResource, createSignal, For, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSDK } from "@/context/sdk"
import { analizarProyecto, loadTwin, saveTwin, type DigitalTwin } from "@/utils/digital-twin"

// Software Digital Twin visual — ficha viva del proyecto activo. La IA usará
// esta info para responder con contexto (idioma del proyecto, framework,
// convenciones) sin que el usuario lo tenga que repetir cada vez.
export function DialogDigitalTwin() {
  const dialog = useDialog()
  const sdk = useSDK()
  const [refrescando, setRefrescando] = createSignal(false)

  const path = () => {
    try {
      return sdk().directory
    } catch {
      return ""
    }
  }

  const [twin, { refetch }] = createResource(path, async (p): Promise<DigitalTwin | undefined> => {
    if (!p) return undefined
    return loadTwin(p) ?? (await analizarProyecto(p))
  })

  onMount(() => {
    // Al abrir el dialog, si el twin es viejo (> 6 horas) lo refrescamos solos.
    const t = twin()
    if (t && Date.now() - t.detectedAt > 6 * 60 * 60 * 1000) {
      void refrescar()
    }
  })

  const refrescar = async () => {
    if (!path()) return
    setRefrescando(true)
    const nuevo = await analizarProyecto(path())
    saveTwin(nuevo)
    await refetch()
    setRefrescando(false)
  }

  return (
    <Dialog
      size="large"
      title="Software Digital Twin · ficha del proyecto"
      class="w-[min(calc(100vw-40px),720px)] h-[min(calc(100vh-40px),620px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-3 overflow-y-auto p-6 text-[13px] font-mono">
        <div class="rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/5 p-3 text-[12px] leading-relaxed">
          <span class="text-[#EC5B2B] font-semibold">Digital Twin</span> — modelo vivo del proyecto activo.
          La IA lo usa para responder con contexto (no tenés que decirle "es Solid, usá pnpm" cada vez).
        </div>

        <Show
          when={twin()}
          fallback={
            <div class="text-[12px] opacity-60 py-4">
              Sin proyecto activo. Abrí uno del sidebar para analizarlo.
            </div>
          }
        >
          {(t) => (
            <>
              <FichaLinea label="Proyecto" valor={t().path} mono />
              <FichaLinea
                label="Analizado"
                valor={new Date(t().detectedAt).toLocaleString()}
              />

              <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                <FichaCard label="Lenguaje" valor={t().lenguaje ?? "—"} color="#EC5B2B" />
                <FichaCard label="Framework" valor={t().framework ?? "—"} color="#22c55e" />
                <FichaCard label="Package manager" valor={t().packageManager ?? "—"} color="#3b82f6" />
                <FichaCard label="Tests" valor={t().tests ?? "—"} color="#a855f7" />
                <FichaCard label="Linter" valor={t().linter ?? "—"} color="#06b6d4" />
                <FichaCard label="Arquitectura" valor={t().arquitectura ?? "—"} color="#f59e0b" />
              </div>

              <Show when={t().deps?.top && t().deps!.top!.length > 0}>
                <div class="mt-2">
                  <div class="text-[10.5px] uppercase tracking-wider opacity-60 mb-1">Top dependencies</div>
                  <div class="flex flex-wrap gap-1">
                    <For each={t().deps!.top ?? []}>
                      {(d) => (
                        <span class="text-[10.5px] px-2 py-0.5 rounded bg-v2-background-bg-layer-01 border border-v2-border-border-muted">
                          {d}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              <div class="text-[10.5px] opacity-60 mt-3 leading-relaxed">
                <b>Nota honesta:</b> hoy la detección es por heurística sobre el path del proyecto y config visible.
                La próxima iteración lee package.json / Cargo.toml / requirements.txt vía IPC para llenar más campos.
              </div>
            </>
          )}
        </Show>

        <div class="flex justify-between items-center pt-3 mt-auto">
          <button
            type="button"
            onClick={() => void refrescar()}
            disabled={refrescando() || !path()}
            class="rounded-md border border-v2-border-border-muted px-3 py-1.5 text-[11.5px] hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-40"
          >
            {refrescando() ? "Analizando…" : "Volver a analizar"}
          </button>
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

function FichaLinea(props: { label: string; valor: string; mono?: boolean }) {
  return (
    <div class="flex items-center gap-3 text-[12px]">
      <span class="opacity-60 uppercase tracking-wider text-[10px] min-w-[90px]">{props.label}</span>
      <span classList={{ "font-mono": !!props.mono, truncate: true }}>{props.valor}</span>
    </div>
  )
}

function FichaCard(props: { label: string; valor: string; color: string }) {
  return (
    <div
      class="rounded-md border p-2.5"
      style={{ "border-color": `${props.color}44`, background: `${props.color}08` }}
    >
      <div class="text-[10px] uppercase tracking-wider" style={{ color: props.color }}>
        {props.label}
      </div>
      <div class="text-[12.5px] font-semibold text-v2-text-text-strong mt-0.5">{props.valor}</div>
    </div>
  )
}
