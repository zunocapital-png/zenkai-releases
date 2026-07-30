import { MODELOS_RECOMENDADOS, type ModeloRecomendado } from "./gguf-downloader"
import type { HwSnapshot } from "./hw-monitor"

// Recomendador de modelos por hardware. Análogo a lo que Ollama sugiere
// pero mejor: consideramos GPU real (VRAM total), RAM disponible, y
// dejamos margen para OS + otras apps (no comemos toda la RAM/VRAM).
//
// Regla base: usamos MIN(VRAM_disponible, RAM_disponible) y descartamos
// modelos que no entran. De los que entran, ordenamos por potencia desc y
// devolvemos top-N por categoría.
//
// Margen conservador: reservamos 2 GB para el OS/otras apps siempre.

const MARGEN_MB = 2048

export type DiagnosticoHw = {
  vramDisponibleMB: number
  ramDisponibleMB: number
  memoriaUtilMB: number
  tieneGpu: boolean
  gpuNombre?: string
  perfil: "muy-limitado" | "laptop" | "workstation" | "gpu-dedicada" | "estacion-ml"
}

export type Recomendacion = {
  modelo: ModeloRecomendado
  puedeCorrer: boolean
  motivo: string
  velocidadEsperada: "muy-rapido" | "rapido" | "moderado" | "lento" | "no-corre"
  esOptimo: boolean
  esRecomendado: boolean
}

/**
 * Analiza el hardware del usuario y devuelve un perfil legible.
 */
export function diagnosticar(hw: HwSnapshot): DiagnosticoHw {
  const tieneGpu = !!hw.gpu?.vramTotalMB
  const vramDisponibleMB = tieneGpu ? Math.max(0, (hw.gpu?.vramTotalMB ?? 0) - MARGEN_MB) : 0
  const ramDisponibleMB = Math.max(0, hw.ram.libreMB - MARGEN_MB)
  // memoriaUtilMB = límite práctico para elegir modelo. Si hay GPU real, es su VRAM.
  // Si no, es la RAM libre (para Apple Silicon con unified memory usamos RAM total).
  const memoriaUtilMB = tieneGpu ? vramDisponibleMB : ramDisponibleMB

  let perfil: DiagnosticoHw["perfil"]
  if (memoriaUtilMB < 4096) perfil = "muy-limitado"
  else if (memoriaUtilMB < 8192) perfil = "laptop"
  else if (memoriaUtilMB < 16384) perfil = "workstation"
  else if (memoriaUtilMB < 32768) perfil = "gpu-dedicada"
  else perfil = "estacion-ml"

  return {
    vramDisponibleMB,
    ramDisponibleMB,
    memoriaUtilMB,
    tieneGpu,
    gpuNombre: hw.gpu?.nombre,
    perfil,
  }
}

/**
 * Devuelve TODOS los modelos con anotación de compatibilidad.
 * La UI filtra/ordena visualmente.
 */
export function evaluarModelos(diag: DiagnosticoHw, modelos: readonly ModeloRecomendado[] = MODELOS_RECOMENDADOS): Recomendacion[] {
  return modelos.map((m) => evaluarModelo(m, diag))
}

function evaluarModelo(m: ModeloRecomendado, diag: DiagnosticoHw): Recomendacion {
  const puedeCorrer = diag.memoriaUtilMB >= m.ramMinimaMB
  const holgura = diag.memoriaUtilMB / m.ramMinimaMB

  let velocidadEsperada: Recomendacion["velocidadEsperada"]
  if (!puedeCorrer) velocidadEsperada = "no-corre"
  else if (diag.tieneGpu && holgura >= 2) velocidadEsperada = "muy-rapido"
  else if (diag.tieneGpu && holgura >= 1) velocidadEsperada = "rapido"
  else if (!diag.tieneGpu && holgura >= 2) velocidadEsperada = "moderado"
  else velocidadEsperada = "lento"

  const esOptimo = puedeCorrer && holgura >= 1.2 && holgura <= 3 && m.potencia >= 6
  const esRecomendado = puedeCorrer && m.potencia >= 5 && velocidadEsperada !== "lento"

  const motivo = construirMotivo(m, diag, puedeCorrer, velocidadEsperada)
  return { modelo: m, puedeCorrer, motivo, velocidadEsperada, esOptimo, esRecomendado }
}

function construirMotivo(m: ModeloRecomendado, diag: DiagnosticoHw, ok: boolean, vel: Recomendacion["velocidadEsperada"]): string {
  if (!ok) return `necesita ${Math.round(m.ramMinimaMB / 1024)} GB; tenés ${Math.round(diag.memoriaUtilMB / 1024)} GB útiles`
  const donde = diag.tieneGpu ? "en tu GPU" : "en CPU/RAM"
  const velLabel = { "muy-rapido": "muy fluido", "rapido": "fluido", "moderado": "usable", "lento": "lento pero corre", "no-corre": "" }[vel]
  return `corre ${velLabel} ${donde}`
}

/**
 * Sugiere el "mejor" modelo por categoría — el que la UI destaca por default.
 * Estrategia: máxima potencia dentro de esOptimo, o fallback al más potente que corra.
 */
export function elegirMejorPorTipo(evals: Recomendacion[], tipo: ModeloRecomendado["tipo"]): Recomendacion | undefined {
  const filtered = evals.filter((e) => e.modelo.tipo === tipo)
  if (filtered.length === 0) return undefined
  const optimos = filtered.filter((e) => e.esOptimo).sort((a, b) => b.modelo.potencia - a.modelo.potencia)
  if (optimos[0]) return optimos[0]
  const corren = filtered.filter((e) => e.puedeCorrer).sort((a, b) => b.modelo.potencia - a.modelo.potencia)
  return corren[0] ?? filtered[0]
}

/**
 * Resumen completo — lo que la UI del /motor pinta arriba de todo.
 */
export function resumenRecomendacion(hw: HwSnapshot): {
  diagnostico: DiagnosticoHw
  mensaje: string
  mejorCoding?: Recomendacion
  mejorGeneral?: Recomendacion
  mejorReasoning?: Recomendacion
  mejorEmbed?: Recomendacion
  todos: Recomendacion[]
} {
  const diag = diagnosticar(hw)
  const evals = evaluarModelos(diag)
  const mensajes: Record<DiagnosticoHw["perfil"], string> = {
    "muy-limitado": `Tu equipo tiene menos de 4 GB útiles — sólo modelos tiny (1-3B) van a andar. Recomendamos usar providers cloud gratis (Groq/Cerebras/Google) para modelos grandes.`,
    "laptop": `Laptop estándar (~4-8 GB útiles). Sweet spot: modelos 7B como Qwen 2.5 Coder 7B. Corren fluido.`,
    "workstation": `Workstation (~8-16 GB útiles). Podés correr modelos 14B cómodamente e incluso probar 22B como Codestral.`,
    "gpu-dedicada": `GPU dedicada (~16-32 GB VRAM). Qwen 2.5 Coder 32B corre bien acá — nivel Claude Sonnet local.`,
    "estacion-ml": `Estación ML (32+ GB). Podés correr modelos frontera 70B (Llama 3.3, Qwen 72B) con calidad enterprise local.`,
  }
  return {
    diagnostico: diag,
    mensaje: mensajes[diag.perfil],
    mejorCoding: elegirMejorPorTipo(evals, "coding"),
    mejorGeneral: elegirMejorPorTipo(evals, "general"),
    mejorReasoning: elegirMejorPorTipo(evals, "reasoning"),
    mejorEmbed: elegirMejorPorTipo(evals, "embed"),
    todos: evals,
  }
}
