import { createSignal, For, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { usePlatform } from "@/context/platform"
import { showToast } from "@/utils/toast"

// Generar imágenes en ZENKAI de DOS formas (fiel a "local pero también online"):
//  • LOCAL: motor Stable Diffusion en tu PC (Automatic1111/Forge, localhost:7860). Gratis, offline.
//  • NUBE (API): conectás una key de un proveedor de imágenes OpenAI-compatible (ej. Together
//    tiene FLUX gratis) y genera por la nube. Sin instalar nada.
// Ambos devuelven la imagen acá con botón de descarga.

const SD_URL = "http://localhost:7860"

type ProvNube = { id: string; nombre: string; baseURL: string; modelo: string; url: string; nota: string }
const NUBE: ProvNube[] = [
  { id: "together", nombre: "Together — FLUX (gratis)", baseURL: "https://api.together.xyz/v1", modelo: "black-forest-labs/FLUX.1-schnell-Free", url: "https://api.together.xyz/settings/api-keys", nota: "FLUX.1 schnell, tier gratis." },
  { id: "openai", nombre: "OpenAI — GPT Image", baseURL: "https://api.openai.com/v1", modelo: "gpt-image-1", url: "https://platform.openai.com/api-keys", nota: "Calidad alta (pago por uso)." },
  { id: "custom", nombre: "Otro (OpenAI-compatible)", baseURL: "", modelo: "", url: "", nota: "Pegá baseURL y modelo del proveedor." },
]

export function DialogImagenes() {
  const dialog = useDialog()
  const platform = usePlatform()
  const [modo, setModo] = createSignal<"local" | "nube">("local")
  const [prompt, setPrompt] = createSignal("")
  const [negativo, setNegativo] = createSignal("")
  const [tam, setTam] = createSignal(1024)
  const [pasos, setPasos] = createSignal(25)
  const [imagen, setImagen] = createSignal<string | undefined>(undefined)
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [gen, setGen] = createSignal(false)

  // Local
  const [sdUrl, setSdUrl] = createSignal(SD_URL)
  const [sdVivo, setSdVivo] = createSignal<boolean | undefined>(undefined)
  async function detectarSd() {
    setSdVivo(undefined)
    try {
      const r = await fetch(`${sdUrl()}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(2500) })
      setSdVivo(r.ok)
    } catch {
      setSdVivo(false)
    }
  }
  onMount(() => void detectarSd())

  // Nube
  const [provId, setProvId] = createSignal("together")
  const prov = () => NUBE.find((p) => p.id === provId()) ?? NUBE[0]!
  const [keyNube, setKeyNube] = createSignal("")
  const [baseCustom, setBaseCustom] = createSignal("")
  const [modeloCustom, setModeloCustom] = createSignal("")

  async function generarLocal() {
    const r = await fetch(`${sdUrl()}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: prompt().trim(), negative_prompt: negativo().trim(), steps: pasos(), width: tam(), height: tam(), cfg_scale: 7 }),
    })
    if (!r.ok) throw new Error(`El motor local respondió ${r.status}`)
    const d = (await r.json()) as { images?: string[] }
    if (!d.images?.[0]) throw new Error("El motor no devolvió imagen.")
    return `data:image/png;base64,${d.images[0]}`
  }

  async function generarNube() {
    const p = prov()
    const base = (p.id === "custom" ? baseCustom() : p.baseURL).trim().replace(/\/$/, "")
    const modelo = (p.id === "custom" ? modeloCustom() : p.modelo).trim()
    const key = keyNube().trim()
    if (!base || !modelo) throw new Error("Falta baseURL o modelo del proveedor.")
    if (!key) throw new Error("Pegá tu API key.")
    const r = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelo, prompt: prompt().trim(), n: 1, size: `${tam()}x${tam()}`, response_format: "b64_json" }),
    })
    const d = (await r.json()) as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } }
    if (!r.ok) throw new Error(d?.error?.message || `El proveedor respondió ${r.status}`)
    const item = d.data?.[0]
    if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`
    if (item?.url) return item.url
    throw new Error("El proveedor no devolvió imagen.")
  }

  async function generar() {
    if (!prompt().trim() || gen()) return
    setGen(true)
    setError(undefined)
    setImagen(undefined)
    try {
      setImagen(modo() === "local" ? await generarLocal() : await generarNube())
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar.")
    } finally {
      setGen(false)
    }
  }

  function descargar() {
    const s = imagen()
    if (!s) return
    const a = document.createElement("a")
    a.href = s
    a.download = `zenkai-${modo()}.png`
    a.click()
  }

  // Guarda el proveedor para que el MODELO genere imágenes DESDE EL CHAT (tool generar_imagen),
  // como Claude: configurás una vez acá y después pedís imágenes escribiendo en la conversación.
  async function guardarParaChat() {
    const p = prov()
    const cfg =
      modo() === "local"
        ? { mode: "local", sdUrl: sdUrl() }
        : {
            mode: "nube",
            baseURL: (p.id === "custom" ? baseCustom() : p.baseURL).trim(),
            key: keyNube().trim(),
            model: (p.id === "custom" ? modeloCustom() : p.modelo).trim(),
          }
    if (modo() === "nube" && (!cfg.baseURL || !cfg.model || !cfg.key)) {
      setError("Completá proveedor y key antes de guardar para el chat.")
      return
    }
    const ok = await platform.imageConfigSet?.(JSON.stringify(cfg))
    showToast(
      ok
        ? { variant: "success", icon: "circle-check", title: "Listo para el chat", description: "Ahora podés pedir imágenes escribiendo en la conversación (ej: 'generá una imagen de…')." }
        : { variant: "error", title: "No se pudo guardar", description: "Intentá de nuevo." },
    )
  }

  const inputClass = "w-full rounded-md border border-border-base bg-surface-base px-3 py-2 text-13-regular text-text-strong placeholder:text-text-muted focus:outline-none focus:border-orange-500"
  const puedeGenerar = () => (modo() === "local" ? sdVivo() === true : true) && !!prompt().trim() && !gen()

  return (
    <Dialog size="large" title="Generar imágenes" class="w-[min(calc(100vw-40px),700px)] h-[min(calc(100vh-40px),720px)] min-h-0 overflow-hidden">
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        {/* Selector de modo */}
        <div class="flex gap-2">
          <For each={[{ id: "local", t: "🖥️ Local (gratis)" }, { id: "nube", t: "☁️ Nube (API)" }] as const}>
            {(m) => (
              <button
                type="button"
                onClick={() => setModo(m.id)}
                class="flex-1 rounded-lg border px-3 py-2 text-13-medium transition-colors"
                classList={{ "border-orange-500 bg-orange-500/10 text-orange-500": modo() === m.id, "border-border-base bg-surface-base text-text-strong hover:bg-surface-hover": modo() !== m.id }}
              >
                {m.t}
              </button>
            )}
          </For>
        </div>

        <Show when={modo() === "local"}>
          <Show
            when={sdVivo() !== false}
            fallback={
              <div class="flex flex-col gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-4 text-13-regular text-text-muted">
                <span class="text-14-medium text-text-strong">No hay motor local corriendo</span>
                <span>Necesitás Stable Diffusion (Automatic1111/Forge) iniciado con <span class="font-mono">--api</span> en <span class="font-mono">localhost:7860</span>. O usá el modo Nube.</span>
                <div class="flex items-center gap-2">
                  <input value={sdUrl()} onInput={(e) => setSdUrl(e.currentTarget.value)} class={inputClass} />
                  <button type="button" onClick={() => void detectarSd()} class="shrink-0 rounded-md bg-orange-500 px-4 py-2 text-12-medium text-white hover:bg-orange-600">Reintentar</button>
                </div>
              </div>
            }
          >
            <p class="text-12-regular text-green-400">Motor local detectado en {sdUrl()}.</p>
          </Show>
        </Show>

        <Show when={modo() === "nube"}>
          <div class="flex flex-col gap-2.5 rounded-lg border border-border-base bg-surface-raised p-3">
            <label class="flex flex-col gap-1">
              <span class="text-12-medium text-text-strong">Proveedor</span>
              <select value={provId()} onChange={(e) => setProvId(e.currentTarget.value)} class={inputClass}>
                <For each={NUBE}>{(p) => <option value={p.id}>{p.nombre}</option>}</For>
              </select>
              <span class="text-11-regular text-text-muted">{prov().nota}</span>
            </label>
            <Show when={prov().id === "custom"}>
              <input value={baseCustom()} onInput={(e) => setBaseCustom(e.currentTarget.value)} placeholder="baseURL (ej: https://api.tuservicio.com/v1)" class={inputClass} />
              <input value={modeloCustom()} onInput={(e) => setModeloCustom(e.currentTarget.value)} placeholder="modelo (ej: flux-dev)" class={inputClass} />
            </Show>
            <div class="flex items-center gap-2">
              <input type="password" value={keyNube()} onInput={(e) => setKeyNube(e.currentTarget.value)} placeholder="Pegá tu API key" class={inputClass} />
              <Show when={prov().url}>
                <a href={prov().url} target="_blank" rel="noreferrer" class="shrink-0 rounded-md border border-border-base px-3 py-2 text-12-medium text-text-strong hover:bg-surface-hover">Key ↗</a>
              </Show>
            </div>
          </div>
        </Show>

        <label class="flex flex-col gap-1.5">
          <span class="text-13-medium text-text-strong">Qué imaginás</span>
          <textarea value={prompt()} onInput={(e) => setPrompt(e.currentTarget.value)} rows={3} placeholder="Un zorro naranja programando, estilo ilustración plana, fondo oscuro" class={`${inputClass} resize-y`} />
        </label>

        <div class="flex flex-wrap items-end gap-4">
          <label class="flex flex-col gap-1.5">
            <span class="text-12-medium text-text-strong">Tamaño</span>
            <select value={tam()} onChange={(e) => setTam(parseInt(e.currentTarget.value, 10))} class={inputClass}>
              <option value={512}>512 × 512</option>
              <option value={768}>768 × 768</option>
              <option value={1024}>1024 × 1024</option>
            </select>
          </label>
          <Show when={modo() === "local"}>
            <label class="flex flex-col gap-1.5">
              <span class="text-12-medium text-text-strong">Pasos: {pasos()}</span>
              <input type="range" min={10} max={50} value={pasos()} onInput={(e) => setPasos(parseInt(e.currentTarget.value, 10))} class="w-40" />
            </label>
          </Show>
          <button type="button" disabled={!puedeGenerar()} onClick={() => void generar()} class="ml-auto rounded-lg bg-orange-500 px-5 py-2.5 text-13-medium text-white hover:bg-orange-600 disabled:opacity-50">
            {gen() ? "Generando…" : "Generar"}
          </button>
        </div>

        <Show when={error()}>
          <span class="text-13-regular text-red-400">{error()}</span>
        </Show>
        <Show when={gen()}>
          <div class="flex h-56 items-center justify-center rounded-lg border border-border-base bg-surface-base">
            <span class="text-13-regular text-text-muted">Generando imagen…</span>
          </div>
        </Show>
        <Show when={imagen()}>
          <div class="flex flex-col gap-2">
            <img src={imagen()} alt="Imagen generada" class="w-full rounded-lg border border-border-base" />
            <button type="button" onClick={descargar} class="self-start rounded-md border border-border-base px-3 py-1.5 text-12-medium text-text-strong hover:bg-surface-hover">Descargar PNG</button>
          </div>
        </Show>

        <div class="mt-1 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void guardarParaChat()}
            class="rounded-lg border border-orange-500/50 bg-orange-500/10 px-4 py-2 text-13-medium text-orange-500 hover:bg-orange-500/20"
            title="Configurar para pedir imágenes directamente en el chat"
          >
            ✓ Usar en el chat
          </button>
          <button type="button" onClick={() => dialog.close()} class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover">Cerrar</button>
        </div>
      </div>
    </Dialog>
  )
}
