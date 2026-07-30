import { describe, expect, test } from "bun:test"
import { correrCodigo, correrSandbox } from "../src/aios/sandbox"

describe("Sandbox · largo plazo #12", () => {
  test("correrCodigo node imprime stdout y sale 0", async () => {
    const r = await correrCodigo({ lenguaje: "node", codigo: "console.log('hola sandbox')" })
    expect(r.ok).toBe(true)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("hola sandbox")
    expect(r.timeout).toBe(false)
  })

  test("exit code no-cero → ok=false", async () => {
    const r = await correrCodigo({ lenguaje: "node", codigo: "process.exit(3)" })
    expect(r.ok).toBe(false)
    expect(r.exitCode).toBe(3)
  })

  test("timeout mata el proceso y marca timeout=true", async () => {
    const r = await correrCodigo({
      lenguaje: "node",
      codigo: "setInterval(() => {}, 1000); console.log('cargado')",
      timeoutMs: 300,
    })
    expect(r.timeout).toBe(true)
    expect(r.ok).toBe(false)
    // Windows: signal puede ser null, exitCode puede ser 1 o null; el flag timeout es lo importante.
  })

  test("env whitelist — no hereda secretos del proceso padre", async () => {
    process.env.ZENKAI_TEST_SECRET = "no-debe-verse"
    try {
      const r = await correrCodigo({
        lenguaje: "node",
        codigo: "console.log('secret:', process.env.ZENKAI_TEST_SECRET || 'undefined')",
      })
      expect(r.stdout).toContain("secret: undefined")
    } finally {
      delete process.env.ZENKAI_TEST_SECRET
    }
  })

  test("env whitelist — pasa variables explícitamente", async () => {
    const r = await correrCodigo({
      lenguaje: "node",
      codigo: "console.log('X:', process.env.MI_VAR)",
      env: { MI_VAR: "hola" },
    })
    expect(r.stdout).toContain("X: hola")
  })

  test("stderr se captura por separado", async () => {
    const r = await correrCodigo({
      lenguaje: "node",
      codigo: "console.error('err msg'); console.log('out msg')",
    })
    expect(r.stdout).toContain("out msg")
    expect(r.stderr).toContain("err msg")
  })

  test("no shell → sin escaping issues aunque args tenga ; y &&", async () => {
    // Aunque el 'cmd' venga con caracteres raros, shell:false NO los interpreta.
    const r = await correrSandbox({
      cmd: "node",
      args: ["-e", "console.log('hola; && ls')"],
    })
    expect(r.ok).toBe(true)
    expect(r.stdout).toContain("hola; && ls")
  })

  test("maxOutputBytes trunca stdout", async () => {
    const r = await correrCodigo({
      lenguaje: "node",
      codigo: "process.stdout.write('x'.repeat(2000))",
    })
    // Con default 512KB no debería truncar acá — probamos truncado explícito:
    const r2 = await correrSandbox({
      cmd: "node",
      args: ["-e", "process.stdout.write('x'.repeat(2000))"],
      maxOutputBytes: 100,
    })
    expect(r2.stdout.length).toBeLessThanOrEqual(100)
    expect(r2.stdoutTruncado).toBe(true)
    expect(r.ok).toBe(true) // sanidad
  })

  test("cmd inexistente → ok=false con stderr descriptivo", async () => {
    const r = await correrSandbox({ cmd: "esto-seguro-no-existe-12345" })
    expect(r.ok).toBe(false)
    expect(r.stderr.length).toBeGreaterThan(0)
  })

  test("stdin pipe", async () => {
    const r = await correrSandbox({
      cmd: "node",
      args: ["-e", "let d=''; process.stdin.on('data', c => d+=c); process.stdin.on('end', () => console.log('got:', d))"],
      stdin: "hola stdin",
    })
    expect(r.ok).toBe(true)
    expect(r.stdout).toContain("got: hola stdin")
  })
})
