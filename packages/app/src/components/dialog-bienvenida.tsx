import { createSignal, onMount, onCleanup, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform } from "@/context/platform"
import { useQueryClient } from "@tanstack/solid-query"
import { ScannerPC } from "@/components/scanner-pc"
import {
  MODELOS_RECOMENDADOS,
  type Descarga,
  type ModeloLocal,
  listarModelosOllama,
  ollamaVivo,
  estaInstalado,
  descargarModeloOllama,
  presupuestoGB,
  modeloRecomendado,
} from "@/utils/ollama-local"

// Onboarding de primer arranque: da la bienvenida y guía a instalar un modelo local
// (gratis, por Ollama) o a conectar una API de nube. Se muestra una sola vez.
export function DialogBienvenida() {
  const dialog = useDialog()
  const serverSDK = useServerSDK()
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const [ollamaOk, setOllamaOk] = createSignal<boolean | undefined>(undefined)
  const [instalados, setInstalados] = createSignal<string[]>([])
  const [descargas, setDescargas] = createSignal<Record<string, Descarga>>({})
  // Escaneo de la PC → modelo recomendado que entra en tu equipo (onboarding que decide por vos).
  const [ramGB, setRamGB] = createSignal<number | undefined>(undefined)
  const [recomendado, setRecomendado] = createSignal<ModeloLocal | undefined>(undefined)
  // Un AbortController por descarga; al cerrar el diálogo abortamos las que sigan vivas
  // (antes el stream seguía corriendo y escribía sobre un componente desmontado).
  const aborters: Record<string, AbortController> = {}
  onCleanup(() => Object.values(aborters).forEach((a) => a.abort()))

  async function refrescar() {
    const vivo = await ollamaVivo()
    setOllamaOk(vivo)
    if (vivo) setInstalados(await listarModelosOllama())
  }

  onMount(() => {
    // Damos un margen a que Ollama termine de prenderse/instalarse tras el setup.
    void refrescar()
    const t = setTimeout(() => void refrescar(), 4000)
    onCleanup(() => clearTimeout(t))
    // Analizamos el hardware y elegimos el mejor modelo que entra en tu PC.
    void platform
      .analyzeHardware?.()
      .then((hw) => {
        setRamGB(hw.ramGB)
        setRecomendado(modeloRecomendado(presupuestoGB(hw.ramGB, hw.vramGB, hw.freeRamGB)))
      })
      .catch(() => {})
  })

  const instalado = (id: string) => estaInstalado(id, instalados())

  async function sincronizarConZenkai() {
    try {
      await serverSDK().client.global.dispose()
    } catch {
      /* si falla, aparece al reiniciar la app */
    }
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === serverSDK().scope && q.queryKey[2] === "providers",
    })
  }

  async function descargar(id: string) {
    const ac = new AbortController()
    aborters[id] = ac
    try {
      await descargarModeloOllama(id, (d) => setDescargas((prev) => ({ ...prev, [id]: d })), ac.signal)
      await refrescar()
      void sincronizarConZenkai()
    } catch (e) {
      if (ac.signal.aborted) return // cancelado al cerrar: no tocar estado
      setDescargas((prev) => ({
        ...prev,
        [id]: { pct: -1, estado: "Error", error: e instanceof Error ? e.message : "No se pudo descargar." },
      }))
    } finally {
      delete aborters[id]
    }
  }

  function conectarApi() {
    void import("@/components/dialog-connect-provider").then((x) => dialog.show(() => <x.DialogConnectProvider />))
  }

  // Fase del onboarding: primero corre el scanner pixelado, después muestra la
  // guía de setup. El scanner es visual: el usuario "ve" que la app conoce su
  // PC antes de recomendar un modelo.
  const [faseOnboarding, setFaseOnboarding] = createSignal<"scan" | "setup">("scan")

  return (
    <Dialog
      size="large"
      title="Bienvenido a ZENKAI"
      class="w-[min(calc(100vw-40px),640px)] h-[min(calc(100vh-40px),600px)] min-h-0 overflow-hidden"
    >
      <Show
        when={faseOnboarding() === "setup"}
        fallback={
          <ScannerPC
            onResultado={(r) => {
              setRamGB(r.ramGB)
              setRecomendado(r.modeloSugerido)
            }}
            onCerrar={() => setFaseOnboarding("setup")}
          />
        }
      >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-14-regular text-text-base">
          ZENKAI programa de dos formas, y podés usar las dos:
        </p>
        <ul class="flex flex-col gap-1.5 pl-1">
          <li class="text-13-regular text-text-muted flex items-start gap-2">
            <span class="mt-0.5 text-[#EC5B2B] font-mono">›</span>
            <span><span class="text-text-strong">Local (gratis):</span> modelos que corren en tu PC. Sin
            internet, sin costo. Elegí uno abajo y se descarga.</span>
          </li>
          <li class="text-13-regular text-text-muted flex items-start gap-2">
            <span class="mt-0.5 text-[#EC5B2B] font-mono">›</span>
            <span><span class="text-text-strong">Nube (API):</span> modelos grandes con tu propia clave (varios con tier gratis).
            Más potentes, pagás por uso al proveedor.</span>
          </li>
        </ul>

        {/* Recomendado según tu PC (escaneo automático) */}
        <Show when={recomendado()}>
          {(m) => (
            <div class="flex flex-col gap-2 rounded-lg border border-[#EC5B2B]/40 bg-[#EC5B2B]/5 p-4">
              <div class="flex items-center gap-2">
                <span class="text-14-medium font-mono text-[#EC5B2B]">[✓]</span>
                <span class="text-14-medium text-text-strong">Recomendado para tu PC</span>
                <Show when={ramGB()}>
                  <span class="text-11-regular text-text-muted">· {ramGB()} GB RAM detectados</span>
                </Show>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="text-13-medium text-text-strong">{m().nombre}</span>
                  <span class="text-12-regular text-text-muted">{m().nota} · {m().tam}</span>
                </div>
                <Show
                  when={!instalado(m().id)}
                  fallback={<span class="shrink-0 text-13-medium text-[#22c55e]">Instalado</span>}
                >
                  <button
                    type="button"
                    disabled={!!descargas()[m().id] && descargas()[m().id]!.pct >= 0 && descargas()[m().id]!.pct < 100}
                    onClick={() => void descargar(m().id)}
                    class="shrink-0 rounded-lg bg-[#EC5B2B] px-4 py-2 text-13-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {descargas()[m().id] ? (descargas()[m().id]!.pct === -1 ? "Reintentar" : "Instalando…") : "Instalar ahora"}
                  </button>
                </Show>
              </div>
              <Show when={descargas()[m().id] && !instalado(m().id) && descargas()[m().id]!.pct >= 0}>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-border-base">
                  <div class="h-full rounded-full bg-[#EC5B2B] transition-all" style={{ width: `${Math.max(2, descargas()[m().id]!.pct)}%` }} />
                </div>
              </Show>
            </div>
          )}
        </Show>

        {/* Modelos locales */}
        <div class="flex flex-col gap-2.5 rounded-lg border border-border-base bg-surface-raised p-4">
          <div class="flex items-center gap-2.5">
            <span class="text-14-medium font-mono text-[#EC5B2B]">[▼]</span>
            <span class="text-14-medium text-text-strong">Instalar un modelo local (recomendado para empezar)</span>
          </div>
          <Show
            when={ollamaOk() !== false}
            fallback={
              <p class="text-13-regular text-yellow-400">
                Ollama todavía se está preparando. Esperá unos segundos y reabrí esta ventana desde Diagnóstico.
              </p>
            }
          >
            <div class="flex flex-col gap-2">
              <For each={MODELOS_RECOMENDADOS}>
                {(m) => {
                  const d = () => descargas()[m.id]
                  return (
                    <div class="flex flex-col gap-1.5 rounded-md border border-border-base bg-surface-base p-3">
                      <div class="flex items-center gap-3">
                        <div class="flex min-w-0 flex-1 flex-col">
                          <span class="text-13-medium text-text-strong">{m.nombre}</span>
                          <span class="text-12-regular text-text-muted">
                            {m.nota} · {m.tam}
                          </span>
                        </div>
                        <Show
                          when={!instalado(m.id)}
                          fallback={<span class="shrink-0 text-13-medium text-[#22c55e]">Instalado</span>}
                        >
                          <button
                            type="button"
                            disabled={!!d() && d().pct >= 0 && d().pct < 100}
                            onClick={() => void descargar(m.id)}
                            class="shrink-0 rounded-md border border-border-base bg-surface-raised px-3 py-1.5 text-12-medium text-text-strong hover:bg-surface-hover disabled:opacity-50"
                          >
                            {d() ? (d().pct === -1 ? "Reintentar" : "Descargando…") : "Descargar"}
                          </button>
                        </Show>
                      </div>
                      <Show when={d() && !instalado(m.id)}>
                        <div class="flex flex-col gap-1">
                          <Show
                            when={d().pct !== -1}
                            fallback={<span class="text-12-regular text-red-400">{d().error}</span>}
                          >
                            <div class="h-1.5 w-full overflow-hidden rounded-full bg-border-base">
                              <div
                                class="h-full rounded-full bg-[#EC5B2B] transition-all"
                                style={{ width: `${Math.max(2, d().pct)}%` }}
                              />
                            </div>
                            <span class="text-12-regular text-text-muted">
                              {d().estado} {d().pct > 0 ? `· ${d().pct}%` : ""} {d().detalle ? `· ${d().detalle}` : ""}
                            </span>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>

        {/* Acciones */}
        <div class="mt-1 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={conectarApi}
            class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover"
          >
            <span class="font-mono text-[#EC5B2B]">›</span> Conectar una API de nube
          </button>
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-lg bg-[#EC5B2B] px-4 py-2 text-13-medium text-white hover:opacity-90"
          >
            Empezar
          </button>
        </div>
      </div>
      </Show>
    </Dialog>
  )
}
