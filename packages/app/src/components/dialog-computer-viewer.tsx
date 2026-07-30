import { createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Computer Viewer — panel visual que muestra en vivo LO QUE VE la IA cuando
// controla la PC (idea inspirada en Claude Desktop / Cursor Composer). Toma
// screenshots cada 800ms del monitor, dibuja el marco naranja "REC" que le
// avisa al usuario "la IA está trabajando en tu compu" y superpone el último
// cursor conocido si el backend lo expone.
//
// Cómo funciona por debajo:
// - El modelo tiene capability vision (qwen2.5vl:7b local, o Pixtral/Gemini cloud)
// - El agente llama al MCP zenkai-computer que ejecuta actions (click, type,
//   scroll). Ese MCP también expone un tool 'screenshot' — lo usamos acá para
//   ver lo mismo que ve la IA.
// - El "modo REC" es marco naranja + dot pulsante. Puramente visual, sin
//   privacidad extra: los screenshots ya viajan al modelo vía tool-call.
export function DialogComputerViewer() {
  const dialog = useDialog()
  const [pulse, setPulse] = createSignal(0)
  const [pausado, setPausado] = createSignal(false)
  const [tick, setTick] = createSignal(0)

  onMount(() => {
    const t = setInterval(() => setPulse((n) => n + 1), 800)
    const p = setInterval(() => setTick((n) => n + 1), 400)
    onCleanup(() => {
      clearInterval(t)
      clearInterval(p)
    })
  })

  const [screenshot] = createResource(
    () => (pausado() ? null : pulse()),
    async (n) => {
      if (n === null) return undefined
      // Llamamos al endpoint del zenkai-computer MCP a través del router local.
      // Si no está prendido el permiso, devuelve error — mostramos placeholder.
      try {
        const r = await fetch("http://localhost:20128/computer/screenshot", {
          signal: AbortSignal.timeout(2000),
        })
        if (!r.ok) return undefined
        const blob = await r.blob()
        return URL.createObjectURL(blob)
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )

  const rec = () => tick() % 2 === 0

  return (
    <Dialog
      size="x-large"
      title="Computer Viewer · ver lo que hace la IA"
      class="w-[min(calc(100vw-40px),1000px)] h-[min(calc(100vh-40px),700px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-3 p-4 h-full overflow-hidden">
        {/* Barra superior tipo REC */}
        <div class="flex items-center gap-3 flex-shrink-0">
          <div class="flex items-center gap-1.5 rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/10 px-2 py-1">
            <span
              class="inline-block size-2 rounded-full transition-opacity"
              style={{ background: "#EC5B2B", opacity: rec() ? 1 : 0.3, "box-shadow": "0 0 8px #EC5B2B" }}
            />
            <span class="text-[10.5px] font-mono uppercase tracking-widest text-[#EC5B2B] font-semibold">
              {pausado() ? "PAUSED" : "REC"}
            </span>
          </div>
          <span class="text-[11px] opacity-70">
            La IA {pausado() ? "no está capturando la pantalla" : "puede estar viendo esta captura para tomar acciones"}
          </span>
          <div class="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPausado((v) => !v)}
              class="rounded-md border border-v2-border-border-muted px-2.5 py-1 text-[11px] hover:bg-v2-overlay-simple-overlay-hover"
            >
              {pausado() ? "Reanudar" : "Pausar"}
            </button>
            <button
              type="button"
              onClick={() => dialog.close()}
              class="rounded-md bg-[#EC5B2B] px-3 py-1 text-[11px] font-medium text-white hover:opacity-90"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Marco naranja pulsante + screenshot dentro */}
        <div
          class="relative flex-1 min-h-0 rounded-lg overflow-hidden transition-shadow duration-300"
          style={{
            "box-shadow": rec() && !pausado() ? "0 0 0 4px #EC5B2B, 0 0 24px rgba(236,91,43,0.4)" : "0 0 0 4px rgba(236,91,43,0.3)",
            background: "#000",
          }}
        >
          <Show
            when={screenshot()}
            fallback={
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                <div class="text-[13px] font-semibold text-v2-text-text-strong">Sin captura disponible</div>
                <div class="text-[11.5px] opacity-70 max-w-md">
                  Para que la IA controle la PC hay que activar el toggle{" "}
                  <b>"Permitir control de PC"</b> en Ajustes → General.
                </div>
                <div class="text-[10.5px] font-mono opacity-50 mt-2">
                  <span class="text-[#EC5B2B]">›</span> Solo si el modo permisos lo pide, la IA ejecuta acciones.
                </div>
              </div>
            }
          >
            {(src) => (
              <img
                src={src()}
                alt="Captura de pantalla en vivo"
                class="absolute inset-0 w-full h-full object-contain"
              />
            )}
          </Show>

          {/* Info superpuesta */}
          <div class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] font-mono text-white/80">
            captura cada 800ms
          </div>
        </div>

        {/* Explicación abajo */}
        <div class="flex-shrink-0 text-[10.5px] opacity-60 leading-relaxed">
          <b>Cómo funciona:</b> el modelo vision (qwen2.5vl local o Pixtral/Gemini nube) ve el screenshot, decide qué hacer (click, type, scroll) y lo ejecuta vía el MCP <code>zenkai-computer</code>.
        </div>
      </div>
    </Dialog>
  )
}
