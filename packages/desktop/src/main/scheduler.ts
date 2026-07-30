// Tareas programadas (primer ladrillo de "agentes proactivos"): guarda tareas con un
// intervalo y, cuando llega la hora, dispara una NOTIFICACIÓN recordándote la tarea.
// Es 100% seguro: NO ejecuta acciones de IA por su cuenta todavía — solo avisa.
// El paso siguiente (correr un agente read-only al dispararse) se hará con verificación.

import { Notification } from "electron"
import { getStore } from "./store"

export type ScheduledTask = {
  id: string
  name: string
  prompt: string
  everyMinutes: number
  enabled: boolean
}

const STORE = "scheduled-tasks"
const KEY = "tasks"
const LAST_KEY = "lastFired"
let timers: ReturnType<typeof setInterval>[] = []

function getLast(): Record<string, number> {
  try {
    const raw = getStore(STORE).get(LAST_KEY)
    const p = typeof raw === "string" ? JSON.parse(raw) : raw
    return p && typeof p === "object" ? (p as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function dispararTarea(task: ScheduledTask): void {
  try {
    new Notification({
      title: `⏰ ${task.name || "Tarea programada"}`,
      body: task.prompt.slice(0, 140) || "Es hora de tu tarea en ZENKAI.",
    }).show()
  } catch {
    /* notificaciones no disponibles */
  }
  const last = getLast()
  last[task.id] = Date.now()
  getStore(STORE).set(LAST_KEY, JSON.stringify(last))
}

export function getScheduledTasks(): ScheduledTask[] {
  try {
    const raw = getStore(STORE).get(KEY)
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? (parsed as ScheduledTask[]) : []
  } catch {
    return []
  }
}

export function setScheduledTasks(tasks: ScheduledTask[]): void {
  getStore(STORE).set(KEY, JSON.stringify(tasks))
  // Sembramos lastFired de tareas nuevas para que guardar NO dispare el catch-up al instante.
  const last = getLast()
  const ahora = Date.now()
  const ids = new Set(tasks.map((t) => t.id))
  for (const t of tasks) if (last[t.id] == null) last[t.id] = ahora
  for (const id of Object.keys(last)) if (!ids.has(id)) delete last[id] // purgar tareas borradas
  getStore(STORE).set(LAST_KEY, JSON.stringify(last))
  reloadScheduler(false) // rearmar timers sin catch-up (eso es solo del arranque)
}

// Reconstruye los timers a partir de las tareas guardadas. Con catchUp=true (solo al arrancar)
// recupera la corrida perdida: si la app estuvo cerrada más de un intervalo, dispara una vez.
export function reloadScheduler(catchUp = false): void {
  for (const t of timers) clearInterval(t)
  timers = []
  const last = getLast()
  const ahora = Date.now()
  for (const task of getScheduledTasks()) {
    if (!task.enabled || !(task.everyMinutes > 0)) continue
    const ms = Math.max(1, task.everyMinutes) * 60_000
    if (catchUp && ahora - (last[task.id] ?? 0) >= ms) dispararTarea(task) // catch-up de la perdida
    timers.push(setInterval(() => dispararTarea(task), ms))
  }
}

export function startScheduler(): void {
  reloadScheduler(true)
}

export function stopScheduler(): void {
  for (const t of timers) clearInterval(t)
  timers = []
}
