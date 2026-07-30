import { describe, expect, test } from "bun:test"
import { contabilizarVotos, consultarParlamento } from "../src/aios/parliament"
import type { MiembroParlamento, VotoParlamento } from "../src/aios/parliament"
import type { ChatFn } from "../src/harness/reflector"

function stubChat(map: Record<string, string>): ChatFn {
  return async (req) => {
    const contenido = map[req.model] ?? '{"voto":"abstain","confianza":0}'
    return {
      provider: "stub",
      model: req.model,
      content: contenido,
      latencyMs: 5,
    }
  }
}

describe("AI Parliament · largo plazo #13", () => {
  test("majority simple", async () => {
    const chat = stubChat({
      m1: '{"voto":"si","confianza":0.9}',
      m2: '{"voto":"si","confianza":0.8}',
      m3: '{"voto":"no","confianza":0.7}',
    })
    const r = await consultarParlamento({
      pregunta: "¿es seguro borrar?",
      miembros: [{ modelo: "m1" }, { modelo: "m2" }, { modelo: "m3" }],
      chat,
    })
    expect(r.decision).toBe("si")
    expect(r.votosSi).toBe(2)
    expect(r.votosNo).toBe(1)
  })

  test("empate votos → desempata confianza", async () => {
    const chat = stubChat({
      m1: '{"voto":"si","confianza":0.9}',
      m2: '{"voto":"no","confianza":0.3}',
    })
    const r = await consultarParlamento({
      pregunta: "?",
      miembros: [{ modelo: "m1" }, { modelo: "m2" }],
      chat,
    })
    expect(r.decision).toBe("si")
  })

  test("pesos: 1 miembro con peso 3 vence a 2 con peso 1", async () => {
    const chat = stubChat({
      pesado: '{"voto":"no","confianza":0.9}',
      liviano1: '{"voto":"si","confianza":0.9}',
      liviano2: '{"voto":"si","confianza":0.9}',
    })
    const r = await consultarParlamento({
      pregunta: "?",
      miembros: [
        { modelo: "pesado", peso: 3 },
        { modelo: "liviano1", peso: 1 },
        { modelo: "liviano2", peso: 1 },
      ],
      chat,
    })
    expect(r.decision).toBe("no") // 3 vs 2
  })

  test("todos abstain → decision=empate", async () => {
    const chat = stubChat({
      m1: '{"voto":"abstain","confianza":0}',
      m2: '{"voto":"abstain","confianza":0}',
    })
    const r = await consultarParlamento({
      pregunta: "?",
      miembros: [{ modelo: "m1" }, { modelo: "m2" }],
      chat,
    })
    expect(r.decision).toBe("empate")
    expect(r.votosAbstain).toBe(2)
    expect(r.quorum).toBe(0)
  })

  test("modelo con JSON roto vota abstain sin error del parlamento", async () => {
    const chat = stubChat({
      m1: '{"voto":"si","confianza":0.9}',
      m2: "esto no es JSON en absoluto",
    })
    const r = await consultarParlamento({
      pregunta: "?",
      miembros: [{ modelo: "m1" }, { modelo: "m2" }],
      chat,
    })
    expect(r.decision).toBe("si") // 1 si, 1 abstain
    expect(r.votosAbstain).toBe(1)
  })

  test("modelo que tira excepción → voto con error", async () => {
    const chat: ChatFn = async (req) => {
      if (req.model === "roto") throw new Error("500")
      return { provider: "s", model: req.model, content: '{"voto":"si","confianza":1}', latencyMs: 1 }
    }
    const r = await consultarParlamento({
      pregunta: "?",
      miembros: [{ modelo: "ok" }, { modelo: "roto" }],
      chat,
    })
    expect(r.decision).toBe("si")
    expect(r.votos.find((v) => v.miembro === "roto")?.error).toBeDefined()
    expect(r.votos.find((v) => v.miembro === "roto")?.voto).toBe("abstain")
  })

  test("contabilizarVotos aislado: 3 sí vs 2 no", () => {
    const votos: VotoParlamento[] = [
      { miembro: "a", voto: "si", confianza: 1, latencyMs: 1 },
      { miembro: "b", voto: "si", confianza: 1, latencyMs: 1 },
      { miembro: "c", voto: "si", confianza: 1, latencyMs: 1 },
      { miembro: "d", voto: "no", confianza: 1, latencyMs: 1 },
      { miembro: "e", voto: "no", confianza: 1, latencyMs: 1 },
    ]
    const miembros: MiembroParlamento[] = votos.map((v) => ({ modelo: v.miembro }))
    const r = contabilizarVotos(votos, miembros)
    expect(r.decision).toBe("si")
    expect(r.quorum).toBe(5)
  })

  test("confianza fuera de rango se clampa a 0..1", async () => {
    const chat = stubChat({
      m1: '{"voto":"si","confianza":5.7}', // > 1
    })
    const r = await consultarParlamento({ pregunta: "?", miembros: [{ modelo: "m1" }], chat })
    expect(r.votos[0]!.confianza).toBe(1)
  })

  test("acepta voto en formato alternativo (sí, yes)", async () => {
    const chat = stubChat({
      m1: '{"voto":"sí","confianza":0.9}',
      m2: '{"voto":"yes","confianza":0.9}',
    })
    const r = await consultarParlamento({
      pregunta: "?",
      miembros: [{ modelo: "m1" }, { modelo: "m2" }],
      chat,
    })
    expect(r.votosSi).toBe(2)
  })
})
