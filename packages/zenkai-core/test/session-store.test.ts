import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionStore } from "../src/session/store.ts"

describe("SessionStore · Fase 1", () => {
  test("create + get session", () => {
    const s = new SessionStore()
    const sess = s.createSession({ id: "abc", title: "Prueba" })
    expect(sess.id).toBe("abc")
    expect(sess.title).toBe("Prueba")
    expect(s.getSession("abc")?.title).toBe("Prueba")
  })

  test("listSessions ordena por updatedAt desc", async () => {
    const s = new SessionStore()
    s.createSession({ id: "vieja", title: "V", createdAt: 100 })
    await new Promise((r) => setTimeout(r, 5))
    s.createSession({ id: "nueva", title: "N" })
    const list = s.listSessions()
    expect(list[0].id).toBe("nueva")
    expect(list[1].id).toBe("vieja")
  })

  test("append + get messages", () => {
    const s = new SessionStore()
    s.createSession({ id: "chat1" })
    s.appendMessage("chat1", { role: "user", parts: [{ type: "text", text: "hola" }] })
    s.appendMessage("chat1", { role: "assistant", parts: [{ type: "text", text: "buenas" }] })
    const msgs = s.getMessages("chat1")
    expect(msgs.length).toBe(2)
    expect(msgs[0].role).toBe("user")
    expect(msgs[1].role).toBe("assistant")
    const part0 = msgs[0].parts[0]
    expect(part0.type).toBe("text")
    if (part0.type === "text") expect(part0.text).toBe("hola")
  })

  test("appendMessage sin sesión tira error", () => {
    const s = new SessionStore()
    expect(() => s.appendMessage("no-existe", { role: "user", parts: [] })).toThrow()
  })

  test("update session actualiza updatedAt", async () => {
    const s = new SessionStore()
    const antes = s.createSession({ id: "u1" })
    await new Promise((r) => setTimeout(r, 5))
    const despues = s.updateSession("u1", { title: "renombrado" })
    expect(despues?.title).toBe("renombrado")
    expect(despues!.updatedAt).toBeGreaterThan(antes.updatedAt)
  })

  test("deleteSession limpia sesión y mensajes", () => {
    const s = new SessionStore()
    s.createSession({ id: "borra" })
    s.appendMessage("borra", { role: "user", parts: [] })
    expect(s.deleteSession("borra")).toBe(true)
    expect(s.getSession("borra")).toBeUndefined()
    expect(s.getMessages("borra")).toEqual([])
  })

  test("clearMessages vacía sin borrar la sesión", () => {
    const s = new SessionStore()
    s.createSession({ id: "clean" })
    s.appendMessage("clean", { role: "user", parts: [] })
    s.clearMessages("clean")
    expect(s.getSession("clean")).toBeDefined()
    expect(s.getMessages("clean")).toEqual([])
  })

  test("persistencia a disco: se puede recargar", () => {
    const dir = mkdtempSync(join(tmpdir(), "zenkai-core-test-"))
    try {
      // Store A: escribe.
      const a = new SessionStore({ persistDir: dir })
      a.createSession({ id: "persistente", title: "Sesión con disco" })
      a.appendMessage("persistente", { role: "user", parts: [{ type: "text", text: "hola disco" }] })

      // Store B: nuevo, carga desde el mismo dir.
      const b = new SessionStore({ persistDir: dir })
      const sess = b.getSession("persistente")
      expect(sess?.title).toBe("Sesión con disco")
      const msgs = b.getMessages("persistente")
      expect(msgs.length).toBe(1)
      const p = msgs[0].parts[0]
      if (p.type === "text") expect(p.text).toBe("hola disco")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
