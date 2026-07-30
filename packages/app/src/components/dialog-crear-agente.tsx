import { createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { CATALOGO_LOCAL } from "@/utils/ollama-local"

// Crear un agente propio desde la app: escribe en la config (cfg.agent) vía
// updateConfig, así aparece en el selector del composer sin editar archivos a mano.
// Los agentes pueden correr 100% locales fijándolos a un modelo de Ollama.

type OpcionModelo = { value: string; label: string }

// Modelos elegibles: Auto (OmniRoute) + todo el catálogo local (ollama/...).
const OPCIONES_MODELO: OpcionModelo[] = [
  { value: "omniroute/auto", label: "🔀 ZENKAI Auto (elige solo)" },
  ...CATALOGO_LOCAL.map((m) => ({ value: `ollama/${m.id}`, label: `🖥️ ${m.nombre} (local)` })),
]

// Plantillas: rellenan el formulario para crear un agente útil en segundos.
const PLANTILLAS: { label: string; nombre: string; descripcion: string; prompt: string }[] = [
  {
    label: "🔍 Revisor",
    nombre: "Revisor de código",
    descripcion: "Revisa código buscando bugs y riesgos",
    prompt:
      "Sos un revisor de código senior. Revisá el código buscando bugs, riesgos de seguridad, casos borde y malas prácticas. Respondé en español, conciso, con ejemplos concretos y la línea afectada.",
  },
  {
    label: "📝 Documentador",
    nombre: "Documentador",
    descripcion: "Escribe documentación clara",
    prompt:
      "Documentás código de forma clara y concisa. Explicá qué hace cada función, sus parámetros y un ejemplo de uso. Respondé en español, sin relleno.",
  },
  {
    label: "🧪 Tester",
    nombre: "Tester",
    descripcion: "Escribe tests y casos borde",
    prompt:
      "Escribís tests para el código dado: casos felices, bordes y errores. Usá el framework de tests del proyecto. Respondé en español y explicá qué cubre cada test.",
  },
  {
    label: "🌐 Traductor",
    nombre: "Traductor",
    descripcion: "Traduce manteniendo el sentido",
    prompt:
      "Traducís texto y comentarios de código manteniendo el sentido técnico y el tono. Preguntá el idioma destino si no está claro. No traduzcas nombres de variables ni código.",
  },
  {
    label: "🎓 Explicador",
    nombre: "Explicador",
    descripcion: "Explica código paso a paso",
    prompt:
      "Explicás código paso a paso, simple, como a alguien que recién empieza. Usá analogías cuando ayuden. Respondé en español.",
  },
]

const MODOS: { value: "all" | "primary" | "subagent"; label: string }[] = [
  { value: "all", label: "General (principal y como subagente)" },
  { value: "primary", label: "Principal (lo elegís en el chat)" },
  { value: "subagent", label: "Subagente (lo llaman otros agentes)" },
]

function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export function DialogCrearAgente() {
  const dialog = useDialog()
  const serverSync = useServerSync()

  const [nombre, setNombre] = createSignal("")
  // Default = ZENKAI Auto: siempre funciona aunque el usuario no haya bajado ningún modelo
  // local (antes defaulteaba a un local de ~4.7 GB que probablemente no está instalado).
  const [modelo, setModelo] = createSignal(OPCIONES_MODELO[0]?.value ?? "omniroute/auto")
  const [descripcion, setDescripcion] = createSignal("")
  const [prompt, setPrompt] = createSignal("")
  const [modo, setModo] = createSignal<"all" | "primary" | "subagent">("all")
  const [guardando, setGuardando] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(undefined)

  const slug = () => slugify(nombre())

  async function guardar(e: SubmitEvent) {
    e.preventDefault()
    if (guardando()) return
    setError(undefined)
    if (!slug()) return setError("Poné un nombre (solo letras y números).")
    if (!prompt().trim()) return setError("Escribí las instrucciones del agente.")

    setGuardando(true)
    try {
      await serverSync().updateConfig({
        agent: {
          [slug()]: {
            description: descripcion().trim() || `Agente ${nombre().trim()}`,
            mode: modo(),
            model: modelo(),
            prompt: prompt().trim(),
          },
        },
      })
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "Agente creado",
        description: `"${nombre().trim()}" ya está disponible en el selector de agentes.`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el agente.")
    } finally {
      setGuardando(false)
    }
  }

  const inputClass =
    "w-full rounded-md border border-border-base bg-surface-base px-3 py-2 text-14-regular text-text-strong placeholder:text-text-muted focus:outline-none focus:border-orange-500"

  return (
    <Dialog
      size="large"
      title="Crear agente"
      class="w-[min(calc(100vw-40px),620px)] h-[min(calc(100vh-40px),620px)] min-h-0 overflow-hidden"
    >
      <form onSubmit={guardar} class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          Un agente es un asistente con su propio modelo e instrucciones. Podés fijarlo a un modelo local (gratis, en tu
          PC) o dejar que ZENKAI Auto elija.
        </p>

        <div class="flex flex-col gap-1.5">
          <span class="text-12-medium text-text-strong">Empezá con una plantilla</span>
          <div class="flex flex-wrap gap-2">
            <For each={PLANTILLAS}>
              {(p) => (
                <button
                  type="button"
                  onClick={() => {
                    setNombre(p.nombre)
                    setDescripcion(p.descripcion)
                    setPrompt(p.prompt)
                  }}
                  class="rounded-full border border-border-base bg-surface-base px-3 py-1 text-12-medium text-text-strong hover:bg-surface-hover"
                >
                  {p.label}
                </button>
              )}
            </For>
          </div>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="text-13-medium text-text-strong">Nombre</span>
          <input
            type="text"
            value={nombre()}
            onInput={(e) => setNombre(e.currentTarget.value)}
            placeholder="ej: Revisor de seguridad, Traductor, Documentador…"
            class={inputClass}
          />
          <Show when={slug()}>
            <span class="text-11-regular text-text-muted">Se guardará como: {slug()}</span>
          </Show>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-13-medium text-text-strong">Modelo</span>
          <select value={modelo()} onChange={(e) => setModelo(e.currentTarget.value)} class={inputClass}>
            <For each={OPCIONES_MODELO}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
          <span class="text-11-regular text-text-muted">
            Los locales corren en tu PC sin costo (bajalos antes en Diagnóstico).
          </span>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-13-medium text-text-strong">Descripción (opcional)</span>
          <input
            type="text"
            value={descripcion()}
            onInput={(e) => setDescripcion(e.currentTarget.value)}
            placeholder="Para qué sirve este agente"
            class={inputClass}
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-13-medium text-text-strong">Instrucciones (prompt del sistema)</span>
          <textarea
            value={prompt()}
            onInput={(e) => setPrompt(e.currentTarget.value)}
            rows={6}
            placeholder="Sos un revisor de código experto. Buscá bugs, riesgos de seguridad y malas prácticas. Respondé en español, conciso y con ejemplos concretos."
            class={`${inputClass} resize-y`}
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="text-13-medium text-text-strong">Tipo</span>
          <select
            value={modo()}
            onChange={(e) => setModo(e.currentTarget.value as "all" | "primary" | "subagent")}
            class={inputClass}
          >
            <For each={MODOS}>{(m) => <option value={m.value}>{m.label}</option>}</For>
          </select>
        </label>

        <Show when={error()}>
          <span class="text-13-regular text-red-400">{error()}</span>
        </Show>

        <div class="mt-1 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando()}
            class="rounded-lg bg-orange-500 px-4 py-2 text-13-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {guardando() ? "Creando…" : "Crear agente"}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
