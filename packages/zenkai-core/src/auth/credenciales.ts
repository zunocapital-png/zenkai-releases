import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

// Generador y verificador de credenciales tipo código de acceso.
//
// Filosofía:
//   - CERO email, cero password, cero PII. Solo un código opaco que el usuario
//     copia y usa. Es su responsabilidad guardarlo.
//   - Los códigos se muestran UNA SOLA VEZ al generarlos. En disco guardamos
//     un HASH (sha256+salt) — nunca el código en claro. Si el usuario lo
//     pierde, genera uno nuevo.
//   - Formato humano-friendly: ZK8F·H2XQ·9M4T (12 chars alfanuméricos sin
//     ambigüedades I/O/0/1). Tokens crypto-random uniformes.
//   - Verificación timing-safe para evitar side-channels.

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const LARGO = 12
const SALT_BYTES = 16

export type CredencialGenerada = {
  /** Código en claro — mostrar 1 sola vez al usuario. */
  codigoClaro: string
  /** ID público asociado (uuid-like) para referenciar sin exponer el código. */
  id: string
  /** Timestamp de creación. */
  creadaEn: number
}

export type CredencialAlmacenada = {
  id: string
  hash: string
  salt: string
  creadaEn: number
  ultimoUsoEn?: number
  nombre?: string // etiqueta opcional que el usuario ponga (ej. "Laptop trabajo")
  revocada?: boolean
}

export type StoreCredenciales = {
  version: 1
  credenciales: CredencialAlmacenada[]
}

/**
 * Genera un código aleatorio uniforme 12 chars con separadores visuales
 * cada 4: ZK8F·H2XQ·9M4T. Los separadores NO son parte del código real,
 * son solo visuales; el validador los ignora.
 */
export function generarCodigo(): string {
  const buf = randomBytes(LARGO * 2)
  let out = ""
  for (let i = 0; i < LARGO; i++) {
    // Uniformidad: descartamos bytes ≥ 32*8 = 256 hasta que caiga en rango.
    let byte = buf[i]!
    while (byte >= 256 - (256 % ALFABETO.length)) {
      byte = randomBytes(1)[0]!
    }
    out += ALFABETO[byte % ALFABETO.length]
  }
  return out
}

/** Formatea 12 chars como ZK8F·H2XQ·9M4T para mostrar al usuario. */
export function formatearCodigo(codigo: string): string {
  const clean = codigo.replace(/[^A-Z0-9]/gi, "").toUpperCase()
  if (clean.length !== LARGO) return codigo
  return `${clean.slice(0, 4)}·${clean.slice(4, 8)}·${clean.slice(8, 12)}`
}

/** Quita separadores y normaliza a upper — para comparar/hashear. */
export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/[^A-Z0-9]/gi, "").toUpperCase()
}

/** ID público asociado a la credencial (para referenciar sin exponer el código). */
function generarId(): string {
  return "zk_" + randomBytes(9).toString("hex")
}

/** Hash sha256(salt || codigo) — deterministic given salt. */
export function hashearCodigo(codigo: string, salt: Buffer): string {
  const h = createHash("sha256")
  h.update(salt)
  h.update(normalizarCodigo(codigo), "utf8")
  return h.digest("hex")
}

/** Comparación timing-safe entre 2 hashes hex del mismo largo. */
export function verificarHash(hashCandidato: string, hashAlmacenado: string): boolean {
  const a = Buffer.from(hashCandidato, "hex")
  const b = Buffer.from(hashAlmacenado, "hex")
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

export type CredencialesStoreOptions = {
  /** Path al JSON. Si es undefined, todo en memoria (útil para tests). */
  path?: string
}

/**
 * Storage encima de un JSON local (o memoria). Guarda solo hashes.
 * Métodos: crear, verificar, listar, revocar, gc.
 */
export class CredencialesStore {
  private state: StoreCredenciales
  private path: string | undefined

  constructor(opts: CredencialesStoreOptions = {}) {
    this.path = opts.path
    this.state = this.cargar()
  }

  private cargar(): StoreCredenciales {
    if (!this.path || !existsSync(this.path)) return { version: 1, credenciales: [] }
    try {
      const p = JSON.parse(readFileSync(this.path, "utf8")) as StoreCredenciales
      if (p?.version === 1 && Array.isArray(p.credenciales)) return p
    } catch { /* corrupt */ }
    return { version: 1, credenciales: [] }
  }

  private guardar(): void {
    if (!this.path) return
    const dir = dirname(this.path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.state, null, 2), "utf8")
  }

  /** Crea una nueva credencial. Devuelve el código en claro UNA SOLA VEZ. */
  crear(nombre?: string): CredencialGenerada {
    const codigoClaro = generarCodigo()
    const salt = randomBytes(SALT_BYTES)
    const hash = hashearCodigo(codigoClaro, salt)
    const almacenada: CredencialAlmacenada = {
      id: generarId(),
      hash,
      salt: salt.toString("hex"),
      creadaEn: Date.now(),
      nombre,
    }
    this.state.credenciales.push(almacenada)
    this.guardar()
    return {
      codigoClaro: formatearCodigo(codigoClaro),
      id: almacenada.id,
      creadaEn: almacenada.creadaEn,
    }
  }

  /**
   * Verifica un código contra todas las credenciales almacenadas.
   * Devuelve la credencial encontrada o undefined. Marca ultimoUsoEn si match.
   */
  verificar(codigoUsuario: string): CredencialAlmacenada | undefined {
    const normalizado = normalizarCodigo(codigoUsuario)
    if (normalizado.length !== LARGO) return undefined
    for (const c of this.state.credenciales) {
      if (c.revocada) continue
      const salt = Buffer.from(c.salt, "hex")
      const hashCandidato = hashearCodigo(normalizado, salt)
      if (verificarHash(hashCandidato, c.hash)) {
        c.ultimoUsoEn = Date.now()
        this.guardar()
        return c
      }
    }
    return undefined
  }

  /** Lista credenciales sin exponer hashes (solo metadata). */
  listar(): Array<Omit<CredencialAlmacenada, "hash" | "salt">> {
    return this.state.credenciales.map(({ hash, salt, ...meta }) => {
      void hash; void salt // silenciar unused
      return meta
    })
  }

  /** Revoca por id — la credencial no vuelve a verificar. */
  revocar(id: string): boolean {
    const c = this.state.credenciales.find((x) => x.id === id)
    if (!c || c.revocada) return false
    c.revocada = true
    this.guardar()
    return true
  }

  /** Purga revocadas más viejas que N días (inclusive el mismo ms para gc(0)). */
  gc(diasMinimosRevocadas = 30): number {
    const cutoff = Date.now() - diasMinimosRevocadas * 24 * 60 * 60 * 1000
    const antes = this.state.credenciales.length
    this.state.credenciales = this.state.credenciales.filter(
      (c) => !(c.revocada && c.creadaEn <= cutoff),
    )
    const quitadas = antes - this.state.credenciales.length
    if (quitadas > 0) this.guardar()
    return quitadas
  }

  count(): number {
    return this.state.credenciales.filter((c) => !c.revocada).length
  }
}
