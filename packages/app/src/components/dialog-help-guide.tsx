import { For } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"

// Guía in-app: cómo conseguir y conectar modelos y APIs en ZENKAI.
const PROVIDERS: { name: string; url: string }[] = [
  { name: "NVIDIA", url: "build.nvidia.com" },
  { name: "OpenRouter", url: "openrouter.ai/keys" },
  { name: "Groq", url: "console.groq.com/keys" },
  { name: "Google", url: "aistudio.google.com/app/apikey" },
]

const BADGES: { label: string; desc: string }[] = [
  { label: "Local", desc: "modelo offline (Ollama), sin key." },
  { label: "Sin API", desc: "modelo de nube gratis, sin key." },
  { label: "Key gratis", desc: "gratis, pero hay que conectar una key." },
  { label: "Con API", desc: "key de pago." },
]

export function DialogHelpGuide() {
  return (
    <Dialog
      size="large"
      title="Ayuda · Modelos y APIs"
      class="w-[min(calc(100vw-40px),640px)] h-[min(calc(100vh-40px),560px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-6 overflow-y-auto p-6 text-14-regular text-text-base">
        <section class="flex flex-col gap-2">
          <h2 class="text-16-medium text-text-strong">Modelos locales y de nube</h2>
          <p>
            ZENKAI funciona con modelos <b>locales</b> (Ollama, offline, sin conexión) y con modelos de <b>nube</b>. Podés
            elegir el modelo desde el selector <b>ZENKAI</b> en la barra de escritura.
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-16-medium text-text-strong">Auto: sin configurar nada</h2>
          <p>
            <b>Auto (ZENKAI Auto)</b> funciona sin ninguna key: elige automáticamente el mejor modelo gratuito
            disponible. Es la opción recomendada para empezar.
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-16-medium text-text-strong">Conectar una API key gratis</h2>
          <p>
            Para modelos de nube con más límite, conectá una API key gratuita de alguno de estos proveedores. Creá una
            cuenta gratis y copiá la key desde:
          </p>
          <ul class="flex flex-col gap-1.5">
            <For each={PROVIDERS}>
              {(p) => (
                <li class="flex items-baseline gap-2">
                  <span class="w-24 shrink-0 text-text-strong">{p.name}</span>
                  <span class="select-all font-mono text-text-base">{p.url}</span>
                </li>
              )}
            </For>
          </ul>
          <p class="mt-1">
            Después, en la app: <b>menú de modelo → Conectar proveedor → pegá la key</b>. También tenés el botón{" "}
            <b>🔌 Conectar API</b> al lado del selector de modelo.
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-16-medium text-text-strong">Qué significan los badges</h2>
          <ul class="flex flex-col gap-1.5">
            <For each={BADGES}>
              {(b) => (
                <li class="flex items-baseline gap-2">
                  <span class="w-24 shrink-0 text-text-strong">{b.label}</span>
                  <span>{b.desc}</span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </div>
    </Dialog>
  )
}
