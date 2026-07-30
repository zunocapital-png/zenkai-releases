import { mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"
import type { Message, Session } from "../types/index"

// Import runtime del bun:sqlite. Usamos require dinámico para que tsgo del
// desktop (que no tiene tipos de bun:sqlite) no explote. En runtime siempre
// estamos en Bun, así que require lo resuelve.
type BunDatabase = {
  prepare: (sql: string) => { run: (...args: unknown[]) => void; get: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[] }
  exec: (sql: string) => void
  close: () => void
  transaction: <T extends (...args: unknown[]) => unknown>(fn: T) => T
}
type BunDatabaseCtor = new (path: string, opts?: { create?: boolean }) => BunDatabase

function getDatabase(): BunDatabaseCtor {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("bun:sqlite") as { Database: BunDatabaseCtor }
  return mod.Database
}

// SessionStore v2: SQLite backend. Misma API pública que SessionStore (JSON),
// pero escala a 10k+ sesiones sin cargar todo a memoria y con listados O(log n).
//
// Uso: `new SessionStoreSqlite({ dbPath: "sessions.db" })`. Si dbPath es ":memory:"
// corre in-memory (útil para tests).
//
// Schema:
//   sessions(id PK, title, created_at, updated_at, directory, model_pinned, meta_json)
//   messages(id PK, session_id FK, role, parts_json, created_at, model, tokens_json)
//   idx_messages_session_created(session_id, created_at)  ← lookup rápido
//   idx_sessions_updated(updated_at DESC)                  ← listSessions ordenado

export type SessionStoreSqliteOptions = {
  dbPath: string
  /** True para hacer WAL (más rápido, más robusto). Default true si no es ":memory:". */
  wal?: boolean
}

export class SessionStoreSqlite {
  private db: BunDatabase
  private stmts: {
    createSession: ReturnType<BunDatabase["prepare"]>
    getSession: ReturnType<BunDatabase["prepare"]>
    listSessions: ReturnType<BunDatabase["prepare"]>
    updateSession: ReturnType<BunDatabase["prepare"]>
    deleteSession: ReturnType<BunDatabase["prepare"]>
    deleteMessages: ReturnType<BunDatabase["prepare"]>
    appendMessage: ReturnType<BunDatabase["prepare"]>
    getMessages: ReturnType<BunDatabase["prepare"]>
    countSessions: ReturnType<BunDatabase["prepare"]>
    touchSession: ReturnType<BunDatabase["prepare"]>
  }

  constructor(opts: SessionStoreSqliteOptions) {
    // Aseguramos que el dir exista para paths file (no aplica a ":memory:").
    if (opts.dbPath !== ":memory:") {
      const dir = dirname(opts.dbPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    }
    const Database = getDatabase()
    this.db = new Database(opts.dbPath, { create: true })
    if ((opts.wal ?? opts.dbPath !== ":memory:")) {
      // WAL: mejor concurrencia read+write, menos I/O.
      this.db.exec("PRAGMA journal_mode = WAL;")
    }
    this.db.exec("PRAGMA foreign_keys = ON;")
    this.db.exec("PRAGMA synchronous = NORMAL;") // seguro suficiente con WAL, más rápido

    this.crearSchema()
    this.stmts = this.prepararStatements()
  }

  private crearSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        directory TEXT,
        model_pinned TEXT,
        meta_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        parts_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        model TEXT,
        tokens_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
    `)
  }

  private prepararStatements() {
    return {
      createSession: this.db.prepare(
        `INSERT INTO sessions(id, title, created_at, updated_at, directory, model_pinned, meta_json)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ),
      getSession: this.db.prepare(`SELECT * FROM sessions WHERE id = ?`),
      listSessions: this.db.prepare(`SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?`),
      updateSession: this.db.prepare(
        `UPDATE sessions SET title = ?, directory = ?, model_pinned = ?, meta_json = ?, updated_at = ? WHERE id = ?`,
      ),
      deleteSession: this.db.prepare(`DELETE FROM sessions WHERE id = ?`),
      deleteMessages: this.db.prepare(`DELETE FROM messages WHERE session_id = ?`),
      appendMessage: this.db.prepare(
        `INSERT INTO messages(id, session_id, role, parts_json, created_at, model, tokens_json)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
      ),
      getMessages: this.db.prepare(
        `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      ),
      countSessions: this.db.prepare(`SELECT COUNT(*) as c FROM sessions`),
      touchSession: this.db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`),
    }
  }

  // ── Sesiones ──
  createSession(input: Partial<Session> & Pick<Session, "id">): Session {
    const now = Date.now()
    const s: Session = {
      id: input.id,
      title: input.title,
      directory: input.directory,
      modelPinned: input.modelPinned,
      meta: input.meta,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    }
    this.stmts.createSession.run(
      s.id,
      s.title ?? null,
      s.createdAt,
      s.updatedAt,
      s.directory ?? null,
      s.modelPinned ?? null,
      s.meta ? JSON.stringify(s.meta) : null,
    )
    return s
  }

  getSession(id: string): Session | undefined {
    const row = this.stmts.getSession.get(id) as Record<string, unknown> | null
    return row ? rowToSession(row) : undefined
  }

  listSessions(opts: { limit?: number; offset?: number } = {}): Session[] {
    const rows = this.stmts.listSessions.all(opts.limit ?? 1000, opts.offset ?? 0) as Record<string, unknown>[]
    return rows.map(rowToSession)
  }

  countSessions(): number {
    const row = this.stmts.countSessions.get() as { c: number }
    return row?.c ?? 0
  }

  updateSession(id: string, patch: Partial<Omit<Session, "id" | "createdAt">>): Session | undefined {
    const current = this.getSession(id)
    if (!current) return undefined
    const next: Session = { ...current, ...patch, updatedAt: Date.now() }
    this.stmts.updateSession.run(
      next.title ?? null,
      next.directory ?? null,
      next.modelPinned ?? null,
      next.meta ? JSON.stringify(next.meta) : null,
      next.updatedAt,
      id,
    )
    return next
  }

  deleteSession(id: string): boolean {
    if (!this.getSession(id)) return false
    // CASCADE se encarga de borrar mensajes por la FK, pero por si acaso:
    this.stmts.deleteMessages.run(id)
    this.stmts.deleteSession.run(id)
    return true
  }

  // ── Mensajes ──
  appendMessage(sessionId: string, msg: Message): void {
    if (!this.getSession(sessionId)) throw new Error(`session ${sessionId} no existe`)
    this.stmts.appendMessage.run(
      msg.id,
      sessionId,
      msg.role,
      JSON.stringify(msg.parts),
      msg.createdAt,
      msg.model ?? null,
      msg.tokens ? JSON.stringify(msg.tokens) : null,
    )
    // Bumpeamos updated_at de la sesión para que suba en el sidebar.
    this.stmts.touchSession.run(Date.now(), sessionId)
  }

  getMessages(sessionId: string, opts: { limit?: number; offset?: number } = {}): Message[] {
    const rows = this.stmts.getMessages.all(sessionId, opts.limit ?? 10_000, opts.offset ?? 0) as Record<string, unknown>[]
    return rows.map(rowToMessage)
  }

  close(): void {
    this.db.close()
  }
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    title: row.title == null ? undefined : String(row.title),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    directory: row.directory == null ? undefined : String(row.directory),
    modelPinned: row.model_pinned == null ? undefined : String(row.model_pinned),
    meta: row.meta_json ? (JSON.parse(String(row.meta_json)) as Record<string, unknown>) : undefined,
  }
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    role: String(row.role) as Message["role"],
    parts: JSON.parse(String(row.parts_json)) as Message["parts"],
    createdAt: Number(row.created_at),
    model: row.model == null ? undefined : String(row.model),
    tokens: row.tokens_json ? (JSON.parse(String(row.tokens_json)) as Message["tokens"]) : undefined,
  }
}
