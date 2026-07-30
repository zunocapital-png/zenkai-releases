import { createResource, createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { descubrirServicios, type ServicioDetectado } from "@/utils/auto-discovery"

// OneClick Setup — el UNICO wizard que necesitás para dejar la app usable.
// En 3 pasos hace todo lo que antes requería ir a 5 sitios distintos:
//   1. Detecta hardware (RAM/VRAM/CPU) y sugiere modelo local
//   2. Detecta servicios locales (Docker, Postgres, etc.) y sugiere MCPs
//   3. Muestra cómo conectar API keys de nube (con links directos)
// Todo desde acá. Un botón "Terminar" al final. Cero fricción.

type Paso = 1 | 2 | 3 | 4

type Hardware = {
  ramGB?: number
  vramGB?: number | null
  cpuCores?: number
}

async function detectarHardware(): Promise<Hardware> {
  const platform = (window as unknown as { platform?: { analyzeHardware?: () => Promise<Hardware> } }).platform
  if (!platform?.analyzeHardware) return {}
  try {
    return await platform.analyzeHardware()
  } catch {
    return {}
  }
}

const PROVEEDORES_NUBE = [
  { id: "openrouter", nombre: "OpenRouter", url: "https://openrouter.ai/keys", tier: "GRATIS · decenas de modelos free" },
  { id: "groq", nombre: "Groq", url: "https://console.groq.com/keys", tier: "GRATIS · 30 req/min" },
  { id: "nvidia", nombre: "NVIDIA NIM", url: "https://build.nvidia.com", tier: "GRATIS · modelos 400B+" },
  { id: "google", nombre: "Google Gemini", url: "https://aistudio.google.com/apikey", tier: "GRATIS · generoso" },
  { id: "together", nombre: "Together AI", url: "https://api.together.xyz", tier: "GRATIS · crédito inicial" },
  { id: "mistral", nombre: "Mistral", url: "https://console.mistral.ai/api-keys", tier: "GRATIS · tier básico" },
]

export function DialogOneClickSetup() {
  const dialog = useDialog()
  const [paso, setPaso] = createSignal<Paso>(1)

  const [hw] = createResource(detectarHardware)
  const [servicios] = createResource(descubrirServicios, { initialValue: [] as ServicioDetectado[] })

  const modeloSugerido = () => {
    const r = hw()?.ramGB ?? 0
    if (r >= 32) return { id: "qwen3:14b", size: "9 GB", nota: "Recomendado — máxima calidad local" }
    if (r >= 16) return { id: "qwen3:8b", size: "5 GB", nota: "Balance calidad/velocidad" }
    if (r >= 8) return { id: "qwen2.5-coder:7b", size: "4 GB", nota: "Especializado en código" }
    return { id: "qwen2.5:7b", size: "4 GB", nota: "Base equilibrada" }
  }

  const detectados = () => servicios().filter((s) => s.detectado)

  return (
    <Dialog
      size="large"
      title="ZENKAI · Setup en un click"
      class="w-[min(calc(100vw-40px),720px)] h-[min(calc(100vh-40px),620px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 font-mono text-[13px]">
        {/* Stepper */}
        <div class="flex items-center gap-2 pb-2 border-b border-v2-border-border-muted">
          <For each={[1, 2, 3, 4] as Paso[]}>
            {(n) => (
              <>
                <div
                  class="flex items-center gap-2 text-[11px]"
                  style={{ color: n === paso() ? "#EC5B2B" : n < paso() ? "#22c55e" : "var(--v2-text-text-faint)" }}
                >
                  <span
                    class="inline-flex items-center justify-center size-5 rounded-full font-semibold text-[10px] border"
                    style={{
                      "border-color": n === paso() ? "#EC5B2B" : n < paso() ? "#22c55e" : "currentColor",
                      background: n < paso() ? "#22c55e22" : "transparent",
                    }}
                  >
                    {n < paso() ? "✓" : n}
                  </span>
                  <span class="hidden md:inline">
                    {n === 1 && "Escaneo PC"}
                    {n === 2 && "Modelo local"}
                    {n === 3 && "Nube (opcional)"}
                    {n === 4 && "Listo"}
                  </span>
                </div>
                <Show when={n < 4}>
                  <span class="flex-1 h-px" style={{ background: n < paso() ? "#22c55e44" : "var(--v2-border-border-muted)" }} />
                </Show>
              </>
            )}
          </For>
        </div>

        {/* Paso 1: Escaneo */}
        <Show when={paso() === 1}>
          <div class="flex flex-col gap-3">
            <div class="text-[14px] font-semibold text-v2-text-text-strong">Paso 1 — Analizamos tu equipo</div>
            <div class="rounded-md border border-v2-border-border-muted p-4">
              <Show
                when={hw()}
                fallback={<div class="text-[11px] opacity-60">Escaneando hardware…</div>}
              >
                {(h) => (
                  <div class="grid grid-cols-3 gap-3 text-center">
                    <FichaMini label="RAM" valor={h().ramGB ? `${h().ramGB} GB` : "—"} />
                    <FichaMini label="VRAM" valor={h().vramGB ? `${h().vramGB} GB` : "no dedicada"} />
                    <FichaMini label="Cores" valor={h().cpuCores ? String(h().cpuCores) : "—"} />
                  </div>
                )}
              </Show>
            </div>
            <Show when={detectados().length > 0}>
              <div class="text-[12px] opacity-85">
                También detectamos: {detectados().map((s) => s.nombre).join(", ")}. Podemos activar los MCPs correspondientes.
              </div>
            </Show>
          </div>
        </Show>

        {/* Paso 2: Modelo local */}
        <Show when={paso() === 2}>
          <div class="flex flex-col gap-3">
            <div class="text-[14px] font-semibold text-v2-text-text-strong">Paso 2 — Modelo local</div>
            <div class="rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/5 p-4">
              <div class="text-[11px] text-[#EC5B2B] uppercase tracking-wider mb-1">Recomendado para tu PC</div>
              <div class="text-[15px] font-semibold text-v2-text-text-strong">{modeloSugerido().id}</div>
              <div class="text-[11.5px] opacity-75 mt-0.5">
                {modeloSugerido().size} · {modeloSugerido().nota}
              </div>
              <div class="text-[10.5px] opacity-60 mt-2">
                Ollama viene con la app. El modelo se descarga la primera vez desde Ajustes → Modelos.
              </div>
            </div>
            <div class="text-[11px] opacity-70">
              También podés usar solo la nube (siguiente paso) y saltar esto.
            </div>
          </div>
        </Show>

        {/* Paso 3: Nube (opcional) */}
        <Show when={paso() === 3}>
          <div class="flex flex-col gap-3">
            <div class="text-[14px] font-semibold text-v2-text-text-strong">Paso 3 — Nube gratis (opcional)</div>
            <div class="text-[11.5px] opacity-75">
              Todos estos proveedores tienen tier gratis. Vas al link, sacás la key, la pegás en Ajustes → Proveedores.
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <For each={PROVEEDORES_NUBE}>
                {(p) => (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    class="flex flex-col rounded-md border border-v2-border-border-muted p-2.5 hover:border-[#EC5B2B]/50 hover:bg-[#EC5B2B]/5 transition-colors"
                  >
                    <div class="flex items-center gap-2">
                      <span class="text-[12.5px] font-semibold text-v2-text-text-strong">{p.nombre}</span>
                      <span class="ml-auto text-[9px] opacity-60">↗</span>
                    </div>
                    <div class="text-[10.5px] opacity-70 mt-0.5">{p.tier}</div>
                  </a>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Paso 4: Listo */}
        <Show when={paso() === 4}>
          <div class="flex flex-col items-center gap-4 py-6">
            <div class="text-[24px] font-mono text-[#22c55e]">[ TODO LISTO ]</div>
            <div class="text-[13px] text-center opacity-85 max-w-md">
              Ya podés empezar. La IA local corre con Ollama, la nube se conecta con tus keys cuando quieras, y todo el estado se ve en <b>/estado</b>.
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px] w-full max-w-md mt-2">
              <div class="rounded-md border border-v2-border-border-muted p-2">
                <span class="text-[#EC5B2B] font-mono">/estado</span> — ver todo on/off
              </div>
              <div class="rounded-md border border-v2-border-border-muted p-2">
                <span class="text-[#EC5B2B] font-mono">/capacidades</span> — qué sabe hacer
              </div>
              <div class="rounded-md border border-v2-border-border-muted p-2">
                <span class="text-[#EC5B2B] font-mono">/ayuda</span> — guía completa
              </div>
              <div class="rounded-md border border-v2-border-border-muted p-2">
                <span class="text-[#EC5B2B] font-mono">/observability</span> — motor en vivo
              </div>
            </div>
          </div>
        </Show>

        {/* Navegación */}
        <div class="flex items-center gap-2 mt-auto pt-3 border-t border-v2-border-border-muted">
          <Show when={paso() > 1}>
            <button
              type="button"
              onClick={() => setPaso((paso() - 1) as Paso)}
              class="rounded-md border border-v2-border-border-muted px-3 py-1.5 text-[11.5px]"
            >
              ← Atrás
            </button>
          </Show>
          <button
            type="button"
            onClick={() => dialog.close()}
            class="text-[11px] opacity-60 hover:opacity-100 ml-auto"
          >
            Saltar
          </button>
          <Show
            when={paso() < 4}
            fallback={
              <button
                type="button"
                onClick={() => dialog.close()}
                class="rounded-md bg-[#EC5B2B] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
              >
                Empezar
              </button>
            }
          >
            <button
              type="button"
              onClick={() => setPaso((paso() + 1) as Paso)}
              class="rounded-md bg-[#EC5B2B] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              Siguiente →
            </button>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}

function FichaMini(props: { label: string; valor: string }) {
  return (
    <div>
      <div class="text-[10px] uppercase tracking-wider opacity-60">{props.label}</div>
      <div class="text-[15px] font-semibold text-[#EC5B2B] mt-0.5">{props.valor}</div>
    </div>
  )
}
