import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  parseZenkaiFile,
  serializarZenkaiFile,
  crearModeloDesdeZenkaiFile,
} from "../src/runtime/zenkaifile"
import { ModelRegistry } from "../src/runtime/model-registry"

describe("ZenkaiFile · paridad + mejora Modelfile", () => {
  test("parse mínimo con FROM", () => {
    const s = parseZenkaiFile("FROM qwen-7b")
    expect(s.base).toBe("qwen-7b")
    expect(s.parameters).toEqual({})
  })

  test("parse falla sin FROM", () => {
    expect(() => parseZenkaiFile("SYSTEM hola")).toThrow(/FROM/)
  })

  test("parse SYSTEM con comillas triples multiline", () => {
    const raw = `FROM x
SYSTEM """Sos un
asistente de código"""`
    const s = parseZenkaiFile(raw)
    expect(s.system).toContain("Sos un")
    expect(s.system).toContain("asistente de código")
  })

  test("parse PARAMETER numérico vs string", () => {
    const s = parseZenkaiFile(`FROM x
PARAMETER temperature 0.3
PARAMETER ctx_size 8192
PARAMETER template chatml`)
    expect(s.parameters.temperature).toBe(0.3)
    expect(s.parameters.ctx_size).toBe(8192)
    expect(s.parameters.template).toBe("chatml")
  })

  test("parse CAPABILITY, MEMORY y TOOLS", () => {
    const s = parseZenkaiFile(`FROM x
CAPABILITY tools
CAPABILITY vision
MEMORY El usuario prefiere respuestas concisas
MEMORY Idioma: español rioplatense
TOOLS read, write, bash`)
    expect(s.capabilities).toEqual(["tools", "vision"])
    expect(s.memory.length).toBe(2)
    expect(s.tools).toEqual(["read", "write", "bash"])
  })

  test("parse ignora líneas vacías y comentarios", () => {
    const s = parseZenkaiFile(`# comentario
FROM x
# otro
PARAMETER temperature 0.5

# final`)
    expect(s.base).toBe("x")
    expect(s.parameters.temperature).toBe(0.5)
  })

  test("case-insensitive keys", () => {
    const s = parseZenkaiFile("from x\nsystem hola\nparameter temperature 0.1")
    expect(s.base).toBe("x")
    expect(s.system).toBe("hola")
    expect(s.parameters.temperature).toBe(0.1)
  })

  test("serializar roundtrip", () => {
    const spec = {
      base: "qwen-7b",
      system: "Sos conciso",
      parameters: { temperature: 0.2, ctx_size: 4096 },
      template: "chatml",
      adapter: "/lora.gguf",
      capabilities: ["tools"],
      memory: ["dato uno"],
      tools: ["read", "bash"],
    }
    const texto = serializarZenkaiFile(spec)
    const reparsed = parseZenkaiFile(texto)
    expect(reparsed.base).toBe(spec.base)
    expect(reparsed.system).toBe(spec.system)
    expect(reparsed.parameters.temperature).toBe(0.2)
    expect(reparsed.template).toBe("chatml")
    expect(reparsed.adapter).toBe("/lora.gguf")
    expect(reparsed.tools).toEqual(spec.tools)
  })

  test("crearModeloDesdeZenkaiFile registra custom con base compartido", () => {
    const dir = mkdtempSync(join(tmpdir(), "zf-test-"))
    try {
      const gguf = join(dir, "base.gguf")
      writeFileSync(gguf, new Uint8Array(100))
      const reg = new ModelRegistry({ modelsDir: dir })
      reg.register({ id: "base-model", path: gguf, nombre: "Base", capabilities: ["tools", "completion"] })

      const spec = parseZenkaiFile(`FROM base-model
SYSTEM Sos un revisor de código senior
PARAMETER temperature 0.2
PARAMETER ctx_size 8192
MEMORY El usuario prefiere respuestas en español`)
      const custom = crearModeloDesdeZenkaiFile(reg, "reviewer", spec)
      expect(custom.id).toBe("reviewer")
      expect(custom.path).toBe(gguf) // shared con base
      expect(custom.systemDefault).toContain("revisor de código senior")
      expect(custom.systemDefault).toContain("prefiere respuestas en español")
      expect(custom.paramsDefault?.temperature).toBe(0.2)
      expect(custom.paramsDefault?.ctx_size).toBe(8192)
      expect(reg.list().length).toBe(2)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("crearModeloDesdeZenkaiFile falla si base no existe", () => {
    const dir = mkdtempSync(join(tmpdir(), "zf-fail-"))
    try {
      const reg = new ModelRegistry({ modelsDir: dir })
      const spec = parseZenkaiFile("FROM no-existe")
      expect(() => crearModeloDesdeZenkaiFile(reg, "custom", spec)).toThrow(/no está en el registry/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
