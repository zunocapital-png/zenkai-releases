import { describe, expect, test } from "bun:test"
import {
  construirJsonl,
  estadisticasDataset,
  generarModelfileOllama,
} from "../src/finetune/dataset"
import type { DatasetSample } from "../src/finetune/dataset"

const SAMPLES: DatasetSample[] = [
  {
    messages: [
      { id: "1", role: "user", parts: [{ type: "text", text: "hola" }], createdAt: 1 },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "hola, ¿qué tal?" }], createdAt: 2 },
    ],
  },
  {
    messages: [
      { id: "3", role: "user", parts: [{ type: "text", text: "sumá 2+2" }], createdAt: 3 },
      { id: "4", role: "assistant", parts: [{ type: "text", text: "4" }], createdAt: 4 },
    ],
  },
  {
    // Sample solo con user (para probar requerirPar).
    messages: [{ id: "5", role: "user", parts: [{ type: "text", text: "solo" }], createdAt: 5 }],
  },
]

describe("Fine-tune dataset · medio plazo #8", () => {
  test("formato ollama produce shape {messages}", () => {
    const jsonl = construirJsonl(SAMPLES.slice(0, 1), { format: "ollama" })
    const parsed = JSON.parse(jsonl)
    expect(parsed.messages.length).toBe(2)
    expect(parsed.messages[0].role).toBe("user")
    expect(parsed.messages[0].content).toBe("hola")
  })

  test("formato sharegpt produce shape {conversations, from/value}", () => {
    const jsonl = construirJsonl(SAMPLES.slice(0, 1), { format: "sharegpt" })
    const parsed = JSON.parse(jsonl)
    expect(parsed.conversations.length).toBe(2)
    expect(parsed.conversations[0].from).toBe("human")
    expect(parsed.conversations[1].from).toBe("gpt")
    expect(parsed.conversations[1].value).toBe("hola, ¿qué tal?")
  })

  test("una línea JSONL por sample", () => {
    const jsonl = construirJsonl(SAMPLES.slice(0, 2), { format: "ollama" })
    const lines = jsonl.split("\n")
    expect(lines.length).toBe(2)
    expect(() => JSON.parse(lines[0]!)).not.toThrow()
    expect(() => JSON.parse(lines[1]!)).not.toThrow()
  })

  test("requerirPar=true descarta samples sin ambos roles", () => {
    const jsonl = construirJsonl(SAMPLES, { format: "ollama", requerirPar: true })
    const lines = jsonl.split("\n").filter(Boolean)
    expect(lines.length).toBe(2) // el 3ro (solo user) queda fuera
  })

  test("tool-calls e imágenes se serializan como texto placeholder", () => {
    const jsonl = construirJsonl(
      [
        {
          messages: [
            {
              id: "1",
              role: "assistant",
              parts: [
                { type: "text", text: "voy a revisar" },
                { type: "tool-call", toolCallId: "t1", toolName: "read", args: { path: "/foo" } },
              ],
              createdAt: 0,
            },
          ],
        },
      ],
      { format: "ollama" },
    )
    const parsed = JSON.parse(jsonl)
    expect(parsed.messages[0].content).toContain("voy a revisar")
    expect(parsed.messages[0].content).toContain("[usé tool read")
  })

  test("estadisticasDataset cuenta correctamente", () => {
    const stats = estadisticasDataset(SAMPLES)
    expect(stats.totalConversaciones).toBe(3)
    expect(stats.totalTurnos).toBe(5)
    expect(stats.turnosUser).toBe(3)
    expect(stats.turnosAssistant).toBe(2)
    expect(stats.caracteresTotales).toBeGreaterThan(0)
    expect(stats.charsPromedioTurno).toBeGreaterThan(0)
  })

  test("generarModelfileOllama produce sintaxis válida", () => {
    const mf = generarModelfileOllama({
      baseModel: "qwen2.5-coder:7b",
      adapterPath: "./adapter.gguf",
      system: "sos un asistente conciso",
      temperature: 0.3,
    })
    expect(mf).toContain("FROM qwen2.5-coder:7b")
    expect(mf).toContain("ADAPTER ./adapter.gguf")
    expect(mf).toContain('SYSTEM """sos un asistente conciso"""')
    expect(mf).toContain("PARAMETER temperature 0.3")
  })

  test("Modelfile sin system/temperature", () => {
    const mf = generarModelfileOllama({ baseModel: "llama3", adapterPath: "./a.gguf" })
    expect(mf).toContain("FROM llama3")
    expect(mf).toContain("ADAPTER ./a.gguf")
    expect(mf).not.toContain("SYSTEM")
    expect(mf).not.toContain("PARAMETER")
  })

  test("escapa comillas dobles en system", () => {
    const mf = generarModelfileOllama({
      baseModel: "l",
      adapterPath: "a",
      system: 'usar "comillas"',
    })
    expect(mf).toContain('usar \\"comillas\\"')
  })
})
