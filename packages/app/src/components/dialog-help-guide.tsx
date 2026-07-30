import { For } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"

// Guía in-app: cómo usar ZENKAI. Se mantiene al día con las funciones de la app.

const SECCIONES: { titulo: string; puntos: (string | { b: string; t: string })[] }[] = [
  {
    titulo: "🧠 Elegir modelo (selector abajo del chat)",
    puntos: [
      { b: "ZENKAI · Auto", t: "elige solo el mejor modelo disponible, sin configurar nada. Muestra cuál está usando (ej. Auto → qwen2.5-coder)." },
      { b: "Descargar modelos locales", t: "dentro del selector: ~140 modelos gratis que corren en tu PC (Ollama). También podés pegar cualquier nombre de ollama.com/library." },
      { b: "Conectar modelos de nube", t: "dentro del selector: OpenRouter, Groq, Gemini, NVIDIA, Cerebras, Mistral. Con OpenRouter solo ya tenés cientos de modelos con una key." },
      { b: "Conectar otra app local", t: "dentro del selector: si ya usás LM Studio, Jan, llama.cpp, vLLM, KoboldCpp o GPT4All, ZENKAI se enchufa a ellos." },
    ],
  },
  {
    titulo: "🤖 Agentes y plantillas (selector de agentes del chat)",
    puntos: [
      { b: "Plantillas por sector", t: "agentes listos (Programación, Datos, Marketing, Escritura, Investigación, Matemática) en un click." },
      { b: "Crear agente", t: "armá tu propio asistente con sus instrucciones y modelo." },
    ],
  },
  {
    titulo: "🛠️ Herramientas (al lado de 'Conectar API')",
    puntos: [
      { b: "🖼 Imagen", t: "generá imágenes 100% local conectando un motor Stable Diffusion (Automatic1111/Forge) en tu PC." },
      { b: "🧩 Skills", t: "conectores MCP que le dan capacidades a la IA: navegador, GitHub, bases de datos, búsqueda web y más." },
    ],
  },
  {
    titulo: "🔒 Permisos (Ajustes → Permisos)",
    puntos: [
      { b: "Por acción", t: "para editar archivos, ejecutar comandos, web, etc.: elegí Preguntar / Permitir / Denegar." },
      { b: "Modo autónomo", t: "la IA actúa sin pedir permiso (rápido; usalo con confianza)." },
      { b: "Control de PC", t: "permití que la IA vea la pantalla y maneje mouse/teclado (como Claude). Apagado por defecto." },
    ],
  },
  {
    titulo: "⚙️ Ajustes → Conectores",
    puntos: [
      "Modelos, Proveedores (APIs), Servidores MCP y Plugins están agrupados ahí. Lo técnico (Performance) queda en 'Avanzado'.",
    ],
  },
  {
    titulo: "🔄 Actualizaciones",
    puntos: [
      "ZENKAI se actualiza solo: cuando hay una versión nueva, la descarga y te pide reiniciar. Es obligatorio para tener siempre lo último.",
    ],
  },
]

const CLAVES: { name: string; url: string }[] = [
  { name: "OpenRouter", url: "openrouter.ai/keys" },
  { name: "Groq", url: "console.groq.com/keys" },
  { name: "Google", url: "aistudio.google.com/app/apikey" },
  { name: "NVIDIA", url: "build.nvidia.com" },
  { name: "Cerebras", url: "cloud.cerebras.ai" },
  { name: "Mistral", url: "console.mistral.ai/api-keys" },
]

export function DialogHelpGuide() {
  return (
    <Dialog
      size="large"
      title="Ayuda · Cómo usar ZENKAI"
      class="w-[min(calc(100vw-40px),680px)] h-[min(calc(100vh-40px),640px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-6 overflow-y-auto p-6 text-14-regular text-text-base">
        <For each={SECCIONES}>
          {(s) => (
            <section class="flex flex-col gap-2">
              <h2 class="text-15-medium text-text-strong">{s.titulo}</h2>
              <ul class="flex flex-col gap-1.5">
                <For each={s.puntos}>
                  {(p) => (
                    <li class="text-13-regular text-text-muted">
                      {typeof p === "string" ? (
                        p
                      ) : (
                        <>
                          <span class="text-text-strong">{p.b}:</span> {p.t}
                        </>
                      )}
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>

        <section class="flex flex-col gap-2">
          <h2 class="text-15-medium text-text-strong">🔑 Sacar una key gratis</h2>
          <ul class="flex flex-col gap-1.5">
            <For each={CLAVES}>
              {(p) => (
                <li class="flex items-baseline gap-2 text-13-regular">
                  <span class="w-24 shrink-0 text-text-strong">{p.name}</span>
                  <span class="select-all font-mono text-text-base">{p.url}</span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </div>
    </Dialog>
  )
}
