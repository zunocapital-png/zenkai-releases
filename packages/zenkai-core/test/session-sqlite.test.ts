import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionStoreSqlite } from "../src/session/store-sqlite"

function newStore() {
  return new SessionStoreSqlite({ dbPath: ":memory:" })
}

describe("SessionStoreSqlite · medio plazo #6", () => {
  test("create + get + list", () => {
    const s = newStore()
    s.createSession({ id: "s1", title: "Chat 1" })
    s.createSession({ id: "s2", title: "Chat 2" })
    expect(s.getSession("s1")?.title).toBe("Chat 1")
    const list = s.listSessions()
    expect(list.length).toBe(2)
    expect(s.countSessions()).toBe(2)
    s.close()
  })

  test("update session + updated_at cambia", async () => {
    const s = newStore()
    const orig = s.createSession({ id: "s1", title: "old" })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const updated = s.updateSession("s1", { title: "new", directory: "/tmp" })
    expect(updated?.title).toBe("new")
    expect(updated?.directory).toBe("/tmp")
    expect(updated!.updatedAt).toBeGreaterThan(orig.updatedAt)
    s.close()
  })

  test("delete session también borra mensajes (CASCADE)", () => {
    const s = newStore()
    s.createSession({ id: "s1" })
    s.appendMessage("s1", {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "hola" }],
      createdAt: Date.now(),
    })
    expect(s.getMessages("s1").length).toBe(1)
    expect(s.deleteSession("s1")).toBe(true)
    expect(s.getSession("s1")).toBeUndefined()
    // Al re-crear la misma id, no debe traer mensajes de antes.
    s.createSession({ id: "s1" })
    expect(s.getMessages("s1").length).toBe(0)
    s.close()
  })

  test("appendMessage falla si session no existe", () => {
    const s = newStore()
    expect(() =>
      s.appendMessage("no-existe", { id: "m1", role: "user", parts: [], createdAt: 0 }),
    ).toThrow(/no existe/)
    s.close()
  })

  test("meta se persiste como JSON", () => {
    const s = newStore()
    s.createSession({ id: "s1", meta: { foo: 1, bar: ["a", "b"] } })
    const got = s.getSession("s1")
    expect(got?.meta).toEqual({ foo: 1, bar: ["a", "b"] })
    s.close()
  })

  test("mensajes retornan ordenados por createdAt asc", () => {
    const s = newStore()
    s.createSession({ id: "s1" })
    s.appendMessage("s1", { id: "m3", role: "user", parts: [{ type: "text", text: "3" }], createdAt: 300 })
    s.appendMessage("s1", { id: "m1", role: "user", parts: [{ type: "text", text: "1" }], createdAt: 100 })
    s.appendMessage("s1", { id: "m2", role: "user", parts: [{ type: "text", text: "2" }], createdAt: 200 })
    const msgs = s.getMessages("s1")
    expect(msgs.map((m) => m.id)).toEqual(["m1", "m2", "m3"])
    s.close()
  })

  test("listSessions ordena por updated_at DESC", async () => {
    const s = newStore()
    s.createSession({ id: "s1", title: "primera" })
    await new Promise((resolve) => setTimeout(resolve, 5))
    s.createSession({ id: "s2", title: "segunda" })
    await new Promise((resolve) => setTimeout(resolve, 5))
    // Bumpeamos s1 con un mensaje.
    s.appendMessage("s1", { id: "m1", role: "user", parts: [], createdAt: Date.now() })
    const list = s.listSessions()
    expect(list[0]!.id).toBe("s1") // s1 fue el último tocado
    expect(list[1]!.id).toBe("s2")
    s.close()
  })

  test("paginación con limit + offset", () => {
    const s = newStore()
    for (let i = 0; i < 20; i++) s.createSession({ id: `s${i}`, createdAt: i, title: `t${i}` })
    const page1 = s.listSessions({ limit: 5, offset: 0 })
    const page2 = s.listSessions({ limit: 5, offset: 5 })
    expect(page1.length).toBe(5)
    expect(page2.length).toBe(5)
    expect(page1[0]!.id).not.toBe(page2[0]!.id)
    s.close()
  })

  test("persistencia real en archivo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zenkai-sqlite-"))
    try {
      const dbPath = join(dir, "test.db")
      // wal:false para el test — WAL crea archivos que en Windows quedan lock
      // hasta que el GC libera. La feature WAL está probada en runtime real,
      // este test es sobre roundtrip disk.
      const s1 = new SessionStoreSqlite({ dbPath, wal: false })
      s1.createSession({ id: "s1", title: "persistida" })
      s1.appendMessage("s1", { id: "m1", role: "user", parts: [{ type: "text", text: "hola" }], createdAt: 100 })
      s1.close()
      const s2 = new SessionStoreSqlite({ dbPath, wal: false })
      expect(s2.getSession("s1")?.title).toBe("persistida")
      expect(s2.getMessages("s1").length).toBe(1)
      s2.close()
      // Pequeño yield al event loop para que Windows libere handles.
      await new Promise((resolve) => setTimeout(resolve, 50))
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* Windows a veces retiene; el temp dir se limpia solo eventualmente. */
      }
    }
  })

  test("escala: 5k sesiones y lookup rápido", () => {
    const s = newStore()
    const t0 = Date.now()
    for (let i = 0; i < 5000; i++) {
      s.createSession({ id: `s${i}`, title: `titulo ${i}`, createdAt: i, meta: { idx: i } })
    }
    const insertMs = Date.now() - t0
    expect(insertMs).toBeLessThan(5000) // < 5s para 5k inserts
    expect(s.countSessions()).toBe(5000)
    // Lookup específico rápido.
    const t1 = Date.now()
    const got = s.getSession("s4999")
    expect(Date.now() - t1).toBeLessThan(50)
    expect(got?.title).toBe("titulo 4999")
    // Listado top-50.
    const t2 = Date.now()
    const list = s.listSessions({ limit: 50 })
    expect(Date.now() - t2).toBeLessThan(100)
    expect(list.length).toBe(50)
    s.close()
  })
})
