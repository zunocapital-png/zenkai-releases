import { createSignal, createMemo, onMount, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useLocal } from "@/context/local"
import { useProviders } from "@/hooks/use-providers"
import { decode64 } from "@/utils/base64"

// Panel de diagnóstico: chequea que todo esté conectado y lo muestra en español.
type Estado = "ok" | "warn" | "error" | "loading"

const ICONO: Record<Estado, string> = {
  ok: "✅",
  warn: "⚠️",
  error: "❌",
  loading: "⏳",
}

const COLOR: Record<Estado, string> = {
  ok: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  loading: "text-text-muted",
}

function Fila(props: { estado: Estado; titulo: string; detalle?: string; children?: any }) {
  return (
    <div class="flex flex-col gap-1.5 rounded-lg border border-border-base bg-surface-raised p-4">
      <div class="flex items-center gap-2.5">
        <span class={`text-16-medium ${COLOR[props.estado]}`}>{ICONO[props.estado]}</span>
        <span class="text-14-medium text-text-strong">{props.titulo}</span>
      </div>
      <Show when={props.detalle}>
        <p class="pl-[26px] text-13-regular text-text-muted">{props.detalle}</p>
      </Show>
      <Show when={props.children}>
        <div class="pl-[26px]">{props.children}</div>
      </Show>
    </div>
  )
}

async function pingJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function DialogDiagnostico() {
  const local = useLocal()
  const providers = useProviders(() => decode64(local.slug()))

  const [ollama, setOllama] = createSignal<Estado>("loading")
  const [modelosOllama, setModelosOllama] = createSignal<string[]>([])
  const [auto, setAuto] = createSignal<Estado>("loading")
  const [chequeando, setChequeando] = createSignal(false)

  const conectados = createMemo(() => providers.connected())

  async function check() {
    setChequeando(true)
    setOllama("loading")
    setAuto("loading")
    setModelosOllama([])

    const [tags, models] = await Promise.all([
      pingJson("http://localhost:11434/api/tags"),
      pingJson("http://localhost:20128/v1/models"),
    ])

    if (tags) {
      const nombres = Array.isArray(tags?.models)
        ? tags.models.map((m: any) => m?.name).filter((n: any): n is string => typeof n === "string")
        : []
      setModelosOllama(nombres)
      setOllama("ok")
    } else {
      setOllama("error")
    }

    setAuto(models ? "ok" : "warn")
    setChequeando(false)
  }

  onMount(() => void check())

  return (
    <Dialog
      size="large"
      title="Diagnóstico del sistema"
      class="w-[min(calc(100vw-40px),640px)] h-[min(calc(100vh-40px),560px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          Estado de las conexiones de ZENKAI. Verde = todo bien, amarillo = opcional o limitado, rojo = no disponible.
        </p>

        {/* 1. Ollama */}
        <Fila
          estado={ollama()}
          titulo={
            ollama() === "ok"
              ? "Ollama corriendo"
              : ollama() === "loading"
                ? "Ollama · chequeando…"
                : "Ollama apagado o no instalado"
          }
          detalle={
            ollama() === "error" ? "ZENKAI intenta instalarlo/prenderlo solo al abrir." : undefined
          }
        >
          <Show when={ollama() === "ok"}>
            <Show
              when={modelosOllama().length > 0}
              fallback={<span class="text-13-regular text-text-muted">Sin modelos descargados todavía.</span>}
            >
              <ul class="flex flex-col gap-1">
                <For each={modelosOllama()}>
                  {(m) => <li class="font-mono text-13-regular text-text-base">{m}</li>}
                </For>
              </ul>
            </Show>
          </Show>
        </Fila>

        {/* 2. ZENKAI Auto */}
        <Fila
          estado={auto()}
          titulo={
            auto() === "ok"
              ? "Auto activo"
              : auto() === "loading"
                ? "ZENKAI Auto · chequeando…"
                : "Auto no disponible"
          }
          detalle={auto() === "warn" ? "Requiere Node. El motor de relevo no está respondiendo." : undefined}
        />

        {/* 3. Proveedores de nube */}
        <Fila
          estado={conectados().length > 0 ? "ok" : "warn"}
          titulo={
            conectados().length > 0
              ? `Proveedores de nube conectados (${conectados().length})`
              : "Ningún proveedor de nube conectado"
          }
          detalle={conectados().length === 0 ? "Usá el botón 'Conectar API' para agregar una key." : undefined}
        >
          <Show when={conectados().length > 0}>
            <ul class="flex flex-col gap-1">
              <For each={conectados()}>
                {(p) => <li class="text-13-regular text-text-base">{p.name ?? p.id}</li>}
              </For>
            </ul>
          </Show>
        </Fila>

        {/* Botón re-chequear */}
        <div class="mt-1 flex justify-end">
          <button
            type="button"
            disabled={chequeando()}
            onClick={() => void check()}
            class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover disabled:opacity-50"
          >
            {chequeando() ? "Chequeando…" : "Volver a chequear"}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
