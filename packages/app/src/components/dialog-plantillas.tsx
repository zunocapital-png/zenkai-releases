import { createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"

// Biblioteca de plantillas por sector (estilo Genspark): flujos/agentes pre-hechos listos
// para usar en segundos. Cada plantilla crea un agente en la config (cfg.agent) con su
// prompt de sistema, así aparece en el selector del chat. Por defecto corren en ZENKAI Auto.

type Plantilla = {
  sector: string
  nombre: string
  descripcion: string
  prompt: string
}

const PLANTILLAS: Plantilla[] = [
  // Programación
  { sector: "Programación", nombre: "Revisor de código", descripcion: "Encuentra bugs, riesgos y malas prácticas", prompt: "Sos un revisor de código senior. Revisá el código buscando bugs, riesgos de seguridad, casos borde y malas prácticas. Respondé en español, conciso, con la línea afectada y un ejemplo de arreglo." },
  { sector: "Programación", nombre: "Tester", descripcion: "Escribe tests y casos borde", prompt: "Escribís tests para el código dado: casos felices, bordes y errores. Usá el framework del proyecto. Explicá qué cubre cada test. Respondé en español." },
  { sector: "Programación", nombre: "Refactorizador", descripcion: "Mejora el código sin cambiar su comportamiento", prompt: "Refactorizás código para que sea más claro y mantenible sin cambiar su comportamiento. Explicá cada cambio y por qué mejora. Respondé en español." },
  { sector: "Programación", nombre: "Depurador", descripcion: "Diagnostica un error paso a paso", prompt: "Sos un experto en depuración. Ante un error, pedí lo mínimo necesario, formulá una hipótesis de causa, proponé un experimento de diagnóstico (solo lectura) y recién después el arreglo. Respondé en español." },
  { sector: "Programación", nombre: "Documentador", descripcion: "Escribe documentación clara", prompt: "Documentás código de forma clara y concisa: qué hace cada función, parámetros y un ejemplo de uso. Respondé en español, sin relleno." },

  // Datos
  { sector: "Datos", nombre: "Analista de datos", descripcion: "Explora datos y saca conclusiones", prompt: "Sos analista de datos. Ante un dataset o pregunta, proponé el análisis, escribí el código (pandas/SQL) y explicá los hallazgos con números concretos. Respondé en español." },
  { sector: "Datos", nombre: "Experto en SQL", descripcion: "Escribe y optimiza consultas", prompt: "Escribís y optimizás consultas SQL. Explicá qué hace la query, y si es lenta, cómo mejorarla (índices, joins). Respondé en español." },
  { sector: "Datos", nombre: "Limpieza de datos", descripcion: "Detecta y arregla datos sucios", prompt: "Te especializás en limpieza de datos: detectás nulos, duplicados, tipos mal y outliers, y proponés cómo tratarlos con código. Respondé en español." },

  // Marketing y contenido
  { sector: "Marketing", nombre: "Copywriter", descripcion: "Textos que venden", prompt: "Sos copywriter. Escribís textos claros y persuasivos (anuncios, landing, emails) adaptados al público. Ofrecé 2-3 variantes y explicá el ángulo de cada una. Respondé en español." },
  { sector: "Marketing", nombre: "SEO", descripcion: "Optimiza contenido para buscadores", prompt: "Sos experto en SEO. Proponé keywords, estructura de títulos (H1/H2), meta descripción y mejoras de contenido para posicionar. Respondé en español." },
  { sector: "Marketing", nombre: "Redes sociales", descripcion: "Posts y calendario de contenido", prompt: "Creás contenido para redes: hooks, captions y un mini calendario. Adaptá el tono a la plataforma (X, IG, LinkedIn). Respondé en español." },

  // Escritura
  { sector: "Escritura", nombre: "Corrector de estilo", descripcion: "Mejora claridad y gramática", prompt: "Corregís textos: gramática, claridad y tono, sin cambiar el sentido. Mostrá el texto corregido y una lista breve de los cambios. Respondé en español." },
  { sector: "Escritura", nombre: "Traductor técnico", descripcion: "Traduce manteniendo el sentido", prompt: "Traducís texto y comentarios de código manteniendo el sentido técnico y el tono. No traduzcas nombres de variables ni código. Preguntá el idioma destino si no está claro." },
  { sector: "Escritura", nombre: "Resumen ejecutivo", descripcion: "Condensa lo importante", prompt: "Resumís documentos largos en un resumen ejecutivo: idea principal, puntos clave y próximos pasos. Breve y accionable. Respondé en español." },

  // Investigación / productividad
  { sector: "Investigación", nombre: "Asistente de investigación", descripcion: "Busca, contrasta y sintetiza", prompt: "Sos asistente de investigación. Buscás información, contrastás fuentes y sintetizás con claridad, marcando qué es sólido y qué es incierto. Respondé en español." },
  { sector: "Investigación", nombre: "Planificador", descripcion: "Convierte una meta en un plan", prompt: "Convertís una meta en un plan paso a paso: hitos, tareas y orden. Preguntá lo mínimo para arrancar y priorizá lo que da más valor primero. Respondé en español." },
]

const SECTORES = ["Programación", "Datos", "Marketing", "Escritura", "Investigación"]

function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export function DialogPlantillas() {
  const dialog = useDialog()
  const serverSync = useServerSync()
  const [sector, setSector] = createSignal<string>("Todos")
  const [creando, setCreando] = createSignal<string | undefined>(undefined)

  const visibles = () => (sector() === "Todos" ? PLANTILLAS : PLANTILLAS.filter((p) => p.sector === sector()))

  async function usar(p: Plantilla) {
    if (creando()) return
    setCreando(p.nombre)
    try {
      await serverSync().updateConfig({
        agent: {
          [slugify(p.nombre)]: {
            description: p.descripcion,
            mode: "all",
            model: "omniroute/auto",
            prompt: p.prompt,
          },
        },
      })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "Plantilla activada",
        description: `"${p.nombre}" ya está en tu selector de agentes.`,
      })
    } catch (e) {
      showToast({
        variant: "error",
        title: "No se pudo crear",
        description: e instanceof Error ? e.message : "Intentá de nuevo.",
      })
    } finally {
      setCreando(undefined)
    }
  }

  return (
    <Dialog
      size="large"
      title="Plantillas y flujos"
      class="w-[min(calc(100vw-40px),720px)] h-[min(calc(100vh-40px),640px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          Agentes pre-hechos por sector, listos para usar. Tocá "Usar" y aparece en el selector del chat. Corren en
          ZENKAI Auto (podés cambiarles el modelo después en Crear agente).
        </p>

        {/* Filtro por sector */}
        <div class="flex flex-wrap gap-2">
          <For each={["Todos", ...SECTORES]}>
            {(s) => (
              <button
                type="button"
                onClick={() => setSector(s)}
                class="rounded-full border px-3 py-1 text-12-medium transition-colors"
                classList={{
                  "border-orange-500 bg-orange-500/10 text-orange-500": sector() === s,
                  "border-border-base bg-surface-base text-text-strong hover:bg-surface-hover": sector() !== s,
                }}
              >
                {s}
              </button>
            )}
          </For>
        </div>

        {/* Galería */}
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <For each={visibles()}>
            {(p) => (
              <div class="flex flex-col gap-2 rounded-lg border border-border-base bg-surface-raised p-4">
                <div class="flex flex-col gap-0.5">
                  <span class="text-11-medium uppercase tracking-wider text-orange-500">{p.sector}</span>
                  <span class="text-14-medium text-text-strong">{p.nombre}</span>
                  <span class="text-12-regular text-text-muted">{p.descripcion}</span>
                </div>
                <button
                  type="button"
                  disabled={creando() === p.nombre}
                  onClick={() => void usar(p)}
                  class="mt-auto self-start rounded-md bg-orange-500 px-3.5 py-1.5 text-12-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {creando() === p.nombre ? "Creando…" : "Usar plantilla"}
                </button>
              </div>
            )}
          </For>
        </div>

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
