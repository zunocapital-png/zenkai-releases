import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Message, Session } from "../types/index"

// SessionStore: guarda sesiones y mensajes. In-memory + persist opcional a JSON
// en disco. La Fase 1 usa un solo archivo por sesión (simple, sin lockfiles ni
// SQLite). Cuando escale lo cambiamos por SQLite en Fase 3.
//
// La API es intencionalmente chata: create/get/list/update/delete de sesiones,
// append/getMessages de mensajes. Nada más. La UI hoy no necesita más.

export type SessionStoreOptions = {
  /** Directorio donde persistir. Si no se pasa, todo queda en memoria. */
  persistDir?: string
}

export class SessionStore {
  private sessions = new Map<string, Session>()
  private messages = new Map<string, Message[]>()
  private persistDir: string | undefined

  constructor(opts: SessionStoreOptions = {}) {
    this.persistDir = opts.persistDir
    if (this.persistDir) this.cargarDesdeDisco()
  }

  // ── Sesiones ──
  createSession(input: Partial<Session> & Pick<Session, "id">): Session {
    const now = Date.now()
    const s: Session = {
      title: input.title,
      directory: input.directory,
      modelPinned: input.modelPinned,
      meta: input.meta,
      id: input.id,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    }
    this.sessions.set(s.id, s)
    this.messages.set(s.id, [])
    this.persistir(s.id)
    return s
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  listSessions(): Session[] {
    // Ordenado por updatedAt desc — el más reciente primero, como en el sidebar.
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  updateSession(id: string, patch: Partial<Omit<Session, "id" | "createdAt">>): Session | undefined {
    const s = this.sessions.get(id)
    if (!s) return undefined
    const next: Session = { ...s, ...patch, updatedAt: Date.now() }
    this.sessions.set(id, next)
    this.persistir(id)
    return next
  }

  deleteSession(id: string): boolean {
    const existía = this.sessions.delete(id)
    this.messages.delete(id)
    // No borramos el archivo del disco por seguridad; queda como .deleted
    // si el usuario quiere recuperar. En Fase 2 sumamos hard-delete opcional.
    return existía
  }

  // ── Mensajes ──
  appendMessage(sessionId: string, msg: Omit<Message, "id" | "createdAt"> & { id?: string; createdAt?: number }): Message {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`Sesión no encontrada: ${sessionId}`)
    const m: Message = {
      role: msg.role,
      parts: msg.parts,
      model: msg.model,
      tokens: msg.tokens,
      id: msg.id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: msg.createdAt ?? Date.now(),
    }
    const lista = this.messages.get(sessionId) ?? []
    lista.push(m)
    this.messages.set(sessionId, lista)
    // Actualizamos updatedAt de la sesión para que suba en el sidebar.
    s.updatedAt = m.createdAt
    this.sessions.set(sessionId, s)
    this.persistir(sessionId)
    return m
  }

  getMessages(sessionId: string): Message[] {
    return this.messages.get(sessionId) ?? []
  }

  clearMessages(sessionId: string): void {
    if (!this.sessions.has(sessionId)) return
    this.messages.set(sessionId, [])
    this.persistir(sessionId)
  }

  // ── Persistencia ──
  private pathDe(id: string): string {
    return join(this.persistDir!, `${id}.json`)
  }

  private persistir(id: string): void {
    if (!this.persistDir) return
    const s = this.sessions.get(id)
    if (!s) return
    const data = { session: s, messages: this.messages.get(id) ?? [] }
    const file = this.pathDe(id)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 2), "utf8")
  }

  private cargarDesdeDisco(): void {
    if (!this.persistDir || !existsSync(this.persistDir)) return
    const { readdirSync } = require("node:fs") as typeof import("node:fs")
    for (const file of readdirSync(this.persistDir)) {
      if (!file.endsWith(".json")) continue
      try {
        const raw = readFileSync(join(this.persistDir, file), "utf8")
        const data = JSON.parse(raw) as { session: Session; messages: Message[] }
        this.sessions.set(data.session.id, data.session)
        this.messages.set(data.session.id, data.messages ?? [])
      } catch {
        // Archivo corrupto: lo salteamos sin tirar el proceso.
      }
    }
  }
}
