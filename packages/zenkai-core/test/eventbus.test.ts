import { describe, expect, test } from "bun:test"
import { EventBus, matches } from "../src/aios/eventbus"

async function tick() {
  await new Promise((r) => setTimeout(r, 5))
}

describe("EventBus · largo plazo #11", () => {
  test("subscribe + emit exact match", async () => {
    const bus = new EventBus()
    const recibidos: unknown[] = []
    bus.on("foo", (e) => { recibidos.push(e.data) })
    bus.emit("foo", { n: 1 })
    await tick()
    expect(recibidos).toEqual([{ n: 1 }])
  })

  test("wildcard *.* matchea prefijo", async () => {
    const bus = new EventBus()
    const recibidos: string[] = []
    bus.on("session.*", (e) => { recibidos.push(e.tipo) })
    bus.emit("session.created", {})
    bus.emit("session.deleted", {})
    bus.emit("otro.evento", {})
    await tick()
    expect(recibidos.sort()).toEqual(["session.created", "session.deleted"])
  })

  test("wildcard '*' catch-all", async () => {
    const bus = new EventBus()
    const recibidos: string[] = []
    bus.on("*", (e) => { recibidos.push(e.tipo) })
    bus.emit("a", {})
    bus.emit("b.c", {})
    await tick()
    expect(recibidos.sort()).toEqual(["a", "b.c"])
  })

  test("unsubscribe deja de recibir", async () => {
    const bus = new EventBus()
    const recibidos: string[] = []
    const unsub = bus.on("foo", (e) => { recibidos.push(e.tipo) })
    bus.emit("foo", {})
    unsub()
    bus.emit("foo", {})
    await tick()
    expect(recibidos.length).toBe(1)
  })

  test("once dispara solo la primera vez", async () => {
    const bus = new EventBus()
    let count = 0
    bus.once("foo", () => { count++ })
    bus.emit("foo", {})
    bus.emit("foo", {})
    bus.emit("foo", {})
    await tick()
    expect(count).toBe(1)
  })

  test("handler que tira no rompe al siguiente", async () => {
    const bus = new EventBus()
    const recibidos: string[] = []
    bus.on("foo", () => { throw new Error("boom") })
    bus.on("foo", () => { recibidos.push("ok") })
    bus.emit("foo", {})
    await tick()
    expect(recibidos).toEqual(["ok"])
  })

  test("persist callback se invoca en cada emit", async () => {
    const persistidos: string[] = []
    const bus = new EventBus({ persist: (e) => { persistidos.push(e.tipo) } })
    bus.emit("a", {})
    bus.emit("b", {})
    expect(persistidos).toEqual(["a", "b"])
  })

  test("emit devuelve conteo de handlers invocados", () => {
    const bus = new EventBus()
    bus.on("foo", () => {})
    bus.on("*", () => {})
    bus.on("bar.*", () => {})
    expect(bus.emit("foo", {})).toBe(2) // exact + wildcard
    expect(bus.emit("bar.x", {})).toBe(2) // * + bar.*
  })

  test("matches: patrones válidos", () => {
    expect(matches("*", "cualquier.cosa")).toBe(true)
    expect(matches("a", "a")).toBe(true)
    expect(matches("a", "b")).toBe(false)
    expect(matches("a.*", "a.foo")).toBe(true)
    expect(matches("a.*", "a.foo.bar")).toBe(false) // más de 1 nivel
    expect(matches("a.*", "b.foo")).toBe(false)
    expect(matches("a.*", "a")).toBe(false)
  })

  test("removeAll con y sin patrón", () => {
    const bus = new EventBus()
    bus.on("foo", () => {})
    bus.on("bar", () => {})
    bus.removeAll("foo")
    expect(bus.patrones().sort()).toEqual(["bar"])
    bus.removeAll()
    expect(bus.patrones()).toEqual([])
  })

  test("countSubscribers", () => {
    const bus = new EventBus()
    bus.on("foo", () => {})
    bus.on("foo", () => {})
    bus.on("bar", () => {})
    expect(bus.countSubscribers("foo")).toBe(2)
    expect(bus.countSubscribers("bar")).toBe(1)
    expect(bus.countSubscribers("noexiste")).toBe(0)
  })
})
