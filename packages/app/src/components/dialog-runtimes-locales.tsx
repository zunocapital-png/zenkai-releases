import { createSignal, For, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useQueryClient } from "@tanstack/solid-query"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"

// Otros runtimes locales además de Ollama. Todos exponen una API OpenAI-compatible en
// localhost, así que ZENKAI se conecta igual: detecta si están corriendo, lista sus modelos
// y los agrega como proveedor. 100% local, sin key. Beneficio: quien ya usa LM Studio / Jan /
// llama.cpp / vLLM enchufa ZENKAI a lo que ya tiene, sin bajar nada de nuevo.

type Runtime = { id: string; nombre: string; baseURL: string; nota: string }

const RUNTIMES: Runtime[] = [
  { id: "lmstudio", nombre: "LM Studio", baseURL: "http://localhost:1234/v1", nota: "App popular con catálogo de modelos GGUF y servidor local." },
  { id: "jan", nombre: "Jan", baseURL: "http://localhost:1337/v1", nota: "Alternativa open-source a ChatGPT, 100% local." },
  { id: "llamacpp", nombre: "llama.cpp (server)", baseURL: "http://localhost:8080/v1", nota: "El motor base; llama-server expone /v1." },
  { id: "vllm", nombre: "vLLM", baseURL: "http://localhost:8000/v1", nota: "Servidor de alto rendimiento (GPU) para power users." },
  { id: "koboldcpp", nombre: "KoboldCpp", baseURL: "http://localhost:5001/v1", nota: "Runtime liviano con endpoint OpenAI." },
  { id: "gpt4all", nombre: "GPT4All", baseURL: "http://localhost:4891/v1", nota: "App local con servidor OpenAI-compatible." },
]

type Estado = "buscando" | "detectado" | "apagado" | "conectando" | "conectado"

export function DialogRuntimesLocales() {
  const dialog = useDialog()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const queryClient = useQueryClient()
  const [estado, setEstado] = createSignal<Record<string, Estado>>({})
  const [urls, setUrls] = createSignal<Record<string, string>>(Object.fromEntries(RUNTIMES.map((r) => [r.id, r.baseURL])))

  async function modelosDe(baseURL: string): Promise<string[] | null> {
    try {
      const res = await fetch(`${baseURL}/models`, { signal: AbortSignal.timeout(2500) })
      if (!res.ok) return null
      const data = (await res.json()) as { data?: Array<{ id?: string }> }
      return (data.data ?? []).map((m) => m?.id).filter((x): x is string => typeof x === "string")
    } catch {
      return null
    }
  }

  async function detectar(r: Runtime) {
    setEstado((s) => ({ ...s, [r.id]: "buscando" }))
    const mods = await modelosDe(urls()[r.id] ?? r.baseURL)
    setEstado((s) => ({ ...s, [r.id]: mods === null ? "apagado" : "detectado" }))
  }

  onMount(() => RUNTIMES.forEach((r) => void detectar(r)))

  async function conectar(r: Runtime) {
    setEstado((s) => ({ ...s, [r.id]: "conectando" }))
    const base = urls()[r.id] ?? r.baseURL
    const mods = await modelosDe(base)
    if (!mods || mods.length === 0) {
      setEstado((s) => ({ ...s, [r.id]: "apagado" }))
      showToast({ variant: "error", title: `${r.nombre} no respondió`, description: "¿Está corriendo y con el servidor activado?" })
      return
    }
    try {
      const models = Object.fromEntries(mods.map((id) => [id, { name: id }]))
      await serverSync().updateConfig({
        provider: {
          [r.id]: { npm: "@ai-sdk/openai-compatible", name: `${r.nombre} (local)`, options: { baseURL: base }, models },
        } as never,
      })
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === serverSDK().scope && q.queryKey[2] === "providers",
      })
      setEstado((s) => ({ ...s, [r.id]: "conectado" }))
      showToast({ variant: "success", icon: "circle-check", title: `${r.nombre} conectado`, description: `${mods.length} modelo(s) en tu selector.` })
    } catch (e) {
      setEstado((s) => ({ ...s, [r.id]: "detectado" }))
      showToast({ variant: "error", title: "No se pudo conectar", description: e instanceof Error ? e.message : "Intentá de nuevo." })
    }
  }

  const inputClass =
    "w-full rounded-md border border-border-base bg-surface-base px-2.5 py-1.5 text-12-regular font-mono text-text-strong focus:outline-none focus:border-orange-500"

  return (
    <Dialog
      size="large"
      title="Runtimes locales (además de Ollama)"
      class="w-[min(calc(100vw-40px),680px)] h-[min(calc(100vh-40px),680px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          Si ya usás otra app local de modelos, ZENKAI se enchufa a ella (todas hablan el mismo idioma OpenAI). Arrancá
          su servidor local y tocá "Conectar" — sus modelos aparecen en tu selector, gratis y sin bajar nada nuevo.
        </p>

        <div class="flex flex-col gap-2.5">
          <For each={RUNTIMES}>
            {(r) => {
              const st = () => estado()[r.id] ?? "buscando"
              return (
                <div class="flex flex-col gap-2 rounded-lg border border-border-base bg-surface-raised p-4">
                  <div class="flex items-center gap-3">
                    <div class="flex min-w-0 flex-1 flex-col">
                      <div class="flex items-center gap-2">
                        <span class="text-14-medium text-text-strong">{r.nombre}</span>
                        <Show when={st() === "conectado"}>
                          <span class="text-12-medium text-green-400">✓ Conectado</span>
                        </Show>
                        <Show when={st() === "detectado"}>
                          <span class="rounded-full bg-green-500/15 px-2 py-0.5 text-11-medium text-green-400">detectado</span>
                        </Show>
                        <Show when={st() === "apagado"}>
                          <span class="rounded-full bg-surface-base px-2 py-0.5 text-11-medium text-text-muted">apagado</span>
                        </Show>
                      </div>
                      <span class="text-12-regular text-text-muted">{r.nota}</span>
                    </div>
                    <button
                      type="button"
                      disabled={st() === "conectando" || st() === "conectado"}
                      onClick={() => void conectar(r)}
                      class="shrink-0 rounded-md bg-orange-500 px-4 py-2 text-12-medium text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      {st() === "conectado" ? "Conectado" : st() === "conectando" ? "Conectando…" : "Conectar"}
                    </button>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      value={urls()[r.id] ?? r.baseURL}
                      onInput={(e) => setUrls((u) => ({ ...u, [r.id]: e.currentTarget.value }))}
                      class={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => void detectar(r)}
                      class="shrink-0 rounded-md border border-border-base px-3 py-1.5 text-12-medium text-text-strong hover:bg-surface-hover"
                    >
                      {st() === "buscando" ? "Buscando…" : "Reintentar"}
                    </button>
                  </div>
                </div>
              )
            }}
          </For>
        </div>

        <p class="text-11-regular text-text-faint">
          ¿Usás otro runtime OpenAI-compatible? Agregalo con su URL desde Ajustes → Conectores → Proveedores (custom).
        </p>

        <div class="mt-1 flex items-center justify-end">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover"
          >
            Listo
          </button>
        </div>
      </div>
    </Dialog>
  )
}
