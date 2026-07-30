import { mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"
import { cosineSim } from "../embed/embedder"
import type { Embedder } from "../embed/embedder"

// Lazy import de bun:sqlite para no romper typecheck en packages sin @types/bun.
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

// Vector store persistente sobre SQLite. Para escalar hasta ~50k documentos
// hacemos brute-force cosine sobre todos los vectores en un query (sigue siendo
// < 100ms para vectores de 768 dims). Si algún día pasamos los 100k migramos a
// sqlite-vec (extensión que aún no está en bun:sqlite estable).
//
// Schema:
//   docs(id PK, source, text, meta_json, created_at)
//   vecs(doc_id FK, dim, blob)  ← vector serializado Float32Array
//   idx_docs_source(source)
//
// API:
//   - upsert(doc): calcula embedding y guarda
//   - search(query, topK): cosine similarity, devuelve top K
//   - delete(id) / deleteBySource(source)
//   - count()

export type VectorDoc = {
  id: string
  source: string
  text: string
  meta?: Record<string, unknown>
}

export type VectorHit = VectorDoc & { similarity: number; createdAt: number }

export type VectorStoreOptions = {
  dbPath: string
  embedder: Embedder
  /** Si true, no crea WAL. Default: true si dbPath == ":memory:". */
  noWal?: boolean
}

export class VectorStoreSqlite {
  private db: BunDatabase
  private embedder: Embedder
  private stmts: {
    insertDoc: ReturnType<BunDatabase["prepare"]>
    insertVec: ReturnType<BunDatabase["prepare"]>
    getDoc: ReturnType<BunDatabase["prepare"]>
    allWithVecs: ReturnType<BunDatabase["prepare"]>
    deleteDoc: ReturnType<BunDatabase["prepare"]>
    deleteVec: ReturnType<BunDatabase["prepare"]>
    deleteBySource: ReturnType<BunDatabase["prepare"]>
    count: ReturnType<BunDatabase["prepare"]>
    deleteVecsBySource: ReturnType<BunDatabase["prepare"]>
  }

  constructor(opts: VectorStoreOptions) {
    if (opts.dbPath !== ":memory:") {
      const dir = dirname(opts.dbPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    }
    const Database = getDatabase()
    this.db = new Database(opts.dbPath, { create: true })
    const useWal = !opts.noWal && opts.dbPath !== ":memory:"
    if (useWal) this.db.exec("PRAGMA journal_mode = WAL;")
    this.db.exec("PRAGMA foreign_keys = ON;")
    this.db.exec("PRAGMA synchronous = NORMAL;")
    this.embedder = opts.embedder

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS docs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        text TEXT NOT NULL,
        meta_json TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_docs_source ON docs(source);
      CREATE TABLE IF NOT EXISTS vecs (
        doc_id TEXT PRIMARY KEY REFERENCES docs(id) ON DELETE CASCADE,
        dim INTEGER NOT NULL,
        blob BLOB NOT NULL
      );
    `)

    this.stmts = {
      insertDoc: this.db.prepare(
        `INSERT OR REPLACE INTO docs(id, source, text, meta_json, created_at) VALUES(?, ?, ?, ?, ?)`,
      ),
      insertVec: this.db.prepare(
        `INSERT OR REPLACE INTO vecs(doc_id, dim, blob) VALUES(?, ?, ?)`,
      ),
      getDoc: this.db.prepare(`SELECT * FROM docs WHERE id = ?`),
      allWithVecs: this.db.prepare(
        `SELECT d.id, d.source, d.text, d.meta_json, d.created_at, v.dim, v.blob
         FROM docs d JOIN vecs v ON d.id = v.doc_id`,
      ),
      deleteDoc: this.db.prepare(`DELETE FROM docs WHERE id = ?`),
      deleteVec: this.db.prepare(`DELETE FROM vecs WHERE doc_id = ?`),
      deleteBySource: this.db.prepare(`DELETE FROM docs WHERE source = ?`),
      deleteVecsBySource: this.db.prepare(`DELETE FROM vecs WHERE doc_id IN (SELECT id FROM docs WHERE source = ?)`),
      count: this.db.prepare(`SELECT COUNT(*) as c FROM docs`),
    }
  }

  async upsert(doc: VectorDoc): Promise<boolean> {
    const embed = await this.embedder.embed(doc.text)
    if (!embed) return false
    const blob = float32ToBlob(embed)
    // Nota: bun:sqlite tiene un tipo genérico un poco quisquilloso para transaction;
    // hacemos el insert directo (sqlite serializa acceso, no perdemos atomicidad relevante
    // para este caso — si crece a batch grande, envolvemos con BEGIN/COMMIT manual).
    this.stmts.insertDoc.run(
      doc.id,
      doc.source,
      doc.text,
      doc.meta ? JSON.stringify(doc.meta) : null,
      Date.now(),
    )
    this.stmts.insertVec.run(doc.id, embed.length, blob)
    return true
  }

  async upsertMany(docs: VectorDoc[]): Promise<number> {
    let ok = 0
    for (const d of docs) {
      if (await this.upsert(d)) ok++
    }
    return ok
  }

  async search(query: string, topK = 5): Promise<VectorHit[]> {
    const qv = await this.embedder.embed(query)
    if (!qv) return []
    const rows = this.stmts.allWithVecs.all() as Array<{
      id: string
      source: string
      text: string
      meta_json: string | null
      created_at: number
      dim: number
      blob: Uint8Array
    }>
    const hits: VectorHit[] = []
    for (const row of rows) {
      const v = blobToFloat32(row.blob)
      if (v.length !== qv.length) continue // dim mismatch → skip
      const sim = cosineSim(qv, v)
      hits.push({
        id: row.id,
        source: row.source,
        text: row.text,
        meta: row.meta_json ? (JSON.parse(row.meta_json) as Record<string, unknown>) : undefined,
        createdAt: row.created_at,
        similarity: sim,
      })
    }
    hits.sort((a, b) => b.similarity - a.similarity)
    return hits.slice(0, topK)
  }

  get(id: string): VectorDoc | undefined {
    const row = this.stmts.getDoc.get(id) as Record<string, unknown> | null
    if (!row) return undefined
    return {
      id: String(row.id),
      source: String(row.source),
      text: String(row.text),
      meta: row.meta_json ? (JSON.parse(String(row.meta_json)) as Record<string, unknown>) : undefined,
    }
  }

  delete(id: string): boolean {
    const before = this.count()
    this.stmts.deleteVec.run(id)
    this.stmts.deleteDoc.run(id)
    return this.count() < before
  }

  deleteBySource(source: string): number {
    const before = this.count()
    this.stmts.deleteVecsBySource.run(source)
    this.stmts.deleteBySource.run(source)
    return before - this.count()
  }

  count(): number {
    const row = this.stmts.count.get() as { c: number }
    return row?.c ?? 0
  }

  close(): void {
    this.db.close()
  }
}

// Serializa Float32Array a Uint8Array (blob storable). SQLite BLOB los guarda tal cual.
function float32ToBlob(vec: number[]): Uint8Array {
  const arr = new Float32Array(vec)
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
}

function blobToFloat32(blob: Uint8Array): number[] {
  // Bun devuelve Buffer o Uint8Array; ambos exponen buffer/byteOffset/byteLength.
  // El buffer subyacente puede no estar alineado a 4 bytes — copiamos primero.
  const copy = new Uint8Array(blob.byteLength)
  copy.set(blob)
  const arr = new Float32Array(copy.buffer)
  return Array.from(arr)
}
