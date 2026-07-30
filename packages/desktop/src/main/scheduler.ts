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
let timers: ReturnType<typeof setInterval>[] = []

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
  reloadScheduler()
}

// Reconstruye los timers a partir de las tareas guardadas.
export function reloadScheduler(): void {
  for (const t of timers) clearInterval(t)
  timers = []
  for (const task of getScheduledTasks()) {
    if (!task.enabled || !(task.everyMinutes > 0)) continue
    const ms = Math.max(1, task.everyMinutes) * 60_000
    timers.push(
      setInterval(() => {
        try {
          new Notification({
            title: `⏰ ${task.name || "Tarea programada"}`,
            body: task.prompt.slice(0, 140) || "Es hora de tu tarea en ZENKAI.",
          }).show()
        } catch {
          /* notificaciones no disponibles: ignorar */
        }
      }, ms),
    )
  }
}

export function startScheduler(): void {
  reloadScheduler()
}

export function stopScheduler(): void {
  for (const t of timers) clearInterval(t)
  timers = []
}
