import { For } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Capability Manifest (idea del Tomo II de la charla). Le muestra al usuario en
// UNA vista todo lo que ZENKAI puede hacer: cada capability enrutada a los
// componentes reales (skills, tools, MCPs, sub-agentes, harnesses). Sirve para
// que el usuario NO tenga que adivinar qué le puede pedir a la IA.
type Capacidad = {
  categoria: string
  nombre: string
  descripcion: string
  ejemplo: string
  via: string
  color: string
}

const CAPACIDADES: Capacidad[] = [
  // ── CÓDIGO ──
  { categoria: "Código", nombre: "Escribir código", descripcion: "Escribir funciones, componentes, archivos completos en cualquier lenguaje.", ejemplo: "«Hacé un componente Solid con formulario de login»", via: "modelo", color: "#EC5B2B" },
  { categoria: "Código", nombre: "Refactorizar", descripcion: "Transformar código existente preservando el comportamiento.", ejemplo: "«Convertí este class a hooks»", via: "sub-agente refactor", color: "#EC5B2B" },
  { categoria: "Código", nombre: "Revisar código", descripcion: "Buscar bugs, edge cases y problemas de performance.", ejemplo: "«Revisá este PR y decime qué está mal»", via: "sub-agente reviewer", color: "#EC5B2B" },
  { categoria: "Código", nombre: "Debuggear", descripcion: "Ante un fallo formula hipótesis y propone diagnóstico antes del fix.", ejemplo: "«¿Por qué tira null aquí?»", via: "sub-agente debugger", color: "#EC5B2B" },
  { categoria: "Código", nombre: "Explicar código ajeno", descripcion: "Didáctico, paso a paso, con analogías si hace falta.", ejemplo: "«¿Qué hace esta regex?»", via: "sub-agente explainer", color: "#EC5B2B" },

  // ── ARCHIVOS Y REPO ──
  { categoria: "Archivos y Git", nombre: "Leer/editar archivos", descripcion: "Acceso acotado al proyecto activo.", ejemplo: "«Leé todos los .md de docs y armá índice»", via: "MCP filesystem", color: "#22c55e" },
  { categoria: "Archivos y Git", nombre: "Buscar en el repo", descripcion: "Grep con regex sobre el proyecto entero.", ejemplo: "«¿Dónde está la función authenticate?»", via: "tool grep", color: "#22c55e" },
  { categoria: "Archivos y Git", nombre: "Estado de Git", descripcion: "Status, diff, log, branch.", ejemplo: "«¿Qué cambié desde el último commit?»", via: "MCP git", color: "#22c55e" },
  { categoria: "Archivos y Git", nombre: "Ejecutar bash", descripcion: "Correr tests, builds, scripts. Se pide permiso si el modo lo requiere.", ejemplo: "«Corré los tests unitarios»", via: "tool bash", color: "#22c55e" },

  // ── WEB ──
  { categoria: "Web", nombre: "Buscar en Internet", descripcion: "Búsqueda web sin API key.", ejemplo: "«Buscá cuál es la última versión de Solid»", via: "MCP duckduckgo-search", color: "#3b82f6" },
  { categoria: "Web", nombre: "Traer contenido de URLs", descripcion: "Fetch HTML / JSON / texto plano.", ejemplo: "«Resumime esta página»", via: "MCP fetch", color: "#3b82f6" },
  { categoria: "Web", nombre: "Docs actualizadas", descripcion: "Docs oficiales de librerías populares.", ejemplo: "«¿Cómo se usa createResource en Solid?»", via: "MCP context7", color: "#3b82f6" },
  { categoria: "Web", nombre: "Wikipedia", descripcion: "Buscar artículos enciclopédicos.", ejemplo: "«Explicame qué es el paradigma reactivo»", via: "MCP wikipedia", color: "#3b82f6" },
  { categoria: "Web", nombre: "Clima", descripcion: "Actual y pronóstico, sin key (Open-Meteo).", ejemplo: "«¿Cómo va a estar mañana en Buenos Aires?»", via: "MCP weather", color: "#3b82f6" },
  { categoria: "Web", nombre: "YouTube", descripcion: "Transcripciones y búsqueda de videos.", ejemplo: "«Resumime este video: <url>»", via: "MCP youtube", color: "#3b82f6" },

  // ── CREATIVO ──
  { categoria: "Creativo", nombre: "Generar imágenes", descripcion: "SD local o API cloud según config.", ejemplo: "«Diseñá un logo minimalista»", via: "MCP zenkai-image", color: "#a855f7" },
  { categoria: "Creativo", nombre: "Diseñar UI", descripcion: "Propuestas de layout, colores y componentes.", ejemplo: "«Diseñame una landing con hero y features»", via: "sub-agente designer", color: "#a855f7" },
  { categoria: "Creativo", nombre: "Galería de plantillas", descripcion: "Plantillas listas para usar como prompt.", ejemplo: "«Mostrame la galería de diseños»", via: "slash /disenos", color: "#a855f7" },

  // ── COGNITIVO ──
  { categoria: "Cognitivo (harnesses)", nombre: "Reflexionar sobre su respuesta", descripcion: "Evalúa la propia respuesta antes de entregarla.", ejemplo: "«Revisá tu propia respuesta y mejorala»", via: "sub-agente reflector", color: "#f59e0b" },
  { categoria: "Cognitivo (harnesses)", nombre: "Cazar alucinaciones", descripcion: "Busca ACTIVAMENTE errores e invenciones en su propia respuesta.", ejemplo: "«Verificá si inventaste algo»", via: "sub-agente refutador", color: "#f59e0b" },
  { categoria: "Cognitivo (harnesses)", nombre: "Investigar hechos", descripcion: "Consulta docs y web antes de responder algo que puede cambiar.", ejemplo: "«¿Sigue siendo válido lo que decís?»", via: "sub-agente investigador", color: "#f59e0b" },
  { categoria: "Cognitivo (harnesses)", nombre: "Comparar respuestas", descripcion: "Recibe 2 respuestas alternativas y elige la mejor con criterio.", ejemplo: "«Compará estas dos opciones»", via: "sub-agente jurado", color: "#f59e0b" },
  { categoria: "Cognitivo (harnesses)", nombre: "Descomponer en pasos", descripcion: "Divide problemas complejos antes de responder.", ejemplo: "«Planeá cómo migrar de X a Y»", via: "MCP sequential-thinking", color: "#f59e0b" },

  // ── MEMORIA ──
  { categoria: "Memoria", nombre: "Recordar entre chats", descripcion: "Knowledge-graph local persistente.", ejemplo: "«Recordá que uso pnpm, no npm»", via: "MCP memory", color: "#06b6d4" },
  { categoria: "Memoria", nombre: "Buscar por similitud", descripcion: "Embeddings locales (nomic-embed-text).", ejemplo: "Automático — la IA busca lo relevante", via: "memory-injection", color: "#06b6d4" },

  // ── AVANZADO ──
  { categoria: "Avanzado (opcionales)", nombre: "Automatizar navegador", descripcion: "Playwright / Puppeteer para scraping o testing UI.", ejemplo: "«Testeá el login y capturá»", via: "MCP playwright / puppeteer", color: "#94a3b8" },
  { categoria: "Avanzado (opcionales)", nombre: "Consultar SQLite", descripcion: "SQL sobre bases locales.", ejemplo: "«¿Qué tablas tiene ~/data.db?»", via: "MCP sqlite", color: "#94a3b8" },
  { categoria: "Avanzado (opcionales)", nombre: "Control de PC", descripcion: "Mover mouse, teclado. Solo si vos lo activás.", ejemplo: "«Abrí Firefox y andá a X»", via: "MCP zenkai-computer", color: "#94a3b8" },
]

const CATEGORIAS = Array.from(new Set(CAPACIDADES.map((c) => c.categoria)))

export function DialogCapacidades() {
  const dialog = useDialog()

  return (
    <Dialog
      size="large"
      title="Capabilities — qué sabe hacer ZENKAI"
      class="w-[min(calc(100vw-40px),820px)] h-[min(calc(100vh-40px),680px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-[13px] text-v2-text-text-base">
        <div class="rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/5 p-3">
          <div class="text-[12.5px] leading-relaxed">
            <span class="text-[#EC5B2B] font-semibold">{CAPACIDADES.length} capacidades</span>{" "}
            enrutadas al modelo, sub-agentes y MCPs. No tenés que activarlas — la IA elige sola cuál usar según lo que pidas.
          </div>
        </div>

        <For each={CATEGORIAS}>
          {(cat) => {
            const items = CAPACIDADES.filter((c) => c.categoria === cat)
            const color = items[0]?.color ?? "#EC5B2B"
            return (
              <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                  <span class="inline-block size-1.5 rounded-full" style={{ background: color }} />
                  <span class="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>
                    {cat}
                  </span>
                  <span class="text-[10.5px] opacity-50">{items.length}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <For each={items}>
                    {(c) => (
                      <div class="rounded-md border border-v2-border-border-muted p-3 flex flex-col gap-1">
                        <div class="text-[12.5px] font-semibold" style={{ color: c.color }}>
                          {c.nombre}
                        </div>
                        <div class="text-[11.5px] opacity-85 leading-snug">{c.descripcion}</div>
                        <div class="text-[10.5px] font-mono opacity-60 mt-0.5">
                          <span class="text-[#EC5B2B]">›</span> {c.ejemplo}
                        </div>
                        <div class="text-[9.5px] uppercase tracking-wider opacity-45 mt-0.5">vía: {c.via}</div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )
          }}
        </For>

        <div class="flex justify-end pt-2 sticky bottom-0 bg-v2-background-bg-base">
          <button
            type="button"
            onClick={() => dialog.close()}
            class="rounded-md bg-[#EC5B2B] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Dialog>
  )
}
