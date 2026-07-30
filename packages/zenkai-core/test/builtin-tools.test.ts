import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ToolExecutor, readTool, writeTool, bashTool, grepTool, registrarBuiltins } from "../src/index.ts"

function crearDir(): string {
  return mkdtempSync(join(tmpdir(), "zenkai-tools-test-"))
}

describe("read tool", () => {
  test("lee archivo con contenido", async () => {
    const dir = crearDir()
    try {
      const f = join(dir, "hola.txt")
      writeFileSync(f, "linea 1\nlinea 2\nlinea 3\n", "utf8")
      const ex = new ToolExecutor()
      ex.register(readTool)
      const r = await ex.invoke("read", { path: f })
      expect(r.ok).toBe(true)
      if (r.ok && typeof r.output === "object" && r.output !== null && "content" in r.output) {
        const out = r.output as { content: string; bytes: number; binary: boolean; truncated: boolean }
        expect(out.content).toContain("linea 1")
        expect(out.binary).toBe(false)
        expect(out.truncated).toBe(false)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("trunca si excede maxBytes", async () => {
    const dir = crearDir()
    try {
      const f = join(dir, "big.txt")
      writeFileSync(f, "x".repeat(1000), "utf8")
      const ex = new ToolExecutor()
      ex.register(readTool)
      const r = await ex.invoke("read", { path: f, maxBytes: 200 })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.output as { truncated: boolean; content: string }
        expect(out.truncated).toBe(true)
        expect(out.content).toContain("truncado")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("line numbers", async () => {
    const dir = crearDir()
    try {
      const f = join(dir, "n.txt")
      writeFileSync(f, "a\nb\nc\n", "utf8")
      const ex = new ToolExecutor()
      ex.register(readTool)
      const r = await ex.invoke("read", { path: f, lineNumbers: true })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.output as { content: string }
        expect(out.content).toContain("1: a")
        expect(out.content).toContain("2: b")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("write tool", () => {
  test("escribe atómico con backup", async () => {
    const dir = crearDir()
    try {
      const f = join(dir, "target.txt")
      writeFileSync(f, "original", "utf8")
      const ex = new ToolExecutor()
      ex.register(writeTool)
      const r = await ex.invoke("write", { path: f, content: "nuevo contenido" })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.output as { bytesWritten: number; hadPrevious: boolean; backupPath?: string }
        expect(out.bytesWritten).toBeGreaterThan(0)
        expect(out.hadPrevious).toBe(true)
        expect(out.backupPath).toBeDefined()
        // El archivo tiene el nuevo contenido.
        expect(readFileSync(f, "utf8")).toBe("nuevo contenido")
        // El backup preserva el original.
        if (out.backupPath) expect(readFileSync(out.backupPath, "utf8")).toBe("original")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("dryRun no toca el disco", async () => {
    const dir = crearDir()
    try {
      const f = join(dir, "nope.txt")
      writeFileSync(f, "quedo igual", "utf8")
      const ex = new ToolExecutor()
      ex.register(writeTool)
      const r = await ex.invoke("write", { path: f, content: "cambiado", dryRun: true })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.output as { dryRun: boolean; bytesWritten: number }
        expect(out.dryRun).toBe(true)
        expect(out.bytesWritten).toBe(0)
        expect(readFileSync(f, "utf8")).toBe("quedo igual")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("crea directorios padres si no existen", async () => {
    const dir = crearDir()
    try {
      const f = join(dir, "sub1", "sub2", "nuevo.txt")
      const ex = new ToolExecutor()
      ex.register(writeTool)
      const r = await ex.invoke("write", { path: f, content: "hola" })
      expect(r.ok).toBe(true)
      expect(readFileSync(f, "utf8")).toBe("hola")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("bash tool", () => {
  test("ejecuta echo simple", async () => {
    const ex = new ToolExecutor()
    ex.register(bashTool)
    const cmd = process.platform === "win32" ? "echo hola" : "echo hola"
    const r = await ex.invoke("bash", { cmd })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const out = r.output as { stdout: string; exitCode: number | null }
      expect(out.stdout).toContain("hola")
      expect(out.exitCode).toBe(0)
    }
  })

  test("captura exit code no-cero", async () => {
    const ex = new ToolExecutor()
    ex.register(bashTool)
    const cmd = process.platform === "win32" ? "exit 3" : "exit 3"
    const r = await ex.invoke("bash", { cmd })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const out = r.output as { exitCode: number | null }
      expect(out.exitCode).toBe(3)
    }
  })
})

describe("grep tool", () => {
  test("encuentra pattern con matches", async () => {
    const dir = crearDir()
    try {
      writeFileSync(join(dir, "a.txt"), "hola mundo\nchau mundo\n", "utf8")
      writeFileSync(join(dir, "b.txt"), "otro texto\n", "utf8")
      const ex = new ToolExecutor()
      ex.register(grepTool)
      const r = await ex.invoke("grep", { pattern: "mundo", root: dir })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.output as { totalMatches: number; matches: Array<{ line: number; text: string }> }
        expect(out.totalMatches).toBe(2)
        expect(out.matches[0]!.text).toContain("mundo")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("caseInsensitive matchea", async () => {
    const dir = crearDir()
    try {
      writeFileSync(join(dir, "a.txt"), "HELLO WORLD\n", "utf8")
      const ex = new ToolExecutor()
      ex.register(grepTool)
      const r = await ex.invoke("grep", { pattern: "hello", root: dir, caseInsensitive: true })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.output as { totalMatches: number }
        expect(out.totalMatches).toBe(1)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("context lines antes y después", async () => {
    const dir = crearDir()
    try {
      writeFileSync(join(dir, "a.txt"), "linea 1\nlinea 2\nmatch\nlinea 4\nlinea 5\n", "utf8")
      const ex = new ToolExecutor()
      ex.register(grepTool)
      const r = await ex.invoke("grep", { pattern: "match", root: dir, context: 2 })
      expect(r.ok).toBe(true)
      if (r.ok) {
        const out = r.output as { matches: Array<{ context?: { before: string[]; after: string[] } }> }
        expect(out.matches[0]!.context!.before).toEqual(["linea 1", "linea 2"])
        expect(out.matches[0]!.context!.after).toEqual(["linea 4", "linea 5"])
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("regex inválido devuelve validation error", async () => {
    const ex = new ToolExecutor()
    ex.register(grepTool)
    const r = await ex.invoke("grep", { pattern: "(unclosed", root: "." })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.type).toBe("validation")
  })
})

describe("registrarBuiltins", () => {
  test("registra las 4 tools en un executor", () => {
    const ex = new ToolExecutor()
    registrarBuiltins(ex)
    expect(ex.hasTool("read")).toBe(true)
    expect(ex.hasTool("write")).toBe(true)
    expect(ex.hasTool("bash")).toBe(true)
    expect(ex.hasTool("grep")).toBe(true)
    expect(ex.listMetas().length).toBe(4)
  })
})
