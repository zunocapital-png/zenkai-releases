import { createSignal, For, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Dialog `/comandos` — catálogo completo de slashes con descripción y ejemplo.
// Es 100% estático (no hace fetch): la fuente de verdad son los propios comandos
// registrados en use-session-commands. Se mantiene sincronizado a mano — pequeño
// costo a cambio de un UI ultra-rápido sin dependencias.
//
// Organizado por categoría para que sea fácil escanear.

type Comando = {
  slash: string
  titulo: string
  descripcion: string
  ejemplo?: string
}

type Categoria = {
  nombre: string
  color: string
  comandos: Comando[]
}

const CATEGORIAS: Categoria[] = [
  {
    nombre: "Motor local propio",
    color: "#ff6b35",
    comandos: [
      { slash: "/motor", titulo: "Zenkai Engine", descripcion: "Gestor de modelos GGUF: descarga, carga, unload, borrar. Muestra tok/s y RAM/GPU en vivo.", ejemplo: "/motor → descargar Qwen 2.5 Coder 7B" },
      { slash: "/costos", titulo: "Cost Tracker", descripcion: "Costo USD por provider, health scores, budget usado. Solo se llena si usás nube.", ejemplo: "/costos" },
      { slash: "/estado", titulo: "Estado integral", descripcion: "Vista global de todo: motor, sesiones, memoria, permisos.", ejemplo: "/estado" },
      { slash: "/setup", titulo: "Setup en 1 click", descripcion: "Escanea PC, sugiere el mejor modelo local para tu hardware, links a nube.", ejemplo: "/setup" },
    ],
  },
  {
    nombre: "Sub-agentes cognitivos",
    color: "#c678dd",
    comandos: [
      { slash: "/reflexionar", titulo: "Reflector", descripcion: "Otro modelo re-lee la respuesta anterior, la puntúa 0-10 y sugiere mejora. Detecta errores factuales o de tono.", ejemplo: "/reflexionar (después de una respuesta)" },
      { slash: "/reparar", titulo: "Auto-repair loop", descripcion: "Corre un test. Si falla, el LLM propone un fix, se aplica y se re-testea hasta pasar (max N intentos).", ejemplo: "/reparar bun test" },
      { slash: "/parliament", titulo: "AI Parliament", descripcion: "Consulta a N modelos en paralelo con la misma pregunta sí/no. Vota por mayoría con confianza y desempate.", ejemplo: "/parliament ¿es seguro borrar?" },
      { slash: "/sandbox", titulo: "Cognitive Sandbox", descripcion: "Corre código Node/Python/Bash aislado. Timeout duro, env whitelist, sin shell.", ejemplo: "/sandbox → probar snippet Python" },
    ],
  },
  {
    nombre: "Observabilidad",
    color: "#4ade80",
    comandos: [
      { slash: "/observability", titulo: "Observability Center", descripcion: "Timeline de eventos, latencia por provider, cache hits, health en tiempo real.", ejemplo: "/observability" },
      { slash: "/capacidades", titulo: "Capability Manifest", descripcion: "Lo que ZENKAI puede hacer HOY en tu sistema: modelos, tools, MCPs, GPU.", ejemplo: "/capacidades" },
      { slash: "/computer", titulo: "Computer Viewer", descripcion: "Preview del control de PC (screenshots, apps abiertas, cursores).", ejemplo: "/computer" },
    ],
  },
  {
    nombre: "Sesión y contexto",
    color: "#61afef",
    comandos: [
      { slash: "/new", titulo: "Nueva sesión", descripcion: "Empieza un chat limpio sin arrastrar contexto anterior.", ejemplo: "/new" },
      { slash: "/fork", titulo: "Fork", descripcion: "Duplica la sesión actual y sigue en la copia sin tocar la original.", ejemplo: "/fork" },
      { slash: "/undo", titulo: "Undo último turn", descripcion: "Borra el último par pregunta+respuesta.", ejemplo: "/undo" },
      { slash: "/redo", titulo: "Redo", descripcion: "Recupera lo que undo borró.", ejemplo: "/redo" },
      { slash: "/compact", titulo: "Compactar", descripcion: "Resume la conversación larga en un system prompt corto para liberar contexto.", ejemplo: "/compact" },
    ],
  },
  {
    nombre: "Archivos y proyecto",
    color: "#e5c07b",
    comandos: [
      { slash: "/open", titulo: "Abrir archivo", descripcion: "Abre un archivo del proyecto en el editor lateral.", ejemplo: "/open src/index.ts" },
      { slash: "/terminal", titulo: "Terminal", descripcion: "Abre una terminal en el directorio del proyecto.", ejemplo: "/terminal" },
      { slash: "/workspace", titulo: "Cambiar workspace", descripcion: "Cambia el directorio de trabajo del proyecto activo.", ejemplo: "/workspace ~/proyectos/otro" },
    ],
  },
  {
    nombre: "Multimedia y extensiones",
    color: "#d19a66",
    comandos: [
      { slash: "/imagen", titulo: "Generar imagen", descripcion: "Genera una imagen con el modelo de imagen disponible (nano-banana, gpt-image).", ejemplo: "/imagen un gato pixel" },
      { slash: "/disenos", titulo: "Diseños", descripcion: "Templates de diseño (landing, dashboard, etc) generados con IA.", ejemplo: "/disenos" },
      { slash: "/mcp", titulo: "MCP servers", descripcion: "Instala/quita servidores MCP (Model Context Protocol) con verificación de checksum.", ejemplo: "/mcp" },
      { slash: "/que-son-mcp", titulo: "Qué son MCPs", descripcion: "Explicación breve de MCPs y para qué sirven.", ejemplo: "/que-son-mcp" },
    ],
  },
  {
    nombre: "Sistema y ayuda",
    color: "#98c379",
    comandos: [
      { slash: "/comandos", titulo: "Este menú", descripcion: "Muestra este catálogo completo de comandos.", ejemplo: "/comandos" },
      { slash: "/ayuda", titulo: "Ayuda guiada", descripcion: "Tutorial interactivo con lo esencial para empezar.", ejemplo: "/ayuda" },
      { slash: "/politicas", titulo: "Policy Engine", descripcion: "Reglas de qué puede hacer cada agente en cada workspace.", ejemplo: "/politicas" },
      { slash: "/twin", titulo: "Digital Twin", descripcion: "Perfil aprendido del usuario para personalizar respuestas.", ejemplo: "/twin" },
      { slash: "/evolution", titulo: "Evolution Center", descripcion: "Cómo mejora el asistente con cada sesión (memory optimizer).", ejemplo: "/evolution" },
    ],
  },
]

export function DialogComandos() {
  const dialog = useDialog()
  const [filtro, setFiltro] = createSignal("")
  const [copiado, setCopiado] = createSignal<string | undefined>()

  const filtrar = (cs: Comando[]) => {
    const q = filtro().toLowerCase().trim()
    if (!q) return cs
    return cs.filter((c) => c.slash.toLowerCase().includes(q) || c.titulo.toLowerCase().includes(q) || c.descripcion.toLowerCase().includes(q))
  }

  const copiar = async (slash: string) => {
    try {
      await navigator.clipboard.writeText(slash)
      setCopiado(slash)
      setTimeout(() => setCopiado(undefined), 1500)
    } catch { /* noop */ }
  }

  const totalComandos = CATEGORIAS.reduce((n, c) => n + c.comandos.length, 0)

  return (
    <div style="padding:20px;max-width:820px;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
        <h2 style="margin:0;">Comandos</h2>
        <span style="font-size:11px;color:#666;">{totalComandos} disponibles</span>
      </div>
      <p style="margin:0 0 14px;color:#888;font-size:13px;">
        Todos los <code style="color:#ff6b35;">/</code>slashes disponibles. Click en un comando para copiarlo.
      </p>

      <input
        value={filtro()}
        onInput={(e) => setFiltro(e.currentTarget.value)}
        placeholder="Buscar: motor, reflexionar, sandbox…"
        style="width:100%;padding:10px 12px;background:#0f0f0f;color:#e4e4e4;border:1px solid #2a2a2a;border-radius:6px;font-size:13px;margin-bottom:16px;font-family:inherit;"
      />

      <For each={CATEGORIAS}>
        {(cat) => {
          const cs = () => filtrar(cat.comandos)
          return (
            <Show when={cs().length > 0}>
              <div style="margin-bottom:20px;">
                <div style={`font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${cat.color};font-weight:700;margin-bottom:8px;padding-left:2px;`}>
                  {cat.nombre}
                </div>
                <For each={cs()}>
                  {(c) => (
                    <div
                      onClick={() => copiar(c.slash)}
                      style="padding:10px 12px;background:#0f0f0f;border:1px solid #222;border-radius:6px;margin-bottom:6px;cursor:pointer;transition:border-color 0.15s,background 0.15s;"
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = cat.color; e.currentTarget.style.background = "#151515" }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.background = "#0f0f0f" }}
                    >
                      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;">
                        <div style="display:flex;gap:10px;align-items:baseline;min-width:0;flex:1;">
                          <code style={`color:${cat.color};font-weight:700;font-size:13px;white-space:nowrap;`}>{c.slash}</code>
                          <span style="color:#e4e4e4;font-weight:600;font-size:13px;">{c.titulo}</span>
                        </div>
                        <Show when={copiado() === c.slash} fallback={<span style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.05em;">Copiar</span>}>
                          <span style="font-size:10px;color:#4ade80;text-transform:uppercase;letter-spacing:0.05em;">✓ Copiado</span>
                        </Show>
                      </div>
                      <div style="color:#aaa;font-size:12px;margin-top:4px;line-height:1.5;">{c.descripcion}</div>
                      <Show when={c.ejemplo}>
                        <div style="margin-top:6px;font-family:monospace;font-size:11px;color:#666;">→ {c.ejemplo}</div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          )
        }}
      </For>

      <div style="margin-top:16px;padding:12px;background:#0f2a10;color:#4ade80;border-radius:6px;font-size:12px;line-height:1.5;">
        <strong>Tip</strong>: escribí <code style="color:#4ade80;">/</code> en el compositor y aparece un autocomplete
        con descripción — no necesitás recordar los nombres.
      </div>

      <div style="margin-top:16px;text-align:right;">
        <button onClick={() => dialog.close()} style="padding:8px 16px;background:transparent;color:#aaa;border:1px solid #333;border-radius:6px;cursor:pointer;">Cerrar</button>
      </div>
    </div>
  )
}
