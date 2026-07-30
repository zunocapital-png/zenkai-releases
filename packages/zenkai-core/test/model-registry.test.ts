import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ModelRegistry, inferirCapabilities } from "../src/runtime/model-registry"

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "zenkai-mreg-"))
}

function crearGguf(dir: string, name: string, size = 100): string {
  const p = join(dir, `${name}.gguf`)
  writeFileSync(p, new Uint8Array(size))
  return p
}

describe("ModelRegistry · Zenkai Engine (reemplazo Ollama)", () => {
  test("register + list + get", () => {
    const d = tmpDir()
    try {
      const path = crearGguf(d, "q1")
      const r = new ModelRegistry({ modelsDir: d })
      r.register({
        id: "qwen-7b",
        path,
        nombre: "Qwen 7B",
        capabilities: ["tools", "completion"],
      })
      expect(r.list().length).toBe(1)
      const m = r.get("qwen-7b")
      expect(m?.nombre).toBe("Qwen 7B")
      expect(m?.bytes).toBe(100)
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("register mismo id reemplaza (idempotente)", () => {
    const d = tmpDir()
    try {
      const p1 = crearGguf(d, "q1", 50)
      const p2 = crearGguf(d, "q2", 200)
      const r = new ModelRegistry({ modelsDir: d })
      r.register({ id: "q", path: p1, nombre: "v1" })
      r.register({ id: "q", path: p2, nombre: "v2" })
      expect(r.list().length).toBe(1)
      expect(r.get("q")?.nombre).toBe("v2")
      expect(r.get("q")?.bytes).toBe(200)
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("remove opcional borra archivo del disco", () => {
    const d = tmpDir()
    try {
      const path = crearGguf(d, "q")
      const r = new ModelRegistry({ modelsDir: d })
      r.register({ id: "q", path, nombre: "n" })
      expect(existsSync(path)).toBe(true)
      r.remove("q", { borrarArchivo: true })
      expect(existsSync(path)).toBe(false)
      expect(r.get("q")).toBeUndefined()
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("register falla si el path no existe", () => {
    const d = tmpDir()
    try {
      const r = new ModelRegistry({ modelsDir: d })
      expect(() => r.register({ id: "q", path: join(d, "noexiste.gguf"), nombre: "n" })).toThrow(/no existe/)
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("search por prefijo", () => {
    const d = tmpDir()
    try {
      const r = new ModelRegistry({ modelsDir: d })
      r.register({ id: "qwen-7b", path: crearGguf(d, "a"), nombre: "n" })
      r.register({ id: "qwen-14b", path: crearGguf(d, "b"), nombre: "n" })
      r.register({ id: "llama-8b", path: crearGguf(d, "c"), nombre: "n" })
      expect(r.search("qwen").length).toBe(2)
      expect(r.search("llama").length).toBe(1)
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("byCapability filtra por capacidad declarada", () => {
    const d = tmpDir()
    try {
      const r = new ModelRegistry({ modelsDir: d })
      r.register({ id: "a", path: crearGguf(d, "a"), nombre: "n", capabilities: ["tools", "completion"] })
      r.register({ id: "b", path: crearGguf(d, "b"), nombre: "n", capabilities: ["embed"] })
      r.register({ id: "c", path: crearGguf(d, "c"), nombre: "n", capabilities: ["vision", "completion"] })
      expect(r.byCapability("tools").map((m) => m.id)).toEqual(["a"])
      expect(r.byCapability("embed").map((m) => m.id)).toEqual(["b"])
      expect(r.byCapability("vision").map((m) => m.id)).toEqual(["c"])
      expect(r.byCapability("completion").map((m) => m.id).sort()).toEqual(["a", "c"])
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("gc detecta y limpia huérfanos", async () => {
    const d = tmpDir()
    try {
      const p1 = crearGguf(d, "existe")
      const p2 = join(d, "borrado.gguf")
      writeFileSync(p2, new Uint8Array(10))
      const r = new ModelRegistry({ modelsDir: d })
      r.register({ id: "a", path: p1, nombre: "n" })
      r.register({ id: "b", path: p2, nombre: "n" })
      // Borramos b del disco por fuera.
      rmSync(p2)
      const res = await r.gc()
      expect(res.huerfanos).toBe(1)
      expect(r.list().length).toBe(1)
      expect(r.get("b")).toBeUndefined()
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("persistencia entre instancias", () => {
    const d = tmpDir()
    try {
      const r1 = new ModelRegistry({ modelsDir: d })
      r1.register({ id: "a", path: crearGguf(d, "a"), nombre: "n" })
      const r2 = new ModelRegistry({ modelsDir: d })
      expect(r2.get("a")).toBeDefined()
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("defaultPath dentro de modelsDir", () => {
    const d = tmpDir()
    try {
      const r = new ModelRegistry({ modelsDir: d })
      const p = r.defaultPath("qwen-7b")
      expect(p.endsWith("qwen-7b.gguf")).toBe(true)
      expect(p.startsWith(d)).toBe(true)
    } finally { rmSync(d, { recursive: true, force: true }) }
  })

  test("inferirCapabilities heurística funciona", () => {
    expect(inferirCapabilities("nomic-embed-text-v1.5")).toEqual(["embed"])
    expect(inferirCapabilities("qwen2.5-coder-7b-instruct")).toContain("tools")
    expect(inferirCapabilities("qwen2.5-coder-7b-instruct")).toContain("completion")
    expect(inferirCapabilities("qwen2.5-vl-7b")).toContain("vision")
    expect(inferirCapabilities("random-model-name")).toEqual(["completion"])
  })
})
