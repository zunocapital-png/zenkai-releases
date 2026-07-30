// Tutoriales integrados en la app — pasos ejecutables con verificación.
// Cada tutorial tiene N pasos, cada paso tiene: instrucción + condición
// automática de completado + (opcional) acción sugerida que Zenkai ejecuta.
//
// El motor NO renderiza — devuelve la estructura; la UI la pinta.
// Los verificadores son funciones puras que la UI llama para saber si
// avanzar al siguiente paso.

export type PasoTutorial = {
  id: string
  titulo: string
  instruccion: string
  /** Acción sugerida — la UI puede mostrar un botón "Hacerlo por mí". */
  accionSugerida?: {
    tipo: "slash" | "abrir-dialog" | "url" | "ejecutar-tool"
    valor: string
  }
  /** Condición auto para marcar como completado. Ej: "descargó modelo X". */
  verificar?: (contexto: TutorialContexto) => boolean
  /** Tips para casos comunes que salen mal. */
  troubleshoot?: string[]
}

export type Tutorial = {
  id: string
  titulo: string
  descripcion: string
  duracionEstimadaMin: number
  nivel: "principiante" | "intermedio" | "avanzado"
  categoria: "primeros-pasos" | "coding" | "avanzado" | "trucos"
  pasos: PasoTutorial[]
}

/** Contexto que la UI le pasa al verificador — hechos observables del sistema. */
export type TutorialContexto = {
  modelosInstalados: string[]
  modelosCargados: string[]
  sesionesTotales: number
  pluginsInstalados: string[]
  tienePairing?: boolean
  hayMensajesEnSesion?: boolean
}

export const TUTORIALES: Tutorial[] = [
  {
    id: "primer-modelo",
    titulo: "Instalar tu primer modelo local",
    descripcion: "Descarga un modelo y ten IA offline en 3 minutos.",
    duracionEstimadaMin: 3,
    nivel: "principiante",
    categoria: "primeros-pasos",
    pasos: [
      {
        id: "abrir-motor",
        titulo: "Abre el motor",
        instruccion: "Escribí /motor en el chat o presiona el slash y elegí Zenkai Engine.",
        accionSugerida: { tipo: "slash", valor: "/motor" },
      },
      {
        id: "elegir-modelo",
        titulo: "Elegí un modelo",
        instruccion: "El diagnóstico te sugiere el mejor para tu equipo. Los ✓ óptimos son la mejor apuesta. Descargá uno.",
        verificar: (ctx) => ctx.modelosInstalados.length > 0,
        troubleshoot: [
          "Si la descarga falla, verificá conexión a internet.",
          "Si no ves modelos óptimos, tu equipo puede que necesite modelos más chicos (Qwen 1.5B/3B).",
        ],
      },
      {
        id: "cargar-modelo",
        titulo: "Cargá el modelo",
        instruccion: "Click en Cargar. La primera vez tarda (~30s) porque va a RAM/VRAM.",
        verificar: (ctx) => ctx.modelosCargados.length > 0,
      },
      {
        id: "chat-primer-msg",
        titulo: "Enviá tu primer mensaje",
        instruccion: "Cerrá el dialog y en el chat preguntá algo simple: 'hola, ¿cómo estás?'",
        verificar: (ctx) => !!ctx.hayMensajesEnSesion,
      },
    ],
  },
  {
    id: "coding-workflow",
    titulo: "Setup para coding",
    descripcion: "Configura Zenkai como copiloto de código con el mejor stack.",
    duracionEstimadaMin: 5,
    nivel: "intermedio",
    categoria: "coding",
    pasos: [
      {
        id: "modelo-coder",
        titulo: "Instalá Qwen 2.5 Coder",
        instruccion: "En /motor descargá 'Qwen 2.5 Coder 7B' (o 32B si tu GPU aguanta).",
        verificar: (ctx) => ctx.modelosInstalados.some((m) => m.includes("coder")),
      },
      {
        id: "mcp-git",
        titulo: "Habilitá MCP git",
        instruccion: "En /mcp activá el servidor 'git' — te permite ver diffs y commits desde el chat.",
        verificar: (ctx) => ctx.pluginsInstalados.some((p) => p.includes("git")),
      },
      {
        id: "usar-reparar",
        titulo: "Probá /reparar",
        instruccion: "En un repo con tests: escribí '/reparar bun test' o el comando que corras. Zenkai loopea test→fix→retest.",
        accionSugerida: { tipo: "slash", valor: "/reparar" },
      },
      {
        id: "usar-reflexionar",
        titulo: "Probá /reflexionar",
        instruccion: "Después de una respuesta larga del asistente, escribí '/reflexionar' y otro modelo la evalúa.",
        accionSugerida: { tipo: "slash", valor: "/reflexionar" },
      },
    ],
  },
  {
    id: "sub-agentes",
    titulo: "Los sub-agentes cognitivos",
    descripcion: "Aprende a usar reflector, parliament y auto-repair.",
    duracionEstimadaMin: 4,
    nivel: "intermedio",
    categoria: "avanzado",
    pasos: [
      {
        id: "parliament",
        titulo: "AI Parliament",
        instruccion: "En decisiones críticas (¿borrar esto? ¿esta lógica es correcta?), usá /parliament — vota entre N modelos.",
        accionSugerida: { tipo: "slash", valor: "/parliament" },
      },
      {
        id: "sandbox",
        titulo: "Sandbox aislado",
        instruccion: "Antes de correr código sugerido por el LLM, probalo en /sandbox — child_process con timeout y sin acceso a tu FS.",
        accionSugerida: { tipo: "slash", valor: "/sandbox" },
      },
      {
        id: "observability",
        titulo: "Observability",
        instruccion: "Abrí /observability para ver eventos en vivo, providers activos, latencia y cache hits.",
        accionSugerida: { tipo: "slash", valor: "/observability" },
      },
    ],
  },
  {
    id: "privacidad",
    titulo: "Modo 100% privado",
    descripcion: "Zero data leaves your machine — verificado.",
    duracionEstimadaMin: 3,
    nivel: "avanzado",
    categoria: "trucos",
    pasos: [
      {
        id: "solo-local",
        titulo: "Provider = solo local",
        instruccion: "En Ajustes → Providers, deshabilitá TODOS los cloud (OpenAI/Anthropic/etc). Dejá solo zenkai-engine y/o ollama.",
      },
      {
        id: "region-local",
        titulo: "Region preferida = local",
        instruccion: "En Ajustes → General, setealo. Cualquier request accidental a cloud se bloquea.",
      },
      {
        id: "mcp-audit",
        titulo: "Auditá MCPs",
        instruccion: "En /mcp desactivá los que van a nube (web-search, github). Quedate con los locales (filesystem, git).",
      },
      {
        id: "verificar",
        titulo: "Verificalo",
        instruccion: "Cortá tu wifi. Manda un mensaje. Si responde, tu setup es 100% offline.",
      },
    ],
  },
  {
    id: "mobile-pairing",
    titulo: "Emparejá tu teléfono",
    descripcion: "Usá Zenkai desde el móvil cuando no estés frente a la compu.",
    duracionEstimadaMin: 2,
    nivel: "principiante",
    categoria: "trucos",
    pasos: [
      {
        id: "generar-qr",
        titulo: "Generá el QR",
        instruccion: "En Ajustes → Compartir, click 'Emparejar dispositivo'. Aparece un QR con código de 6 chars.",
      },
      {
        id: "escanear",
        titulo: "Escaneá con el móvil",
        instruccion: "Cámara del teléfono o cualquier app QR. Te abre el chat web de Zenkai.",
        verificar: (ctx) => !!ctx.tienePairing,
      },
    ],
  },
]

/** Filtra por nivel/categoría — útil para "empezá acá según lo que ya sabés". */
export function filtrarTutoriales(opts: { nivel?: Tutorial["nivel"]; categoria?: Tutorial["categoria"] }): Tutorial[] {
  return TUTORIALES.filter((t) => {
    if (opts.nivel && t.nivel !== opts.nivel) return false
    if (opts.categoria && t.categoria !== opts.categoria) return false
    return true
  })
}

export function getTutorial(id: string): Tutorial | undefined {
  return TUTORIALES.find((t) => t.id === id)
}

/**
 * Calcula qué % del tutorial está completado según el contexto actual.
 * Útil para pintar barra de progreso en la UI y "sos 3/5" en el listado.
 */
export function progresoTutorial(t: Tutorial, ctx: TutorialContexto): { completados: number; total: number; pct: number } {
  const total = t.pasos.length
  const completados = t.pasos.filter((p) => p.verificar?.(ctx) === true).length
  return { completados, total, pct: total > 0 ? Math.round((completados / total) * 100) : 0 }
}

/** Devuelve el próximo paso pendiente — el que la UI destaca. */
export function proximoPaso(t: Tutorial, ctx: TutorialContexto): PasoTutorial | undefined {
  return t.pasos.find((p) => !p.verificar || !p.verificar(ctx))
}
