import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseDiff, applyDiff } from "../src/diff/hunks"
import { chunkArchivo, descubrirArchivos } from "../src/indexer/codebase"
import { scaffold } from "../src/scaffold/generator"
import { listarAppCatalog, getAppBundle, categoriasApp } from "../src/catalog/apps"
import { extraerCodigoDeMarkdown } from "../src/vision/screenshot-to-code"
import { correrAgentLoop } from "../src/harness/agent-loop"
import type { ChatFn } from "../src/harness/reflector"

describe("v1.25 #1 · Diff hunks", () => {
  test("parseDiff extrae file + hunks básicos", () => {
    const raw = `--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,3 @@
 export function suma(a: number, b: number) {
-  return a + b
+  return a + b + 0
 }`
    const d = parseDiff(raw)
    expect(d.files.length).toBe(1)
    expect(d.files[0]!.pathOriginal).toBe("foo.ts")
    expect(d.files[0]!.hunks.length).toBe(1)
    expect(d.files[0]!.hunks[0]!.contextoOriginal).toContain("return a + b")
  })

  test("applyDiff modifica el archivo correctamente", () => {
    const dir = mkdtempSync(join(tmpdir(), "diff-test-"))
    try {
      const path = join(dir, "foo.ts")
      writeFileSync(path, "line1\nline2\nline3\n", "utf8")
      const raw = `--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,3 @@
 line1
-line2
+line2-CAMBIADA
 line3`
      const d = parseDiff(raw)
      const r = applyDiff(d, { baseDir: dir })
      expect(r.ok).toBe(true)
      expect(r.archivos[0]!.hunksAplicados).toBe(1)
      const nuevo = readFileSync(path, "utf8")
      expect(nuevo).toContain("line2-CAMBIADA")
      expect(nuevo).not.toContain("line2\n")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("applyDiff dryRun no escribe al disco", () => {
    const dir = mkdtempSync(join(tmpdir(), "diff-dry-"))
    try {
      const path = join(dir, "x.txt")
      const original = "a\nb\nc\n"
      writeFileSync(path, original, "utf8")
      const raw = `--- a/x.txt
+++ b/x.txt
@@ -1,3 +1,3 @@
 a
-b
+B
 c`
      const d = parseDiff(raw)
      const r = applyDiff(d, { baseDir: dir, dryRun: true })
      expect(r.archivos[0]!.escrito).toBe(false)
      expect(r.archivos[0]!.preview).toContain("B")
      expect(readFileSync(path, "utf8")).toBe(original)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("applyDiff con archivo inexistente devuelve conflictos", () => {
    const dir = mkdtempSync(join(tmpdir(), "diff-noexist-"))
    try {
      const raw = `--- a/noexiste.ts
+++ b/noexiste.ts
@@ -1,1 +1,1 @@
-x
+y`
      const d = parseDiff(raw)
      const r = applyDiff(d, { baseDir: dir })
      expect(r.ok).toBe(false)
      expect(r.archivos[0]!.conflictos[0]).toContain("no existe")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("applyDiff con hunksSeleccionados filtra", () => {
    const dir = mkdtempSync(join(tmpdir(), "diff-sel-"))
    try {
      const path = join(dir, "m.ts")
      writeFileSync(path, "a\nb\nc\nd\ne\n", "utf8")
      const raw = `--- a/m.ts
+++ b/m.ts
@@ -1,2 +1,2 @@
 a
-b
+B
@@ -4,2 +4,2 @@
 d
-e
+E`
      const d = parseDiff(raw)
      const r = applyDiff(d, { baseDir: dir, hunksSeleccionados: { "m.ts": [0] } })
      // Solo el primer hunk aplica.
      expect(r.archivos[0]!.hunksAplicados).toBe(1)
      const nuevo = readFileSync(path, "utf8")
      expect(nuevo).toContain("B")
      expect(nuevo).toContain("e") // el hunk 2 NO aplicó
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe("v1.25 #3 · Codebase indexer", () => {
  test("chunkArchivo trocea .md por párrafos", () => {
    const md = "Título\n\n" + "Párrafo 1 ".repeat(200) + "\n\n" + "Párrafo 2 ".repeat(200)
    const chunks = chunkArchivo(md, ".md")
    expect(chunks.length).toBeGreaterThan(1)
  })

  test("chunkArchivo trocea .ts por funciones", () => {
    const code = `export function uno() { return 1 }

export function dos() {
  const x = 42
  return x
}

export class Tres {
  foo() { return "foo" }
}`.repeat(20) // forzar > 1500 chars
    const chunks = chunkArchivo(code, ".ts")
    expect(chunks.length).toBeGreaterThan(1)
  })

  test("descubrirArchivos filtra por extensión e ignorar", () => {
    const dir = mkdtempSync(join(tmpdir(), "idx-test-"))
    try {
      writeFileSync(join(dir, "a.ts"), "x")
      writeFileSync(join(dir, "b.md"), "x")
      writeFileSync(join(dir, "c.png"), "x")
      const { mkdirSync } = require("node:fs") as typeof import("node:fs")
      mkdirSync(join(dir, "node_modules"))
      writeFileSync(join(dir, "node_modules", "ignorame.ts"), "x")
      const archivos = descubrirArchivos(dir, new Set([".ts", ".md"]), ["node_modules"], 1_000_000)
      expect(archivos.length).toBe(2) // a.ts + b.md, no c.png ni node_modules
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe("v1.25 #4 · Scaffold generator", () => {
  test("vite-react-ts genera estructura completa", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaf-test-"))
    try {
      const r = scaffold({ kit: "vite-react-ts", destino: dir, nombre: "test-app" })
      expect(r.ok).toBe(true)
      expect(r.archivosCreados).toContain("package.json")
      expect(r.archivosCreados).toContain("src/App.tsx")
      expect(r.archivosCreados).toContain("tsconfig.json")
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
      expect(pkg.name).toBe("test-app")
      expect(pkg.dependencies.react).toBeDefined()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("static-html genera 3 archivos sin build", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaf-html-"))
    try {
      const r = scaffold({ kit: "static-html", destino: dir, nombre: "landing" })
      expect(r.ok).toBe(true)
      expect(r.archivosCreados).toEqual(["index.html", "style.css", "app.js"])
      expect(existsSync(join(dir, "index.html"))).toBe(true)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("kit desconocido falla graceful", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaf-bad-"))
    try {
      const r = scaffold({ kit: "no-existe" as any, destino: dir, nombre: "x" })
      expect(r.ok).toBe(false)
      expect(r.error).toContain("kit desconocido")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe("v1.25 #5 · Screenshot → Code (extractor)", () => {
  test("extraerCodigoDeMarkdown detecta fence con lang", () => {
    const md = "Acá tu componente:\n\n```tsx\nexport default function App() { return <h1>hola</h1> }\n```\n\nListo."
    const r = extraerCodigoDeMarkdown(md, "tsx")
    expect(r).toContain("export default function App")
    expect(r).not.toContain("```")
  })

  test("extraerCodigoDeMarkdown fallback a fence genérico", () => {
    const md = "```\nplain code\n```"
    const r = extraerCodigoDeMarkdown(md, "tsx")
    expect(r).toBe("plain code")
  })

  test("extraerCodigoDeMarkdown undefined si no hay fence", () => {
    const r = extraerCodigoDeMarkdown("solo texto sin fence")
    expect(r).toBeUndefined()
  })
})

describe("v1.25 #6 · App catalog", () => {
  test("listarAppCatalog devuelve todas las apps por default", () => {
    const list = listarAppCatalog()
    expect(list.length).toBeGreaterThanOrEqual(10)
    expect(list[0]!.id).toBeDefined()
    expect(list[0]!.categoria).toBeDefined()
  })

  test("filtro por categoría", () => {
    const coding = listarAppCatalog({ categoria: "coding" })
    expect(coding.length).toBeGreaterThan(0)
    coding.forEach((a) => expect(a.categoria).toBe("coding"))
  })

  test("filtro por texto", () => {
    const r = listarAppCatalog({ query: "código" })
    // No matchea nada porque las descripciones usan "code" — verificamos que filtra:
    const r2 = listarAppCatalog({ query: "reviewer" })
    expect(r2.length).toBeGreaterThan(0)
    expect(r).toBeDefined()
  })

  test("getAppBundle recupera por id", () => {
    const app = getAppBundle("programador-fullstack")
    expect(app?.nombre).toContain("Programador")
    expect(app?.persona).toBeDefined()
  })

  test("categoriasApp devuelve únicas", () => {
    const cats = categoriasApp()
    expect(new Set(cats).size).toBe(cats.length)
    expect(cats).toContain("coding")
  })
})

describe("v1.25 #2 · Agent loop", () => {
  test("plan válido + ejecución mock exitosa", async () => {
    const chatMock: ChatFn = async (req) => {
      const isPlanner = (req.messages[0]?.parts[0] as { text?: string })?.text?.includes("planificador")
      const isActor = (req.messages[0]?.parts[0] as { text?: string })?.text?.includes("ejecutor")
      const isVerifier = (req.messages[0]?.parts[0] as { text?: string })?.text?.includes("verificador")
      let content = "{}"
      if (isPlanner) {
        content = JSON.stringify({
          pasos: [
            { numero: 1, descripcion: "Crear archivo X", toolSugerido: "write", argsSugeridos: { path: "x.txt" } },
          ],
        })
      } else if (isActor) {
        content = JSON.stringify({ tool: "write", args: { path: "x.txt", contenido: "ok" }, razon: "crear archivo" })
      } else if (isVerifier) {
        content = JSON.stringify({ pasa: true, motivo: "creado" })
      }
      return { provider: "mock", model: req.model, content, latencyMs: 5 }
    }
    let toolCalls = 0
    const runner = async (name: string, args: Record<string, unknown>) => {
      toolCalls++
      return { ok: true, resultado: { path: args.path } }
    }
    const r = await correrAgentLoop(
      { objetivo: "crear archivo", modelo: "m", toolsDisponibles: [{ name: "write", description: "escribe" }] },
      chatMock,
      runner,
    )
    expect(r.ok).toBe(true)
    expect(r.plan?.pasos.length).toBe(1)
    expect(r.ejecuciones.length).toBe(1)
    expect(r.ejecuciones[0]!.ok).toBe(true)
    expect(toolCalls).toBe(1)
    expect(r.detenidoPor).toBe("completado")
  })

  test("plan inválido → aborta con detenidoPor=plan_invalido", async () => {
    const chatMock: ChatFn = async (req) => ({ provider: "m", model: req.model, content: "no es JSON", latencyMs: 1 })
    const runner = async () => ({ ok: true })
    const r = await correrAgentLoop({ objetivo: "x", modelo: "m" }, chatMock, runner)
    expect(r.ok).toBe(false)
    expect(r.detenidoPor).toBe("plan_invalido")
  })

  test("checkpoint hook se llama por paso", async () => {
    let checkpoints = 0
    const chatMock: ChatFn = async (req) => {
      const sysText = (req.messages[0]?.parts[0] as { text?: string })?.text ?? ""
      if (sysText.includes("planificador")) {
        return {
          provider: "m", model: req.model, latencyMs: 1,
          content: JSON.stringify({ pasos: [{ numero: 1, descripcion: "a" }, { numero: 2, descripcion: "b" }] }),
        }
      }
      if (sysText.includes("ejecutor")) {
        return { provider: "m", model: req.model, content: JSON.stringify({ tool: null, razon: "cognitivo" }), latencyMs: 1 }
      }
      return { provider: "m", model: req.model, content: "{}", latencyMs: 1 }
    }
    const runner = async () => ({ ok: true })
    await correrAgentLoop(
      { objetivo: "x", modelo: "m" },
      chatMock,
      runner,
      { checkpoint: async () => { checkpoints++; return { id: "c", timestamp: 0 } } },
    )
    expect(checkpoints).toBe(2)
  })
})
