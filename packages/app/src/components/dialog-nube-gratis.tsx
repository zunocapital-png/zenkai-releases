import { createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useQueryClient } from "@tanstack/solid-query"
import { useServerSDK } from "@/context/server-sdk"
import { useLocal } from "@/context/local"
import { useProviders } from "@/hooks/use-providers"
import { decode64 } from "@/utils/base64"
import { showToast } from "@/utils/toast"

// "Nube gratis": conectar en 1 lugar los proveedores de nube con tier gratis. Reusa el
// mismo API que el dialog de conexión estándar (integration.connect.key), pero curado y
// con link directo a sacar la key. Es el "todo en uno" tipo OpenRouter, pero abarcando
// varios proveedores (y OpenRouter mismo, que ya trae cientos de modelos con una sola key).

type Proveedor = { id: string; nombre: string; porque: string; url: string; prefijo?: string }

const PROVEEDORES: Proveedor[] = [
  {
    id: "openrouter",
    nombre: "OpenRouter",
    porque: "El agregador: cientos de modelos (incluidos muchos ':free') con UNA sola key.",
    url: "https://openrouter.ai/keys",
    prefijo: "sk-or-",
  },
  {
    id: "groq",
    nombre: "Groq",
    porque: "Ultrarrápido. Llama, Qwen, DeepSeek y Kimi K2, gratis.",
    url: "https://console.groq.com/keys",
    prefijo: "gsk_",
  },
  {
    id: "google",
    nombre: "Google Gemini",
    porque: "Gemini Flash con tier gratis generoso.",
    url: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "nvidia",
    nombre: "NVIDIA NIM",
    porque: "Decenas de modelos gratis: Nemotron, Llama, Qwen, DeepSeek.",
    url: "https://build.nvidia.com",
    prefijo: "nvapi-",
  },
  {
    id: "cerebras",
    nombre: "Cerebras",
    porque: "Inferencia rapidísima, tier gratis.",
    url: "https://cloud.cerebras.ai",
  },
  {
    id: "mistral",
    nombre: "Mistral",
    porque: "Modelos Mistral (chat y código) con tier gratis.",
    url: "https://console.mistral.ai/api-keys",
  },
  {
    id: "cohere",
    nombre: "Cohere",
    porque: "Command R/A, fuertes en RAG y herramientas. Gratis, sin tarjeta.",
    url: "https://dashboard.cohere.com/api-keys",
  },
  {
    id: "togetherai",
    nombre: "Together AI",
    porque: "Llama 3.3 70B, Qwen, DeepSeek y más, con créditos gratis.",
    url: "https://api.together.xyz/settings/api-keys",
  },
]

export function DialogNubeGratis() {
  const dialog = useDialog()
  const serverSDK = useServerSDK()
  const queryClient = useQueryClient()
  const local = useLocal()
  const providers = useProviders(() => decode64(local.slug()))

  const yaConectado = (id: string) => providers.connected().some((p: { id: string }) => p.id === id)

  const [keys, setKeys] = createSignal<Record<string, string>>({})
  const [estado, setEstado] = createSignal<Record<string, "idle" | "conectando" | "ok" | "error">>({})
  const [errores, setErrores] = createSignal<Record<string, string>>({})

  async function conectar(p: Proveedor) {
    const key = (keys()[p.id] ?? "").trim()
    if (!key) return
    setEstado((s) => ({ ...s, [p.id]: "conectando" }))
    setErrores((e) => ({ ...e, [p.id]: "" }))
    try {
      await serverSDK().api.integration.connect.key({ integrationID: p.id, location: undefined, key })
      setEstado((s) => ({ ...s, [p.id]: "ok" }))
      // Refrescar el catálogo para que los modelos aparezcan en el selector al instante.
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === serverSDK().scope && q.queryKey[2] === "providers",
      })
      showToast({ variant: "success", icon: "circle-check", title: `${p.nombre} conectado`, description: "Sus modelos ya están en el selector." })
    } catch (e) {
      setEstado((s) => ({ ...s, [p.id]: "error" }))
      setErrores((er) => ({ ...er, [p.id]: e instanceof Error ? e.message : "No se pudo conectar. ¿La key es correcta?" }))
    }
  }

  const inputClass =
    "w-full rounded-md border border-border-base bg-surface-base px-3 py-2 text-13-regular text-text-strong placeholder:text-text-muted focus:outline-none focus:border-orange-500"

  return (
    <Dialog
      size="large"
      title="Conectar modelos de nube (gratis)"
      class="w-[min(calc(100vw-40px),640px)] h-[min(calc(100vh-40px),640px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          Conectá proveedores con tier gratis y sus modelos aparecen al toque en tu selector. Con OpenRouter solo ya
          tenés cientos de modelos en una sola key — es lo más parecido a "todo en uno".
        </p>

        <div class="flex flex-col gap-2.5">
          <For each={PROVEEDORES}>
            {(p) => {
              const st = () => estado()[p.id] ?? "idle"
              const conectado = () => yaConectado(p.id) || st() === "ok"
              return (
                <div class="flex flex-col gap-2 rounded-lg border border-border-base bg-surface-raised p-4">
                  <div class="flex items-center gap-3">
                    <div class="flex min-w-0 flex-1 flex-col">
                      <div class="flex items-center gap-2">
                        <span class="text-14-medium text-text-strong">{p.nombre}</span>
                        <span class="rounded-full bg-green-500/15 px-2 py-0.5 text-11-medium text-green-400">gratis</span>
                        <Show when={conectado()}>
                          <span class="text-12-medium text-green-400">✓ Conectado</span>
                        </Show>
                      </div>
                      <span class="text-12-regular text-text-muted">{p.porque}</span>
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      class="shrink-0 rounded-md border border-border-base px-3 py-1.5 text-12-medium text-text-strong hover:bg-surface-hover"
                    >
                      Sacar key gratis ↗
                    </a>
                  </div>

                  <Show when={!conectado()}>
                    <div class="flex items-center gap-2">
                      <input
                        type="password"
                        value={keys()[p.id] ?? ""}
                        onInput={(e) => setKeys((k) => ({ ...k, [p.id]: e.currentTarget.value }))}
                        onKeyDown={(e) => e.key === "Enter" && void conectar(p)}
                        placeholder={p.prefijo ? `Pegá tu key (${p.prefijo}…)` : "Pegá tu API key"}
                        class={inputClass}
                      />
                      <button
                        type="button"
                        disabled={st() === "conectando" || !(keys()[p.id] ?? "").trim()}
                        onClick={() => void conectar(p)}
                        class="shrink-0 rounded-md bg-orange-500 px-4 py-2 text-12-medium text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        {st() === "conectando" ? "Conectando…" : "Conectar"}
                      </button>
                    </div>
                    <Show when={errores()[p.id]}>
                      <span class="text-12-regular text-red-400">{errores()[p.id]}</span>
                    </Show>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>

        <p class="text-11-regular text-text-faint">
          ¿Tenés un modelo con su propio endpoint (OpenAI-compatible)? Podés agregarlo como proveedor custom desde
          Ajustes → Conectores → Proveedores. Y para modelos 100% locales, usá "Modelos locales".
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
