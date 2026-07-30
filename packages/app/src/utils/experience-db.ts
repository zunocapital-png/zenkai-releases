// Experience Database (idea Tomo XIII). Guarda "experiencias exitosas" — no
// prompts, sino PATRONES que funcionaron: qué prompt + qué agente + qué modelo
// resolvieron X tipo de tarea. La IA los reutiliza en tareas similares.
//
// Se guarda todo en localStorage por proyecto. Simple key/value indexado por
// tipo de tarea. Es la semilla de "la IA aprende de sus propios éxitos".

export type Experiencia = {
  id: string
  proyecto: string
  categoria: "coding" | "debug" | "refactor" | "explain" | "design" | "general"
  descripcion: string
  prompt: string
  modelo?: string
  subAgente?: string
  timestamp: number
  exitoso: boolean
  usos: number
}

const STORAGE_KEY = "zenkai.experience.v1"
const MAX_EXPERIENCIAS = 200

function cargar(): Experiencia[] {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (!v) return []
    return JSON.parse(v) as Experiencia[]
  } catch {
    return []
  }
}

function guardar(arr: Experiencia[]) {
  try {
    // Mantenemos solo las últimas MAX_EXPERIENCIAS, ordenadas por uso reciente.
    const podadas = [...arr].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_EXPERIENCIAS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(podadas))
  } catch {
    /* quota */
  }
}

export function registrarExperiencia(e: Omit<Experiencia, "id" | "timestamp" | "usos" | "exitoso">) {
  const arr = cargar()
  arr.push({ ...e, id: crypto.randomUUID(), timestamp: Date.now(), usos: 1, exitoso: true })
  guardar(arr)
}

export function buscarExperiencias(categoria: Experiencia["categoria"], proyecto: string, limit = 5): Experiencia[] {
  return cargar()
    .filter((e) => e.categoria === categoria && e.proyecto === proyecto && e.exitoso)
    .sort((a, b) => b.usos - a.usos || b.timestamp - a.timestamp)
    .slice(0, limit)
}

export function todasLasExperiencias(): Experiencia[] {
  return cargar()
}
