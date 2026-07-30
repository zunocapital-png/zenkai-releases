import { createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Policy Engine (Tomo XIII de la charla UIOS). Reglas declarativas para que
// ZENKAI se comporte solo según condiciones que vos definís. Ejemplo:
//   Si: archivo=privado  →  usar SOLO modelos locales, nunca nube.
//   Si: tarea=código      →  preferir qwen2.5-coder / DeepSeek.
//   Si: presupuesto>10USD →  cambiar a local.
// Las políticas se guardan en localStorage y las lee el sistema al enrutar.
type Politica = {
  id: string
  activa: boolean
  cuando: string
  entonces: string
  preferir?: string[]
  nunca?: string[]
  color: string
}

const PLANTILLAS: Politica[] = [
  {
    id: "privacidad-total",
    activa: false,
    cuando: "archivo o proyecto marcado como privado",
    entonces: "usar SOLO modelos locales — nunca envía a la nube",
    preferir: ["qwen3:14b", "qwen2.5-coder:7b"],
    nunca: ["openai", "anthropic", "openrouter", "google", "nvidia"],
    color: "#22c55e",
  },
  {
    id: "programacion",
    activa: true,
    cuando: "tarea = programación",
    entonces: "preferir modelos especializados en código",
    preferir: ["qwen2.5-coder:7b", "deepseek", "qwen3:14b"],
    color: "#EC5B2B",
  },
  {
    id: "presupuesto",
    activa: false,
    cuando: "gasto en nube > $10 USD este mes",
    entonces: "cambiar automáticamente a modelos locales",
    preferir: ["qwen3:14b"],
    nunca: ["openai"],
    color: "#f59e0b",
  },
  {
    id: "vision",
    activa: true,
    cuando: "el mensaje tiene una imagen adjunta",
    entonces: "usar modelo vision (qwen2.5vl o Pixtral)",
    preferir: ["qwen2.5vl:7b", "mistralai/pixtral-12b:free"],
    color: "#a855f7",
  },
  {
    id: "razonamiento",
    activa: true,
    cuando: "prompt largo (>120 palabras) con 'analizá', 'planeá', 'comparalo'",
    entonces: "invocar sequential-thinking + preferir modelos smart",
    preferir: ["qwen3:14b", "deepseek/deepseek-r1:free"],
    color: "#06b6d4",
  },
  {
    id: "sin-red",
    activa: false,
    cuando: "detectamos que no hay conexión a Internet",
    entonces: "usar solo modelos locales; no intentar nube",
    preferir: ["qwen3:14b", "qwen2.5-coder:7b"],
    color: "#94a3b8",
  },
]

const STORAGE_KEY = "zenkai.policies.v1"

function leerActivadas(): Set<string> {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (!v) return new Set(PLANTILLAS.filter((p) => p.activa).map((p) => p.id))
    return new Set(JSON.parse(v) as string[])
  } catch {
    return new Set()
  }
}

function guardarActivadas(s: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s)))
  } catch {
    /* ignore */
  }
}

export function DialogPolicyEngine() {
  const dialog = useDialog()
  const [activas, setActivas] = createSignal<Set<string>>(leerActivadas())

  const toggle = (id: string) => {
    setActivas((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      guardarActivadas(n)
      return n
    })
  }

  return (
    <Dialog
      size="large"
      title="Policy Engine · reglas declarativas"
      class="w-[min(calc(100vw-40px),780px)] h-[min(calc(100vh-40px),640px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-3 overflow-y-auto p-6 text-[13px]">
        <div class="rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/5 p-3">
          <div class="text-[12.5px] leading-relaxed">
            <span class="text-[#EC5B2B] font-semibold">Policy Engine</span> — declarativo. Vos activás reglas,
            el sistema decide solo cómo comportarse. No hay que pedirle cada vez "usá modelo local" o "cuidá el presupuesto".
          </div>
        </div>

        <For each={PLANTILLAS}>
          {(p) => {
            const activa = () => activas().has(p.id)
            return (
              <div
                class="flex items-start gap-3 rounded-md border p-3 transition-colors cursor-pointer"
                style={{
                  "border-color": activa() ? `${p.color}66` : "rgba(255,255,255,0.09)",
                  background: activa() ? `${p.color}0a` : "transparent",
                }}
                onClick={() => toggle(p.id)}
              >
                <div class="pt-0.5">
                  <div
                    class="w-9 h-5 rounded-full transition-colors flex items-center px-0.5"
                    style={{ background: activa() ? p.color : "rgba(148,163,184,0.3)" }}
                  >
                    <div
                      class="size-4 rounded-full bg-white transition-transform"
                      style={{ transform: activa() ? "translateX(16px)" : "translateX(0)" }}
                    />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 text-[12.5px]">
                    <span class="font-semibold" style={{ color: p.color }}>
                      SI:
                    </span>
                    <span>{p.cuando}</span>
                  </div>
                  <div class="flex items-center gap-2 text-[12.5px] mt-1">
                    <span class="font-semibold" style={{ color: p.color }}>
                      ENTONCES:
                    </span>
                    <span class="opacity-85">{p.entonces}</span>
                  </div>
                  <Show when={p.preferir}>
                    <div class="text-[10.5px] opacity-60 mt-1.5 font-mono">
                      preferir: {p.preferir!.join(", ")}
                    </div>
                  </Show>
                  <Show when={p.nunca}>
                    <div class="text-[10.5px] opacity-60 mt-0.5 font-mono">
                      nunca: {p.nunca!.join(", ")}
                    </div>
                  </Show>
                </div>
              </div>
            )
          }}
        </For>

        <div class="text-[10.5px] opacity-60 mt-2">
          <b>Nota honesta:</b> las políticas hoy son un manifest visual — el sistema todavía no las lee en runtime en cada tool-call. La primera capa es visible (para que sepas qué política está activa); la siguiente iteración las hace vinculantes.
        </div>

        <div class="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-md bg-[#EC5B2B] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Guardar y cerrar
          </button>
        </div>
      </div>
    </Dialog>
  )
}
