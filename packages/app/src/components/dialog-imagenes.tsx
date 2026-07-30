import { createSignal, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Generar imágenes 100% LOCAL, conectándose a un motor Stable Diffusion que el usuario
// corra en su PC (Automatic1111 / Forge exponen la API en localhost:7860 con /sdapi/v1/txt2img).
// Igual filosofía que Ollama: gratis, offline, sin key. Si no hay motor, guía para activarlo.
// El camino por nube (API) se enchufa después sobre el router de ZENKAI.

const DEFAULT_URL = "http://localhost:7860"

type Estado = "idle" | "buscando" | "listo" | "sin-motor" | "generando" | "error"

export function DialogImagenes() {
  const dialog = useDialog()
  const [url, setUrl] = createSignal(DEFAULT_URL)
  const [estado, setEstado] = createSignal<Estado>("buscando")
  const [prompt, setPrompt] = createSignal("")
  const [negativo, setNegativo] = createSignal("")
  const [tam, setTam] = createSignal(512)
  const [pasos, setPasos] = createSignal(25)
  const [imagen, setImagen] = createSignal<string | undefined>(undefined)
  const [error, setError] = createSignal<string | undefined>(undefined)

  async function detectar() {
    setEstado("buscando")
    try {
      const res = await fetch(`${url()}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(2500) })
      setEstado(res.ok ? "listo" : "sin-motor")
    } catch {
      setEstado("sin-motor")
    }
  }

  onMount(() => void detectar())

  async function generar() {
    if (!prompt().trim() || estado() === "generando") return
    setEstado("generando")
    setError(undefined)
    setImagen(undefined)
    try {
      const res = await fetch(`${url()}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: prompt().trim(),
          negative_prompt: negativo().trim(),
          steps: pasos(),
          width: tam(),
          height: tam(),
          cfg_scale: 7,
        }),
      })
      if (!res.ok) throw new Error(`El motor respondió ${res.status}`)
      const data = (await res.json()) as { images?: string[] }
      const b64 = data.images?.[0]
      if (!b64) throw new Error("El motor no devolvió imagen.")
      setImagen(`data:image/png;base64,${b64}`)
      setEstado("listo")
    } catch (e) {
      setEstado("error")
      setError(e instanceof Error ? e.message : "No se pudo generar.")
    }
  }

  function descargar() {
    const src = imagen()
    if (!src) return
    const a = document.createElement("a")
    a.href = src
    a.download = `zenkai-${Date.now()}.png`
    a.click()
  }

  const inputClass =
    "w-full rounded-md border border-border-base bg-surface-base px-3 py-2 text-13-regular text-text-strong placeholder:text-text-muted focus:outline-none focus:border-orange-500"

  return (
    <Dialog
      size="large"
      title="Generar imágenes (local)"
      class="w-[min(calc(100vw-40px),680px)] h-[min(calc(100vh-40px),700px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <Show
          when={estado() !== "sin-motor"}
          fallback={
            <div class="flex flex-col gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-4">
              <span class="text-14-medium text-text-strong">No encontré un motor de imágenes local</span>
              <p class="text-13-regular text-text-muted">
                Para generar imágenes gratis y offline necesitás un motor Stable Diffusion corriendo en tu PC. El más
                común es <span class="font-mono">Automatic1111</span> (o Forge): al iniciarlo con{" "}
                <span class="font-mono">--api</span> expone la API en <span class="font-mono">localhost:7860</span>.
              </p>
              <ol class="flex list-decimal flex-col gap-1 pl-5 text-13-regular text-text-muted">
                <li>Instalá Automatic1111 (github.com/AUTOMATIC1111/stable-diffusion-webui).</li>
                <li>Arrancalo con el flag <span class="font-mono">--api</span>.</li>
                <li>Volvé acá y tocá "Reintentar".</li>
              </ol>
              <div class="flex items-center gap-2">
                <input value={url()} onInput={(e) => setUrl(e.currentTarget.value)} class={inputClass} />
                <button
                  type="button"
                  onClick={() => void detectar()}
                  class="shrink-0 rounded-md bg-orange-500 px-4 py-2 text-12-medium text-white hover:bg-orange-600"
                >
                  Reintentar
                </button>
              </div>
              <p class="text-11-regular text-text-faint">
                La opción por nube (sin instalar nada) llega en la próxima, montada sobre los proveedores que ya conectás.
              </p>
            </div>
          }
        >
          <p class="text-13-regular text-text-muted">
            Motor local detectado en <span class="font-mono">{url()}</span>. Escribí qué querés y generá — gratis y en tu
            PC.
          </p>

          <label class="flex flex-col gap-1.5">
            <span class="text-13-medium text-text-strong">Qué imaginás</span>
            <textarea
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
              rows={3}
              placeholder="Un zorro naranja programando en una notebook, estilo ilustración plana, fondo oscuro"
              class={`${inputClass} resize-y`}
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-13-medium text-text-strong">Qué NO querés (opcional)</span>
            <input
              value={negativo()}
              onInput={(e) => setNegativo(e.currentTarget.value)}
              placeholder="borroso, deforme, texto"
              class={inputClass}
            />
          </label>

          <div class="flex flex-wrap items-end gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-12-medium text-text-strong">Tamaño</span>
              <select value={tam()} onChange={(e) => setTam(parseInt(e.currentTarget.value, 10))} class={inputClass}>
                <option value={512}>512 × 512 (rápido)</option>
                <option value={768}>768 × 768</option>
                <option value={1024}>1024 × 1024 (lento)</option>
              </select>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-12-medium text-text-strong">Pasos: {pasos()}</span>
              <input
                type="range"
                min={10}
                max={50}
                value={pasos()}
                onInput={(e) => setPasos(parseInt(e.currentTarget.value, 10))}
                class="w-40"
              />
            </label>
            <button
              type="button"
              disabled={!prompt().trim() || estado() === "generando"}
              onClick={() => void generar()}
              class="ml-auto rounded-lg bg-orange-500 px-5 py-2.5 text-13-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {estado() === "generando" ? "Generando…" : "Generar"}
            </button>
          </div>

          <Show when={error()}>
            <span class="text-13-regular text-red-400">{error()}</span>
          </Show>

          <Show when={estado() === "generando"}>
            <div class="flex h-64 items-center justify-center rounded-lg border border-border-base bg-surface-base">
              <span class="text-13-regular text-text-muted">Pintando en tu GPU… puede tardar unos segundos.</span>
            </div>
          </Show>

          <Show when={imagen()}>
            <div class="flex flex-col gap-2">
              <img src={imagen()} alt="Imagen generada" class="w-full rounded-lg border border-border-base" />
              <button
                type="button"
                onClick={descargar}
                class="self-start rounded-md border border-border-base px-3 py-1.5 text-12-medium text-text-strong hover:bg-surface-hover"
              >
                Descargar PNG
              </button>
            </div>
          </Show>
        </Show>

        <div class="mt-1 flex items-center justify-end">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Dialog>
  )
}
