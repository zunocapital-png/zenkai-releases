// AIOS Event Bus: pub/sub tipado con soporte de wildcards y persistencia opcional.
// Es el kernel event layer que atraviesa transversalmente ZENKAI — cualquier
// componente puede publicar "session.created", "tool.finished", "model.error",
// y cualquier otro suscribirse a "session.*" o "*" para ver todo.
//
// Diferencia vs EventEmitter de node:
//   - Wildcards: "session.*" matchea "session.created", "session.deleted"...
//   - Async-safe: cada handler corre en un microtask separado, un handler que
//     tarda no bloquea al siguiente.
//   - Persistencia opcional: si se pasa `persist(evento)`, cada emit se guarda.
//     Útil para audit log, replay, o event sourcing.
//   - Cancelación: subscribe devuelve una función de unsubscribe.

export type BusEvento<T = unknown> = {
  tipo: string
  data: T
  ts: number
  /** ID opcional para deduplicar / replay. */
  id?: string
}

export type Handler<T = unknown> = (evento: BusEvento<T>) => void | Promise<void>

export type EventBusOptions = {
  /** Callback opcional invocado en cada emit — para audit log. */
  persist?: (evento: BusEvento) => void | Promise<void>
  /** Si true, un handler async que rechaza no rompe al resto. Default true. */
  aisladoAsync?: boolean
}

export class EventBus {
  private handlers = new Map<string, Set<Handler>>()
  private opts: EventBusOptions

  constructor(opts: EventBusOptions = {}) {
    this.opts = { aisladoAsync: true, ...opts }
  }

  /**
   * Subscribe. patron puede ser:
   *  - "session.created"  → exact match
   *  - "session.*"        → prefijo con wildcard un nivel
   *  - "*"                → catch-all (todo)
   */
  on<T = unknown>(patron: string, handler: Handler<T>): () => void {
    let set = this.handlers.get(patron)
    if (!set) {
      set = new Set()
      this.handlers.set(patron, set)
    }
    set.add(handler as Handler)
    return () => {
      set!.delete(handler as Handler)
      if (set!.size === 0) this.handlers.delete(patron)
    }
  }

  /** Subscribe que se dispara SOLO la primera vez y luego se auto-remueve. */
  once<T = unknown>(patron: string, handler: Handler<T>): () => void {
    // Flag síncrono: si otro emit llega en el mismo tick antes de que el
    // microtask del handler corra, chequeamos el flag y ignoramos.
    let disparado = false
    const wrapper: Handler<T> = async (e) => {
      if (disparado) return
      disparado = true
      unsub()
      await handler(e)
    }
    const unsub = this.on(patron, wrapper)
    return unsub
  }

  /** Emite un evento. Devuelve cuántos handlers matcheados corrieron. */
  emit<T = unknown>(tipo: string, data: T, id?: string): number {
    const evento: BusEvento<T> = { tipo, data, ts: Date.now(), id }
    if (this.opts.persist) {
      try {
        const p = this.opts.persist(evento as BusEvento)
        if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {})
      } catch {
        /* persist es best-effort */
      }
    }
    let count = 0
    for (const [patron, handlers] of this.handlers.entries()) {
      if (!matches(patron, tipo)) continue
      for (const h of handlers) {
        count++
        this.runHandler(h, evento as BusEvento)
      }
    }
    return count
  }

  private runHandler(h: Handler, evento: BusEvento) {
    if (this.opts.aisladoAsync) {
      // Corre en microtask, atrapa rejects para no propagar.
      Promise.resolve().then(async () => {
        try {
          await h(evento)
        } catch {
          /* un handler no debe caer los demás */
        }
      })
    } else {
      try {
        void h(evento)
      } catch {
        /* sync try/catch */
      }
    }
  }

  /** Cuenta suscripciones activas para un patrón exacto. */
  countSubscribers(patron: string): number {
    return this.handlers.get(patron)?.size ?? 0
  }

  /** Limpia todos los handlers de un patrón, o de todo si se omite. */
  removeAll(patron?: string): void {
    if (patron) this.handlers.delete(patron)
    else this.handlers.clear()
  }

  /** Lista los patrones registrados — útil para debug. */
  patrones(): string[] {
    return Array.from(this.handlers.keys())
  }
}

/** Match wildcards: "session.*" matchea "session.foo" pero NO "session.foo.bar" (un solo nivel). */
export function matches(patron: string, evento: string): boolean {
  if (patron === "*") return true
  if (patron === evento) return true
  if (patron.endsWith(".*")) {
    const prefijo = patron.slice(0, -2)
    if (!evento.startsWith(prefijo + ".")) return false
    const resto = evento.slice(prefijo.length + 1)
    return !resto.includes(".") // un solo nivel
  }
  return false
}
