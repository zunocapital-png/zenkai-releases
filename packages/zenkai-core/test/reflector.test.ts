import { describe, expect, test } from "bun:test"
import { reflexionar } from "../src/harness/reflector"
import type { ChatFn } from "../src/harness/reflector"
import type { ChatRequest, ChatResponse } from "../src/provider/types"

function stubChat(content: string): ChatFn {
  return async (_req: ChatRequest): Promise<ChatResponse> => ({
    provider: "stub",
    model: "stub-model",
    content,
    latencyMs: 5,
  })
}

describe("Reflector · corto plazo #3", () => {
  test("parsea JSON limpio y clampea puntaje", async () => {
    const chat = stubChat(
      JSON.stringify({
        puntaje: 8.5,
        problemasDetectados: true,
        problemas: ["falta manejo de error"],
        sugerencia: "añadir try/catch",
        respuestaMejorada: null,
      }),
    )
    const r = await reflexionar(
      { pregunta: "¿qué falta acá?", respuesta: "función suma()", modelo: "m1" },
      chat,
    )
    expect(r.puntaje).toBe(8.5)
    expect(r.problemasDetectados).toBe(true)
    expect(r.problemas).toEqual(["falta manejo de error"])
    expect(r.sugerencia).toBe("añadir try/catch")
    expect(r.respuestaMejorada).toBeUndefined()
    expect(r.modeloReflector).toBe("stub/stub-model")
  })

  test("parsea JSON dentro de fenced code block", async () => {
    const chat = stubChat(
      "Acá va mi análisis:\n```json\n" +
        JSON.stringify({ puntaje: 6, problemasDetectados: false, problemas: [] }) +
        "\n```\nEso es todo.",
    )
    const r = await reflexionar(
      { pregunta: "x", respuesta: "y", modelo: "m1" },
      chat,
    )
    expect(r.puntaje).toBe(6)
    expect(r.problemasDetectados).toBe(false)
  })

  test("extrae primer objeto {...} balanceado", async () => {
    const chat = stubChat(
      'Prosa introductoria { "puntaje": 3, "problemasDetectados": true, "problemas": ["error 1"] } y más texto después.',
    )
    const r = await reflexionar(
      { pregunta: "x", respuesta: "y", modelo: "m1" },
      chat,
    )
    expect(r.puntaje).toBe(3)
    expect(r.problemas).toEqual(["error 1"])
  })

  test("fallback conservador cuando el JSON está roto", async () => {
    const chat = stubChat("Esto no es JSON en absoluto {broken")
    const r = await reflexionar(
      { pregunta: "x", respuesta: "y", modelo: "m1" },
      chat,
    )
    expect(r.puntaje).toBe(5)
    expect(r.problemasDetectados).toBe(false)
    expect(r.problemas).toEqual([])
  })

  test("clampea puntaje fuera de rango", async () => {
    const chat = stubChat(JSON.stringify({ puntaje: 15, problemasDetectados: false, problemas: [] }))
    const r = await reflexionar({ pregunta: "x", respuesta: "y", modelo: "m1" }, chat)
    expect(r.puntaje).toBe(10)

    const chat2 = stubChat(JSON.stringify({ puntaje: -3, problemasDetectados: false, problemas: [] }))
    const r2 = await reflexionar({ pregunta: "x", respuesta: "y", modelo: "m1" }, chat2)
    expect(r2.puntaje).toBe(0)
  })

  test("mejorar=true incluye respuestaMejorada", async () => {
    const chat = stubChat(
      JSON.stringify({
        puntaje: 4,
        problemasDetectados: true,
        problemas: ["poco claro"],
        sugerencia: "aclarar",
        respuestaMejorada: "Aquí una versión más clara: ...",
      }),
    )
    const r = await reflexionar(
      { pregunta: "x", respuesta: "y", modelo: "m1" },
      chat,
      { mejorar: true },
    )
    expect(r.respuestaMejorada).toBe("Aquí una versión más clara: ...")
  })

  test("pasa el prompt correcto al chat (contexto + pregunta + respuesta)", async () => {
    let capturedReq: ChatRequest | undefined
    const chat: ChatFn = async (req) => {
      capturedReq = req
      return {
        provider: "stub",
        model: "m",
        content: JSON.stringify({ puntaje: 7, problemasDetectados: false, problemas: [] }),
        latencyMs: 1,
      }
    }
    await reflexionar(
      { pregunta: "¿qué es X?", respuesta: "X es Y", contexto: "SYSTEM: sé conciso", modelo: "gpt-x" },
      chat,
    )
    expect(capturedReq).toBeDefined()
    expect(capturedReq!.model).toBe("gpt-x")
    expect(capturedReq!.messages.length).toBe(2)
    const userText = (capturedReq!.messages[1]!.parts[0] as { type: "text"; text: string }).text
    expect(userText).toContain("¿qué es X?")
    expect(userText).toContain("X es Y")
    expect(userText).toContain("SYSTEM: sé conciso")
  })

  test("filtra problemas que no son strings", async () => {
    const chat = stubChat(
      JSON.stringify({
        puntaje: 5,
        problemasDetectados: true,
        problemas: ["real", 123, null, "otro"],
      }),
    )
    const r = await reflexionar({ pregunta: "x", respuesta: "y", modelo: "m1" }, chat)
    expect(r.problemas).toEqual(["real", "otro"])
  })

  test("latencyMs se registra", async () => {
    const chat: ChatFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return {
        provider: "stub",
        model: "m",
        content: JSON.stringify({ puntaje: 7, problemasDetectados: false, problemas: [] }),
        latencyMs: 20,
      }
    }
    const r = await reflexionar({ pregunta: "x", respuesta: "y", modelo: "m1" }, chat)
    expect(r.latencyMs).toBeGreaterThanOrEqual(20)
  })
})
