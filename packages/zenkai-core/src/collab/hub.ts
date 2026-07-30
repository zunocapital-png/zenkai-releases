// Hub de colaboración: broadcaster in-process para sesiones compartidas.
// Es la lógica pura (subscribe / publish / rooms); el bind a WebSockets lo hace
// el host (Bun.serve con {websocket: ...} o `ws` node). Al separar la lógica del
// transporte queda testeable y reutilizable en cualquier runtime.
//
// Modelo:
//   - Cada "sala" (room) representa una sesión compartida (por sessionId).
//   - Cada cliente se subscribe con un ID único (típicamente su socket).
//   - Publish envía a todos los clientes de la sala menos al emisor (opcional).
//   - Los mensajes son JSON-serializables (validado al publish).

export type CollabEvento = {
  tipo: "message.append" | "presence.join" | "presence.leave" | "presence.cursor" | "custom"
  roomId: string
  clienteId?: string
  data: unknown
  ts: number
}

export type CollabCliente = {
  id: string
  nombre?: string
  color?: string
  /** Callback invocado cuando llega un evento a la sala. */
  onEvent: (e: CollabEvento) => void
}

export type CollabPresence = { id: string; nombre?: string; color?: string; ultimoActivo: number }

export class CollabHub {
  private rooms = new Map<string, Map<string, CollabCliente>>()
  private historial = new Map<string, CollabEvento[]>() // últimos N eventos por room
  private readonly HISTORIAL_MAX = 100

  /** Cliente entra a una sala. Devuelve la presencia inicial (otros ya conectados). */
  entrar(roomId: string, cliente: CollabCliente): CollabPresence[] {
    let room = this.rooms.get(roomId)
    if (!room) {
      room = new Map()
      this.rooms.set(roomId, room)
    }
    room.set(cliente.id, cliente)
    const presencia: CollabEvento = {
      tipo: "presence.join",
      roomId,
      clienteId: cliente.id,
      data: { id: cliente.id, nombre: cliente.nombre, color: cliente.color },
      ts: Date.now(),
    }
    this.broadcast(roomId, presencia, cliente.id)
    this.pushHistorial(roomId, presencia)
    const otros = Array.from(room.values())
      .filter((c) => c.id !== cliente.id)
      .map<CollabPresence>((c) => ({ id: c.id, nombre: c.nombre, color: c.color, ultimoActivo: Date.now() }))
    return otros
  }

  /** Cliente sale. Broadcast leave. */
  salir(roomId: string, clienteId: string): void {
    const room = this.rooms.get(roomId)
    if (!room?.has(clienteId)) return
    room.delete(clienteId)
    const leave: CollabEvento = {
      tipo: "presence.leave",
      roomId,
      clienteId,
      data: { id: clienteId },
      ts: Date.now(),
    }
    this.broadcast(roomId, leave)
    this.pushHistorial(roomId, leave)
    if (room.size === 0) this.rooms.delete(roomId)
  }

  /** Publica evento a todos en la sala (opcional: excluir emisor). */
  publicar(evento: Omit<CollabEvento, "ts">, opts: { excluirEmisor?: boolean } = {}): number {
    // Validar serialización — si el data no es JSON-serializable esto lo detecta acá.
    try {
      JSON.stringify(evento.data)
    } catch {
      throw new Error("data no es JSON-serializable")
    }
    const full: CollabEvento = { ...evento, ts: Date.now() }
    this.pushHistorial(full.roomId, full)
    return this.broadcast(full.roomId, full, opts.excluirEmisor ? full.clienteId : undefined)
  }

  private broadcast(roomId: string, evento: CollabEvento, excluirClienteId?: string): number {
    const room = this.rooms.get(roomId)
    if (!room) return 0
    let entregados = 0
    for (const c of room.values()) {
      if (excluirClienteId && c.id === excluirClienteId) continue
      try {
        c.onEvent(evento)
        entregados++
      } catch {
        /* cliente muerto: no rompemos el broadcast por uno solo */
      }
    }
    return entregados
  }

  private pushHistorial(roomId: string, evento: CollabEvento) {
    const arr = this.historial.get(roomId) ?? []
    arr.push(evento)
    while (arr.length > this.HISTORIAL_MAX) arr.shift()
    this.historial.set(roomId, arr)
  }

  /** Devuelve los últimos N eventos de una sala para catch-up cuando alguien entra. */
  obtenerHistorial(roomId: string, limite = 100): CollabEvento[] {
    const arr = this.historial.get(roomId) ?? []
    return arr.slice(-limite)
  }

  /** Lista de presencias actuales en una sala. */
  presencias(roomId: string): CollabPresence[] {
    const room = this.rooms.get(roomId)
    if (!room) return []
    return Array.from(room.values()).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      color: c.color,
      ultimoActivo: Date.now(),
    }))
  }

  /** Cuenta clientes por sala. */
  conteoClientes(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0
  }

  /** Salas activas. */
  salasActivas(): string[] {
    return Array.from(this.rooms.keys())
  }
}
