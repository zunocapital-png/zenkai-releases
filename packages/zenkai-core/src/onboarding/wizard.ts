// Onboarding wizard — flujo del primer arranque. 3 pasos, todos completables
// en < 30 segundos porque el modelo tiny viene bundleado en el installer.
//
// El motor NO renderiza — devuelve la estructura del wizard; la UI la pinta.
// Los pasos verifican estado real (¿router arriba? ¿modelo cargado?) y avanzan
// automáticos cuando la condición se cumple. Cero click extra si todo ya está.

export type PasoWizard = {
  id: string
  titulo: string
  hint: string
  /** Acción que la UI ejecuta al hacer click en "hacerlo por mí". */
  accionAuto?: {
    tipo: "cargar-modelo-bundleado" | "primer-chat-sugerido" | "elegir-preset"
    valor?: string
  }
  /** Verifica si el paso está completo — recibe el estado del sistema. */
  verificar: (estado: WizardEstado) => boolean
  /** Prompt de ejemplo pre-cargado (opcional). */
  ejemploPrompt?: string
}

export type WizardEstado = {
  routerVivo: boolean
  modeloBundleadoCargado: boolean
  primerMensajeEnviado: boolean
  presetElegido?: string
}

/**
 * Modelo tiny que viene bundleado en el installer.
 * Qwen 2.5 1.5B Q4_K_M ~= 1.1 GB. Sirve para chatear inmediato al abrir la app.
 * El usuario después descarga modelos más grandes desde /motor.
 */
export const MODELO_BUNDLEADO = {
  id: "qwen2.5-1.5b-q4",
  nombre: "Qwen 2.5 1.5B (bundleado)",
  bytesAprox: 1_100_000_000,
  ramMinimaMB: 2048,
}

/**
 * Los 3 pasos del wizard. La UI arranca en el primero pendiente y avanza
 * automático a medida que el usuario cumple la condición.
 */
export const PASOS_WIZARD: PasoWizard[] = [
  {
    id: "arranque",
    titulo: "Arrancando el motor",
    hint: "Zenkai levanta su router local (:20128) — sin cloud, sin login.",
    verificar: (e) => e.routerVivo,
  },
  {
    id: "modelo-bundleado",
    titulo: "Cargando modelo local",
    hint: `${MODELO_BUNDLEADO.nombre} — corre en tu equipo, sin descargar nada extra.`,
    accionAuto: { tipo: "cargar-modelo-bundleado" },
    verificar: (e) => e.modeloBundleadoCargado,
  },
  {
    id: "primer-chat",
    titulo: "Probá tu primer mensaje",
    hint: "Escribí algo en el chat, o usá la sugerencia lista para enviar.",
    accionAuto: { tipo: "primer-chat-sugerido" },
    ejemploPrompt: "Hola. ¿Qué podés hacer por mí en Zenkai?",
    verificar: (e) => e.primerMensajeEnviado,
  },
]

export type ProgresoWizard = {
  pasoActualIndex: number
  pasoActual?: PasoWizard
  pasosCompletados: number
  totalPasos: number
  pct: number
  completo: boolean
}

/** Estado del wizard según el sistema. La UI lo pinta como barra + step actual. */
export function progresoWizard(estado: WizardEstado): ProgresoWizard {
  const completados = PASOS_WIZARD.filter((p) => p.verificar(estado)).length
  const pasoActualIndex = PASOS_WIZARD.findIndex((p) => !p.verificar(estado))
  return {
    pasoActualIndex,
    pasoActual: pasoActualIndex >= 0 ? PASOS_WIZARD[pasoActualIndex] : undefined,
    pasosCompletados: completados,
    totalPasos: PASOS_WIZARD.length,
    pct: Math.round((completados / PASOS_WIZARD.length) * 100),
    completo: completados === PASOS_WIZARD.length,
  }
}

/** Sugerencias de prompts iniciales — la UI los muestra como chips en el chat. */
export const SUGERENCIAS_PRIMER_CHAT: Array<{ id: string; label: string; prompt: string }> = [
  { id: "hola", label: "Presentate", prompt: "Hola. ¿Qué podés hacer por mí en Zenkai?" },
  { id: "codigo", label: "Revisá código", prompt: "Analizá este fragmento y sugerí mejoras:\n\nfunction suma(a, b) {\n  return a + b\n}" },
  { id: "explicar", label: "Explicá algo", prompt: "Explicame TypeScript generics con un ejemplo concreto." },
  { id: "traducir", label: "Traducí", prompt: 'Traducí esto al inglés: "El sistema de failover recupera al provider caído"' },
  { id: "resumir", label: "Resumí un texto", prompt: "Voy a pegarte un texto largo. Resumime lo esencial en 3 puntos." },
]
