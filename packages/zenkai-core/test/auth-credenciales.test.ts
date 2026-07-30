import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  CredencialesStore,
  formatearCodigo,
  generarCodigo,
  hashearCodigo,
  normalizarCodigo,
  verificarHash,
} from "../src/auth/credenciales"
import { randomBytes } from "node:crypto"

function tmpPath(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "zk-auth-"))
  return { path: join(dir, "creds.json"), dir }
}

describe("generarCodigo · uniforme y sin ambigüedades", () => {
  test("largo 12 chars", () => {
    for (let i = 0; i < 20; i++) {
      const c = generarCodigo()
      expect(c.length).toBe(12)
    }
  })
  test("solo alfabeto sin I/O/0/1", () => {
    for (let i = 0; i < 20; i++) {
      const c = generarCodigo()
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{12}$/)
    }
  })
  test("aleatorio — 20 códigos consecutivos son distintos", () => {
    const codigos = new Set<string>()
    for (let i = 0; i < 20; i++) codigos.add(generarCodigo())
    expect(codigos.size).toBe(20)
  })
})

describe("formatear/normalizar", () => {
  test("formatearCodigo agrega separadores cada 4", () => {
    expect(formatearCodigo("ZK8FH2XQ9M4T")).toBe("ZK8F·H2XQ·9M4T")
  })
  test("normalizarCodigo quita separadores y upper", () => {
    expect(normalizarCodigo("zk8f·h2xq·9m4t")).toBe("ZK8FH2XQ9M4T")
    expect(normalizarCodigo(" ZK8F - H2XQ - 9M4T ")).toBe("ZK8FH2XQ9M4T")
  })
  test("formatearCodigo passthrough si largo != 12", () => {
    expect(formatearCodigo("ABC")).toBe("ABC")
  })
})

describe("hash + verify", () => {
  test("hash deterministic con mismo salt", () => {
    const salt = randomBytes(16)
    const h1 = hashearCodigo("ZK8FH2XQ9M4T", salt)
    const h2 = hashearCodigo("ZK8FH2XQ9M4T", salt)
    expect(h1).toBe(h2)
    expect(h1.length).toBe(64) // sha256 hex
  })
  test("hash cambia con diferente salt", () => {
    const h1 = hashearCodigo("ZK8FH2XQ9M4T", randomBytes(16))
    const h2 = hashearCodigo("ZK8FH2XQ9M4T", randomBytes(16))
    expect(h1).not.toBe(h2)
  })
  test("verificarHash timing-safe iguales", () => {
    const salt = randomBytes(16)
    const h = hashearCodigo("ABCD", salt)
    expect(verificarHash(h, h)).toBe(true)
  })
  test("verificarHash distingue", () => {
    const salt = randomBytes(16)
    const h1 = hashearCodigo("ABCD", salt)
    const h2 = hashearCodigo("EFGH", salt)
    expect(verificarHash(h1, h2)).toBe(false)
  })
})

describe("CredencialesStore · flujo completo", () => {
  test("crear + verificar código en claro", () => {
    const s = new CredencialesStore()
    const gen = s.crear("test")
    expect(gen.codigoClaro).toContain("·")
    expect(gen.id).toMatch(/^zk_/)
    const found = s.verificar(gen.codigoClaro)
    expect(found).toBeDefined()
    expect(found?.id).toBe(gen.id)
    expect(found?.nombre).toBe("test")
    expect(found?.ultimoUsoEn).toBeGreaterThan(0)
  })

  test("verificar código inválido devuelve undefined", () => {
    const s = new CredencialesStore()
    s.crear()
    expect(s.verificar("ZZZZZZZZZZZZ")).toBeUndefined()
    expect(s.verificar("muy-corto")).toBeUndefined()
    expect(s.verificar("")).toBeUndefined()
  })

  test("verificar acepta con y sin separadores", () => {
    const s = new CredencialesStore()
    const gen = s.crear()
    // Formato con · original.
    expect(s.verificar(gen.codigoClaro)).toBeDefined()
    // Sin separadores.
    expect(s.verificar(gen.codigoClaro.replace(/·/g, ""))).toBeDefined()
    // Con espacios y guiones.
    const sinSep = gen.codigoClaro.replace(/·/g, "")
    const conGuiones = `${sinSep.slice(0, 4)}-${sinSep.slice(4, 8)}-${sinSep.slice(8, 12)}`
    expect(s.verificar(conGuiones)).toBeDefined()
  })

  test("listar no expone hash ni salt", () => {
    const s = new CredencialesStore()
    s.crear("laptop")
    s.crear("mobile")
    const list = s.listar()
    expect(list.length).toBe(2)
    for (const c of list) {
      expect((c as Record<string, unknown>).hash).toBeUndefined()
      expect((c as Record<string, unknown>).salt).toBeUndefined()
      expect(c.id).toMatch(/^zk_/)
    }
  })

  test("revocar credencial deja de verificar", () => {
    const s = new CredencialesStore()
    const gen = s.crear()
    expect(s.verificar(gen.codigoClaro)).toBeDefined()
    expect(s.revocar(gen.id)).toBe(true)
    expect(s.verificar(gen.codigoClaro)).toBeUndefined()
    // Segunda revoke sobre la misma devuelve false.
    expect(s.revocar(gen.id)).toBe(false)
  })

  test("gc purga revocadas viejas", () => {
    const s = new CredencialesStore()
    const g1 = s.crear()
    s.crear() // otra no revocada
    s.revocar(g1.id)
    // No purga con default 30 días si creación es reciente.
    expect(s.gc(30)).toBe(0)
    // Purga con 0 días.
    expect(s.gc(0)).toBe(1)
  })

  test("count solo cuenta no-revocadas", () => {
    const s = new CredencialesStore()
    const g1 = s.crear()
    s.crear()
    expect(s.count()).toBe(2)
    s.revocar(g1.id)
    expect(s.count()).toBe(1)
  })

  test("persistencia entre instancias — solo hashes en disco", () => {
    const { path, dir } = tmpPath()
    try {
      const s1 = new CredencialesStore({ path })
      const gen = s1.crear("persistida")
      // Chequeo directo del archivo: NO debe contener el código en claro.
      const raw = readFileSync(path, "utf8")
      const codigoLimpio = normalizarCodigo(gen.codigoClaro)
      expect(raw).not.toContain(codigoLimpio)
      expect(raw).toContain(gen.id)
      // Nueva instancia — verifica igual.
      const s2 = new CredencialesStore({ path })
      const found = s2.verificar(gen.codigoClaro)
      expect(found?.id).toBe(gen.id)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("2 códigos distintos matchean cada uno con el suyo", () => {
    const s = new CredencialesStore()
    const a = s.crear("A")
    const b = s.crear("B")
    expect(s.verificar(a.codigoClaro)?.id).toBe(a.id)
    expect(s.verificar(b.codigoClaro)?.id).toBe(b.id)
    expect(s.verificar(a.codigoClaro)?.id).not.toBe(b.id)
  })
})
