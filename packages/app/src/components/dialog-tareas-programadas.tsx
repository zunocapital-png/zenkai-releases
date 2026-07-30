import { createSignal, onMount, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { usePlatform } from "@/context/platform"

// Tareas programadas (primer ladrillo de "agentes proactivos"): guardás una tarea con
// un intervalo y ZENKAI te avisa con una notificación cuando llega la hora. Seguro:
// todavía NO ejecuta acciones solo — solo te recuerda. Correr un agente al dispararse
// es el paso siguiente, que haremos con verificación en vivo.

type Tarea = { id: string; name: string; prompt: string; everyMinutes: number; enabled: boolean }

function nuevoId(nombre: string): string {
  return `${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Math.abs(hashStr(nombre + Math.random()))}`
}
// Hash simple sin Math.random en la semilla del id (evita colisiones legibles).
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

export function DialogTareasProgramadas() {
  const platform = usePlatform()
  const [tareas, setTareas] = createSignal<Tarea[]>([])
  const [nombre, setNombre] = createSignal("")
  const [prompt, setPrompt] = createSignal("")
  const [minutos, setMinutos] = createSignal(60)

  onMount(() => {
    void platform.scheduledGet?.().then((json) => {
      try {
        const t = JSON.parse(json)
        if (Array.isArray(t)) setTareas(t)
      } catch {
        /* vacío */
      }
    })
  })

  async function guardar(lista: Tarea[]) {
    setTareas(lista)
    await platform.scheduledSet?.(JSON.stringify(lista))
  }

  function agregar(e: SubmitEvent) {
    e.preventDefault()
    if (!nombre().trim() || !prompt().trim() || !(minutos() > 0)) return
    const t: Tarea = {
      id: nuevoId(nombre().trim()),
      name: nombre().trim(),
      prompt: prompt().trim(),
      everyMinutes: Math.round(minutos()),
      enabled: true,
    }
    void guardar([...tareas(), t])
    setNombre("")
    setPrompt("")
    setMinutos(60)
  }

  function toggle(id: string) {
    void guardar(tareas().map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)))
  }
  function borrar(id: string) {
    void guardar(tareas().filter((t) => t.id !== id))
  }

  const inputClass =
    "w-full rounded-md border border-border-base bg-surface-base px-3 py-2 text-14-regular text-text-strong placeholder:text-text-muted focus:outline-none focus:border-orange-500"

  return (
    <Dialog
      size="large"
      title="Tareas programadas"
      class="w-[min(calc(100vw-40px),600px)] h-[min(calc(100vh-40px),620px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          ZENKAI te avisa con una notificación cada X minutos para recordarte una tarea. Primer paso hacia agentes
          proactivos — por ahora solo te recuerda; correr un agente solo llegará después, con pruebas.
        </p>

        {/* Nueva tarea */}
        <form onSubmit={agregar} class="flex flex-col gap-3 rounded-lg border border-border-base bg-surface-raised p-4">
          <span class="text-13-medium text-text-strong">Nueva tarea</span>
          <input
            type="text"
            value={nombre()}
            onInput={(e) => setNombre(e.currentTarget.value)}
            placeholder="Nombre (ej: Revisar TODOs, Resumen del día…)"
            class={inputClass}
          />
          <textarea
            value={prompt()}
            onInput={(e) => setPrompt(e.currentTarget.value)}
            rows={2}
            placeholder="Qué querés que te recuerde hacer"
            class={`${inputClass} resize-y`}
          />
          <div class="flex items-center gap-2">
            <span class="text-13-regular text-text-muted">Cada</span>
            <input
              type="number"
              min={1}
              value={minutos()}
              onInput={(e) => setMinutos(parseInt(e.currentTarget.value || "0", 10))}
              class={`${inputClass} w-24`}
            />
            <span class="text-13-regular text-text-muted">minutos</span>
            <button
              type="submit"
              class="ml-auto rounded-lg bg-orange-500 px-4 py-2 text-13-medium text-white hover:bg-orange-600"
            >
              Agregar
            </button>
          </div>
        </form>

        {/* Lista */}
        <Show
          when={tareas().length > 0}
          fallback={<span class="text-13-regular text-text-muted">No hay tareas programadas todavía.</span>}
        >
          <div class="flex flex-col gap-2">
            <For each={tareas()}>
              {(t) => (
                <div class="flex items-center gap-3 rounded-md border border-border-base bg-surface-base p-3">
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="text-13-medium text-text-strong">{t.name}</span>
                    <span class="truncate text-12-regular text-text-muted">
                      cada {t.everyMinutes} min · {t.prompt}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    class="shrink-0 rounded-md px-2.5 py-1 text-12-medium"
                    classList={{
                      "bg-green-500/15 text-green-400": t.enabled,
                      "border border-border-base text-text-muted": !t.enabled,
                    }}
                  >
                    {t.enabled ? "Activa" : "Pausada"}
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(t.id)}
                    class="shrink-0 rounded-md border border-border-base px-2.5 py-1 text-12-medium text-text-muted hover:text-red-400"
                  >
                    Borrar
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}
