import { describe, expect, test } from "bun:test"
import { PairingService, generarCodigoCorto, generarToken, generarQrMatrizSimple } from "../src/collab/pairing"

describe("PairingService · mobile companion #84", () => {
  test("crear + aceptar + token válido", () => {
    const p = new PairingService()
    const inv = p.crearInvitacion({ baseUrl: "http://192.168.0.10:20128" })
    expect(inv.estado).toBe("pending")
    expect(inv.code.length).toBe(6)
    expect(inv.url).toContain(inv.code)

    const r = p.aceptar(inv.code, { userAgent: "iPhone", nombre: "Test" })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.token.length).toBeGreaterThan(30)
    const v = p.verificarToken(r.token)
    expect(v.ok).toBe(true)
    expect(v.info?.nombre).toBe("Test")
  })

  test("code inválido → rechaza", () => {
    const p = new PairingService()
    const r = p.aceptar("ZZZZZZ")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain("inválido")
  })

  test("code no se puede usar dos veces", () => {
    const p = new PairingService()
    const inv = p.crearInvitacion({ baseUrl: "http://x" })
    const r1 = p.aceptar(inv.code)
    expect(r1.ok).toBe(true)
    const r2 = p.aceptar(inv.code)
    expect(r2.ok).toBe(false)
  })

  test("invitación expirada", () => {
    const p = new PairingService()
    const inv = p.crearInvitacion({ baseUrl: "http://x", ttlMs: 10 })
    // Esperamos 20ms para que expire.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r = p.aceptar(inv.code)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.motivo).toBe("expirado")
        resolve()
      }, 20)
    })
  })

  test("revocar token invalida", () => {
    const p = new PairingService()
    const inv = p.crearInvitacion({ baseUrl: "http://x" })
    const r = p.aceptar(inv.code)
    if (!r.ok) throw new Error(r.motivo)
    expect(p.verificarToken(r.token).ok).toBe(true)
    p.revocarToken(r.token)
    expect(p.verificarToken(r.token).ok).toBe(false)
  })

  test("listActivas devuelve solo aceptadas", () => {
    const p = new PairingService()
    p.crearInvitacion({ baseUrl: "http://x" }) // pending
    const i2 = p.crearInvitacion({ baseUrl: "http://x" })
    p.aceptar(i2.code)
    const activas = p.listActivas()
    expect(activas.length).toBe(1)
    expect(activas[0]!.code).toBe(i2.code)
  })

  test("generarCodigoCorto: 6 chars sin caracteres ambiguos", () => {
    for (let i = 0; i < 50; i++) {
      const c = generarCodigoCorto()
      expect(c.length).toBe(6)
      expect(c).not.toMatch(/[01OI]/)
    }
  })

  test("generarToken: 64 chars hex", () => {
    const t = generarToken()
    expect(t.length).toBe(64)
    expect(t).toMatch(/^[0-9a-f]+$/)
  })

  test("generarQrMatrizSimple: devuelve matriz cuadrada no vacía", () => {
    const m = generarQrMatrizSimple("http://192.168.0.10:20128/v2/pair?code=ABC123")
    expect(m.length).toBeGreaterThan(20)
    expect(m[0]!.length).toBe(m.length)
    // Al menos algunos módulos true (finder patterns).
    let count = 0
    for (const row of m) for (const cell of row) if (cell) count++
    expect(count).toBeGreaterThan(0)
  })

  test("gc purga invitaciones revocadas", () => {
    const p = new PairingService()
    const inv = p.crearInvitacion({ baseUrl: "http://x" })
    const r = p.aceptar(inv.code)
    if (!r.ok) throw new Error(r.motivo)
    p.revocarToken(r.token)
    const purgadas = p.gc()
    expect(purgadas).toBeGreaterThan(0)
    // Ya no aparece.
    expect(p.status(inv.code)).toBeUndefined()
  })
})
