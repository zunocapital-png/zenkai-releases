import { describe, expect, test } from "bun:test"
import { CollabHub } from "../src/collab/hub"
import type { CollabEvento } from "../src/collab/hub"

function crearHub() {
  return new CollabHub()
}

describe("CollabHub · medio plazo #10", () => {
  test("entrar + salir maneja presencias", () => {
    const h = crearHub()
    const recibidos: CollabEvento[] = []
    h.entrar("room1", { id: "c1", onEvent: (e) => recibidos.push(e) })
    expect(h.conteoClientes("room1")).toBe(1)
    h.salir("room1", "c1")
    expect(h.conteoClientes("room1")).toBe(0)
  })

  test("broadcast alcanza a otros clientes", () => {
    const h = crearHub()
    const eventos1: CollabEvento[] = []
    const eventos2: CollabEvento[] = []
    h.entrar("r", { id: "c1", onEvent: (e) => eventos1.push(e) })
    h.entrar("r", { id: "c2", onEvent: (e) => eventos2.push(e) })
    // c1 debería recibir el join de c2.
    expect(eventos1.some((e) => e.tipo === "presence.join" && (e.data as { id: string }).id === "c2")).toBe(true)
    // Publicar mensaje custom.
    h.publicar({ tipo: "message.append", roomId: "r", clienteId: "c1", data: { text: "hola" } })
    expect(eventos2.some((e) => e.tipo === "message.append")).toBe(true)
  })

  test("excluirEmisor no envía el evento a quien lo emite", () => {
    const h = crearHub()
    const eventos1: CollabEvento[] = []
    const eventos2: CollabEvento[] = []
    h.entrar("r", { id: "c1", onEvent: (e) => eventos1.push(e) })
    h.entrar("r", { id: "c2", onEvent: (e) => eventos2.push(e) })
    eventos1.length = 0
    eventos2.length = 0
    h.publicar(
      { tipo: "presence.cursor", roomId: "r", clienteId: "c1", data: { x: 10 } },
      { excluirEmisor: true },
    )
    expect(eventos1.length).toBe(0)
    expect(eventos2.length).toBe(1)
  })

  test("historial guarda últimos N eventos", () => {
    const h = crearHub()
    h.entrar("r", { id: "c1", onEvent: () => {} })
    for (let i = 0; i < 20; i++) {
      h.publicar({ tipo: "message.append", roomId: "r", clienteId: "c1", data: { n: i } })
    }
    const hist = h.obtenerHistorial("r", 10)
    expect(hist.length).toBe(10)
    expect((hist[9]!.data as { n: number }).n).toBe(19) // último = 19
  })

  test("data no-serializable rechazada", () => {
    const h = crearHub()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() =>
      h.publicar({ tipo: "custom", roomId: "r", clienteId: "c1", data: circular }),
    ).toThrow(/JSON-serializable/)
  })

  test("cliente que tira excepción no rompe broadcast a los demás", () => {
    const h = crearHub()
    const buenos: CollabEvento[] = []
    h.entrar("r", { id: "c-malo", onEvent: () => { throw new Error("boom") } })
    h.entrar("r", { id: "c-bueno", onEvent: (e) => buenos.push(e) })
    // Publicamos de un emisor externo — llega a ambos, el malo tira, el bueno recibe.
    const entregas = h.publicar({ tipo: "custom", roomId: "r", clienteId: "x", data: { ok: 1 } })
    expect(entregas).toBe(1) // solo c-bueno cuenta como entrega exitosa
    expect(buenos.length).toBe(1)
  })

  test("presencias devuelve todos los clientes en la sala", () => {
    const h = crearHub()
    h.entrar("r", { id: "c1", nombre: "Ana", color: "#f00", onEvent: () => {} })
    h.entrar("r", { id: "c2", nombre: "Bob", color: "#0f0", onEvent: () => {} })
    const p = h.presencias("r")
    expect(p.length).toBe(2)
    expect(p.map((x) => x.nombre).sort()).toEqual(["Ana", "Bob"])
  })

  test("salir limpia room si queda vacío", () => {
    const h = crearHub()
    h.entrar("r", { id: "c1", onEvent: () => {} })
    h.salir("r", "c1")
    expect(h.salasActivas()).not.toContain("r")
  })

  test("entrar devuelve la lista de otros clientes ya presentes", () => {
    const h = crearHub()
    h.entrar("r", { id: "c1", nombre: "Ana", onEvent: () => {} })
    const otros = h.entrar("r", { id: "c2", nombre: "Bob", onEvent: () => {} })
    expect(otros.length).toBe(1)
    expect(otros[0]!.nombre).toBe("Ana")
  })
})
