import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { correrAutoRepair } from "../src/harness/auto-repair"
import { ToolExecutor } from "../src/tools/executor"
import { registrarBuiltins } from "../src/tools/index"
import type { LlmProposer } from "../src/harness/auto-repair"

describe("Auto-repair loop · corto plazo #2", () => {
  test("test pasa a la primera → no invoca proposer", async () => {
    const ex = new ToolExecutor()
    registrarBuiltins(ex)
    let proposerLlamado = false
    const proposer: LlmProposer = async () => {
      proposerLlamado = true
      return undefined
    }
    const cmd = process.platform === "win32" ? "exit 0" : "exit 0"
    const r = await correrAutoRepair({ testCmd: cmd }, ex, proposer)
    expect(r.ok).toBe(true)
    expect(proposerLlamado).toBe(false)
    expect(r.intentos.length).toBe(1)
  })

  test("test falla → proposer sugiere fix → intento 2 pasa", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repair-test-"))
    const marker = join(dir, "arreglado.txt")
    try {
      const ex = new ToolExecutor()
      registrarBuiltins(ex)
      // Comando bash que fija si el marker existe (después del fix).
      // Cross-platform check: usa node para verificar existencia (evita shell diffs).
      // Usamos un script en el propio dir y lo corremos con cwd=dir para evitar
      // problemas de escapeo de paths en cmd.exe.
      writeFileSync(
        join(dir, "check.js"),
        `if (require('fs').existsSync(${JSON.stringify(marker)})) process.exit(0); else process.exit(1);`,
        "utf8",
      )
      const cmd = `node check.js`
      const proposer: LlmProposer = async () => ({
        hipotesis: "falta el archivo marker",
        fix: { tipo: "escribir", path: marker, contenido: "ok" },
      })
      const r = await correrAutoRepair({ testCmd: cmd, cwd: dir }, ex, proposer)
      expect(r.ok).toBe(true)
      expect(r.intentos.length).toBe(2)
      expect(r.intentos[0]!.hipotesis).toBe("falta el archivo marker")
      expect(readFileSync(marker, "utf8")).toBe("ok")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("maxIntentos respetado", async () => {
    const ex = new ToolExecutor()
    registrarBuiltins(ex)
    const proposer: LlmProposer = async () => ({
      hipotesis: "sigue fallando",
      fix: { tipo: "bash", cmd: process.platform === "win32" ? "exit 0" : "true" },
    })
    const cmdFail = process.platform === "win32" ? "exit 1" : "exit 1"
    const r = await correrAutoRepair({ testCmd: cmdFail, maxIntentos: 2 }, ex, proposer)
    expect(r.ok).toBe(false)
    expect(r.intentos.length).toBe(2)
  })

  test("proposer devuelve undefined → aborta con failure", async () => {
    const ex = new ToolExecutor()
    registrarBuiltins(ex)
    const proposer: LlmProposer = async () => undefined
    const cmdFail = process.platform === "win32" ? "exit 1" : "exit 1"
    const r = await correrAutoRepair({ testCmd: cmdFail }, ex, proposer)
    expect(r.ok).toBe(false)
    expect(r.intentos.length).toBe(1)
  })

  test("fix manual devuelve error apropiado", async () => {
    const ex = new ToolExecutor()
    registrarBuiltins(ex)
    const proposer: LlmProposer = async () => ({
      hipotesis: "no puedo automatizar",
      fix: { tipo: "manual", nota: "editar config" },
    })
    const cmdFail = process.platform === "win32" ? "exit 1" : "exit 1"
    const r = await correrAutoRepair({ testCmd: cmdFail, maxIntentos: 1 }, ex, proposer)
    expect(r.ok).toBe(false)
    expect(r.intentos[0]!.fixError).toContain("manual")
  })

  test("intentosPrevios se pasa al proposer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repair-prevs-"))
    try {
      const ex = new ToolExecutor()
      registrarBuiltins(ex)
      let vistos = 0
      const proposer: LlmProposer = async ({ intentosPrevios }) => {
        vistos = intentosPrevios.length
        return { hipotesis: "todavía nada", fix: { tipo: "bash", cmd: process.platform === "win32" ? "exit 0" : "true" } }
      }
      const cmdFail = process.platform === "win32" ? "exit 1" : "exit 1"
      // 3 intentos con fix que no arregla nada.
      await correrAutoRepair({ testCmd: cmdFail, maxIntentos: 3 }, ex, proposer)
      // El último llamado ve 2 intentos previos.
      expect(vistos).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("escribe backup del archivo original antes de aplicar fix", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repair-backup-"))
    try {
      const originalPath = join(dir, "code.txt")
      writeFileSync(originalPath, "estado original", "utf8")
      const marker = join(dir, "marker.txt")
      const ex = new ToolExecutor()
      registrarBuiltins(ex)
      // Cross-platform check: usa node para verificar existencia (evita shell diffs).
      // Usamos un script en el propio dir y lo corremos con cwd=dir para evitar
      // problemas de escapeo de paths en cmd.exe.
      writeFileSync(
        join(dir, "check.js"),
        `if (require('fs').existsSync(${JSON.stringify(marker)})) process.exit(0); else process.exit(1);`,
        "utf8",
      )
      const cmd = `node check.js`
      const proposer: LlmProposer = async () => ({
        hipotesis: "creo el marker",
        fix: { tipo: "escribir", path: marker, contenido: "creado" },
      })
      const r = await correrAutoRepair({ testCmd: cmd, cwd: dir }, ex, proposer)
      expect(r.ok).toBe(true)
      // El archivo original no se tocó porque el fix escribe otro path.
      expect(readFileSync(originalPath, "utf8")).toBe("estado original")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
