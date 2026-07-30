import { createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Dialog explicativo "¿Qué son los MCP?" — para que el usuario no técnico
// entienda de qué se trata en 30 segundos, con analogías reales y ejemplos
// concretos de lo que puede hacer con los MCPs que ya tiene ZENKAI.
const MCPS_INSTALADOS: { nombre: string; icon: string; que: string; ejemplo: string; color: string }[] = [
  {
    nombre: "Filesystem",
    icon: "📁",
    color: "#EC5B2B",
    que: "Deja que la IA lea y escriba archivos de tu compu.",
    ejemplo: "«Leé mi carpeta Descargas y organizame por tipo»",
  },
  {
    nombre: "Fetch",
    icon: "🌐",
    color: "#22c55e",
    que: "La IA puede visitar URLs y traer contenido de la web.",
    ejemplo: "«Traé el HTML de esta página y resumímela»",
  },
  {
    nombre: "Git",
    icon: "🔧",
    color: "#f59e0b",
    que: "La IA lee el estado de tu repo Git (commits, cambios).",
    ejemplo: "«¿Qué cambié desde el commit anterior?»",
  },
  {
    nombre: "Time",
    icon: "🕐",
    color: "#3b82f6",
    que: "Sabe qué día y hora es, y maneja zonas horarias.",
    ejemplo: "«Programá una tarea para mañana 9am»",
  },
  {
    nombre: "Memory",
    icon: "🧠",
    color: "#a855f7",
    que: "Recuerda cosas entre chats (como CLAUDE.md pero automático).",
    ejemplo: "«Recordá que trabajo en TypeScript, no JavaScript»",
  },
  {
    nombre: "Sequential-thinking",
    icon: "🧩",
    color: "#06b6d4",
    que: "Descompone problemas complejos en pasos ordenados.",
    ejemplo: "«Planeá cómo migrar mi app de React a Solid»",
  },
  {
    nombre: "Context7",
    icon: "📚",
    color: "#ec4899",
    que: "Docs siempre actualizadas de librerías (React, Vue, Next…).",
    ejemplo: "«¿Cómo se usa el nuevo hook de Solid?»",
  },
  {
    nombre: "Generar imagen (ZENKAI)",
    icon: "🎨",
    color: "#EC5B2B",
    que: "Crea imágenes desde el chat con Stable Diffusion o API.",
    ejemplo: "«Diseñá un logo minimalista para mi app»",
  },
  {
    nombre: "Control de PC (opcional)",
    icon: "🖥️",
    color: "#94a3b8",
    que: "Deja que la IA mueva mouse / haga clicks. Solo si vos lo prendes.",
    ejemplo: "«Abrí Firefox y buscá 'clima Buenos Aires'»",
  },
]

export function DialogQueSonMcp() {
  const dialog = useDialog()
  const [tab, setTab] = createSignal<"que" | "lista" | "como">("que")

  return (
    <Dialog
      size="large"
      title="MCP — qué son y para qué sirven"
      class="w-[min(calc(100vw-40px),700px)] h-[min(calc(100vh-40px),640px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-[13.5px] text-v2-text-text-base">
        {/* Tabs */}
        <div class="flex gap-1 border-b border-v2-border-border-muted">
          <TabBtn label="¿Qué son?" activo={tab() === "que"} onClick={() => setTab("que")} />
          <TabBtn label="Los que ya tenés" activo={tab() === "lista"} onClick={() => setTab("lista")} />
          <TabBtn label="¿Cómo se usan?" activo={tab() === "como"} onClick={() => setTab("como")} />
        </div>

        <Show when={tab() === "que"}>
          <div class="flex flex-col gap-4">
            <div class="rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/5 p-4">
              <div class="text-[14px] font-semibold text-[#EC5B2B] mb-2">La idea en 1 frase</div>
              <div class="text-[13px] leading-relaxed">
                Un MCP es un <b>enchufe</b> que le da a la IA acceso a algo que sola no puede hacer:
                leer archivos, visitar la web, mover el mouse, generar imágenes, consultar bases de datos, etc.
              </div>
            </div>

            <div class="flex flex-col gap-2 text-[12.5px]">
              <div class="font-semibold text-v2-text-text-strong">Analogía</div>
              <div class="opacity-85">
                Si la IA fuera una persona muy lista pero encerrada en una habitación sin ventanas, los MCPs son <b>puertas</b>:
                una a tu disco, otra a internet, otra a tu Git… Cada MCP prendido = una puerta más.
              </div>
            </div>

            <div class="flex flex-col gap-2 text-[12.5px]">
              <div class="font-semibold text-v2-text-text-strong">¿Vienen instalados en ZENKAI?</div>
              <div class="opacity-85">
                Sí. Hay <b>8 MCPs prendidos por defecto</b> y 2 apagados que podés activar cuando los necesites.
                No hace falta instalar nada manual como en otras apps.
              </div>
            </div>

            <div class="flex flex-col gap-2 text-[12.5px]">
              <div class="font-semibold text-v2-text-text-strong">¿Puedo agregar más?</div>
              <div class="opacity-85">
                Sí, desde <b>Ajustes → Plugins</b>. La comunidad tiene MCPs para casi todo:
                Slack, Notion, Postgres, Docker, Kubernetes, YouTube, Spotify… Se conectan con un comando.
              </div>
            </div>
          </div>
        </Show>

        <Show when={tab() === "lista"}>
          <div class="flex flex-col gap-2">
            <div class="text-[11px] opacity-70 uppercase tracking-wider mb-1">
              MCPs preinstalados — activos por defecto
            </div>
            <For each={MCPS_INSTALADOS}>
              {(m) => (
                <div
                  class="flex items-start gap-3 rounded-md border p-3"
                  style={{ "border-color": "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
                >
                  <div
                    class="flex size-9 shrink-0 items-center justify-center rounded-md text-[18px]"
                    style={{ background: `${m.color}18`, color: m.color }}
                  >
                    {m.icon}
                  </div>
                  <div class="flex flex-col gap-1 min-w-0 flex-1">
                    <div class="text-[13px] font-semibold" style={{ color: m.color }}>
                      {m.nombre}
                    </div>
                    <div class="text-[12px] opacity-85">{m.que}</div>
                    <div class="text-[11.5px] font-mono opacity-70 mt-0.5">
                      <span class="text-[#EC5B2B]">›</span> {m.ejemplo}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={tab() === "como"}>
          <div class="flex flex-col gap-4 text-[13px]">
            <div class="rounded-md border border-v2-border-border-muted p-4">
              <div class="font-semibold text-v2-text-text-strong mb-2">1 · Los MCPs son invisibles</div>
              <div class="opacity-85">
                No los "llamás" vos. Vos escribís lo que necesitás y la IA <b>decide sola</b> qué MCP usar.
              </div>
            </div>
            <div class="rounded-md border border-v2-border-border-muted p-4">
              <div class="font-semibold text-v2-text-text-strong mb-2">2 · Pedile en criollo</div>
              <div class="opacity-85 mb-2">Ejemplos:</div>
              <ul class="flex flex-col gap-1.5 opacity-85 pl-4 text-[12.5px] font-mono">
                <li><span class="text-[#EC5B2B]">›</span> "Leé todos los .md de esta carpeta y hacé un índice"</li>
                <li><span class="text-[#EC5B2B]">›</span> "Andá a react.dev y traé el ejemplo de useMemo"</li>
                <li><span class="text-[#EC5B2B]">›</span> "¿Qué archivos cambié esta semana en Git?"</li>
                <li><span class="text-[#EC5B2B]">›</span> "Generá una imagen: gato astronauta, fondo espacial"</li>
              </ul>
            </div>
            <div class="rounded-md border border-v2-border-border-muted p-4">
              <div class="font-semibold text-v2-text-text-strong mb-2">3 · Prender / apagar</div>
              <div class="opacity-85">
                Andá a <b>Ajustes → Plugins</b> para ver los que están activos y prender los que no.
                Prender uno nuevo = darle una capacidad más a la IA.
              </div>
            </div>
          </div>
        </Show>

        <div class="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-md bg-[#EC5B2B] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
          >
            Entendido
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function TabBtn(props: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="px-3 py-1.5 text-[12.5px] font-medium border-b-2 transition-colors"
      style={{
        "border-color": props.activo ? "#EC5B2B" : "transparent",
        color: props.activo ? "#EC5B2B" : "var(--v2-text-text-muted, #808080)",
      }}
    >
      {props.label}
    </button>
  )
}
