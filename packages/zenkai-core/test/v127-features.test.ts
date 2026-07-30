import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TUTORIALES, getTutorial, progresoTutorial, proximoPaso, filtrarTutoriales } from "../src/docs/tutoriales"
import { PRESETS, aplicarPreset, sugerirPresetDePrompt } from "../src/runtime/presets"
import { inlineEdit, extraerCodigoLimpio, generarDiffSimple, contarCambios } from "../src/harness/inline-edit"
import { correrSmoke, crearSuiteZenkai } from "../src/smoke/suite"
import { correrVariaciones, medirConsistencia, distanciaOutputs, resumirComparacion } from "../src/smoke/variaciones"
import { exportarBundle, importarBundle, esBundleZenkai } from "../src/sync/exportador"
import { MCP_CATALOG, buscarMcp, mcpsPorCategoria, contarMcps } from "../src/plugins/mcp-catalog"
import { wrapEnSandbox } from "../src/vision/preview-sandbox"
import type { ChatFn } from "../src/harness/reflector"

describe("v1.27 #1 · Tutoriales", () => {
  test("catálogo trae tutoriales válidos", () => {
    expect(TUTORIALES.length).toBeGreaterThanOrEqual(4)
    for (const t of TUTORIALES) {
      expect(t.id).toBeTruthy()
      expect(t.pasos.length).toBeGreaterThan(0)
    }
  })
  test("getTutorial encuentra por id", () => {
    expect(getTutorial("primer-modelo")).toBeDefined()
    expect(getTutorial("no-existe")).toBeUndefined()
  })
  test("filtrarTutoriales por nivel", () => {
    const pri = filtrarTutoriales({ nivel: "principiante" })
    pri.forEach((t) => expect(t.nivel).toBe("principiante"))
  })
  test("progresoTutorial calcula bien", () => {
    const t = getTutorial("primer-modelo")!
    const ctx = { modelosInstalados: ["x"], modelosCargados: [], sesionesTotales: 0, pluginsInstalados: [] }
    const p = progresoTutorial(t, ctx)
    expect(p.completados).toBeGreaterThanOrEqual(1)
    expect(p.pct).toBeGreaterThan(0)
  })
  test("proximoPaso devuelve el primero no completado", () => {
    const t = getTutorial("primer-modelo")!
    const ctx = { modelosInstalados: [], modelosCargados: [], sesionesTotales: 0, pluginsInstalados: [] }
    const p = proximoPaso(t, ctx)
    expect(p).toBeDefined()
  })
})

describe("v1.27 #2 · Presets", () => {
  test("PRESETS tiene 8 modos", () => {
    expect(Object.keys(PRESETS).length).toBe(8)
  })
  test("aplicarPreset override params", () => {
    const entry = { paramsDefault: { temperature: 0.9 } }
    const nuevo = aplicarPreset(entry, "coding")
    expect(nuevo.paramsDefault?.temperature).toBe(0.2)
    expect(entry.paramsDefault.temperature).toBe(0.9) // no muta original
  })
  test("sugerirPresetDePrompt detecta coding", () => {
    expect(sugerirPresetDePrompt("refactor esta función a TypeScript")).toBe("coding")
    expect(sugerirPresetDePrompt("explicá por qué el algoritmo O(n log n) es mejor")).toBe("reasoning")
    expect(sugerirPresetDePrompt("traducí esto al inglés")).toBe("translation")
    expect(sugerirPresetDePrompt("hola")).toBe("fast")
  })
})

describe("v1.27 #3 · Inline edit", () => {
  const chatMock: ChatFn = async () => ({
    provider: "mock", model: "m", latencyMs: 5,
    content: "```typescript\nfunction suma(a: number, b: number): number {\n  if (a == null || b == null) throw new Error('null')\n  return a + b\n}\n```",
  })

  test("inlineEdit devuelve solo el fragmento nuevo", async () => {
    const r = await inlineEdit(
      { seleccion: "function suma(a, b) { return a + b }", instruccion: "añadí null check", lenguaje: "typescript", modelo: "m" },
      chatMock,
    )
    expect(r.ok).toBe(true)
    expect(r.seleccionNueva).toContain("null")
    expect(r.cambios).toBeGreaterThan(0)
    expect(r.diff).toContain("+")
  })
  test("extraerCodigoLimpio parsea fence", () => {
    const r = extraerCodigoLimpio("```ts\nconst x = 1\n```", "ts")
    expect(r).toBe("const x = 1")
  })
  test("generarDiffSimple marca +/-", () => {
    const d = generarDiffSimple("a\nb", "a\nc")
    expect(d).toContain("-b")
    expect(d).toContain("+c")
  })
  test("contarCambios cuenta agregados+removidos", () => {
    expect(contarCambios("a\nb", "a\nc")).toBe(2)
    expect(contarCambios("a\nb", "a\nb")).toBe(0)
  })
})

describe("v1.27 #4 · Smoke suite", () => {
  test("crearSuiteZenkai devuelve 12 checks", () => {
    const checks = crearSuiteZenkai()
    expect(checks.length).toBeGreaterThanOrEqual(10)
    for (const c of checks) {
      expect(c.id).toBeTruthy()
      expect(typeof c.ejecutar).toBe("function")
    }
  })
  test("correrSmoke ejecuta y reporta resultados", async () => {
    let calls = 0
    const check1 = { id: "ok", descripcion: "always ok", ejecutar: async () => { calls++; return { ok: true } } }
    const check2 = { id: "fail", descripcion: "always fail", ejecutar: async () => { calls++; return { ok: false, detalle: "boom" } } }
    const r = await correrSmoke([check1, check2])
    expect(r.totalOk).toBe(1)
    expect(r.totalFail).toBe(1)
    expect(calls).toBe(2)
    expect(r.resultados.find((x) => x.check.id === "fail")?.detalle).toBe("boom")
  })
  test("smoke con throw se contabiliza como fail", async () => {
    const check = { id: "boom", descripcion: "throws", ejecutar: async () => { throw new Error("crash") } }
    const r = await correrSmoke([check])
    expect(r.totalFail).toBe(1)
    expect(r.resultados[0]!.detalle).toBe("crash")
  })
})

describe("v1.27 #5 · Variaciones", () => {
  const chatSecuencial: ChatFn = async (req) => ({
    provider: "m", model: req.model, latencyMs: 1,
    content: `t=${req.temperature ?? 0.7}`,
  })

  test("correrVariaciones ejecuta N variaciones", async () => {
    const vs = [
      { id: "v1", prompt: "x", temperature: 0.2 },
      { id: "v2", prompt: "x", temperature: 0.9 },
    ]
    const r = await correrVariaciones(vs, { modeloDefault: "m", chat: chatSecuencial })
    expect(r.length).toBe(2)
    expect(r[0]![0]!.contenido).toContain("0.2")
    expect(r[1]![0]!.contenido).toContain("0.9")
  })
  test("medirConsistencia detecta identicos", () => {
    const ejecs = [
      { variacion: { id: "v", prompt: "x" }, contenido: "hola", ok: true, latencyMs: 1 },
      { variacion: { id: "v", prompt: "x" }, contenido: "hola", ok: true, latencyMs: 1 },
      { variacion: { id: "v", prompt: "x" }, contenido: "chau", ok: true, latencyMs: 1 },
    ]
    const c = medirConsistencia(ejecs)
    expect(c.identicos).toBe(2)
    expect(c.total).toBe(3)
    expect(c.pct).toBeCloseTo(67, 0)
  })
  test("distanciaOutputs", () => {
    expect(distanciaOutputs("a\nb\nc", "a\nb\nc")).toBe(0)
    expect(distanciaOutputs("a\nb", "a\nc")).toBe(2)
  })
  test("resumirComparacion produce tabla", async () => {
    const vs = [{ id: "v1", prompt: "x" }]
    const r = await correrVariaciones(vs, { modeloDefault: "m", chat: chatSecuencial, ejecucionesPorVariacion: 3 })
    const resumen = resumirComparacion(r)
    expect(resumen[0]!.variacion).toBe("v1")
    expect(resumen[0]!.consistencia).toBe(100) // los 3 devuelven t=0.7
  })
})

describe("v1.27 #6 · Sync export/import", () => {
  test("export plano + import roundtrip", () => {
    const bundle = { sesiones: [{ id: "s1", createdAt: 100, updatedAt: 200 }] }
    const exp = exportarBundle({ bundle })
    expect(exp.encrypted).toBe(false)
    const imp = importarBundle(exp.data)
    expect(imp.sesiones?.[0]?.id).toBe("s1")
    expect(imp.version).toBe(1)
  })
  test("export encrypted + import con passphrase correcta", () => {
    const bundle = { sesiones: [{ id: "s1", createdAt: 100, updatedAt: 200 }] }
    const exp = exportarBundle({ bundle, passphrase: "test-pass-123" })
    expect(exp.encrypted).toBe(true)
    const imp = importarBundle(exp.data, "test-pass-123")
    expect(imp.sesiones?.[0]?.id).toBe("s1")
  })
  test("import encrypted con passphrase incorrecta falla", () => {
    const exp = exportarBundle({ bundle: { sesiones: [] }, passphrase: "correcta" })
    expect(() => importarBundle(exp.data, "incorrecta")).toThrow(/passphrase incorrecta/)
  })
  test("import encrypted sin passphrase falla", () => {
    const exp = exportarBundle({ bundle: { sesiones: [] }, passphrase: "x" })
    expect(() => importarBundle(exp.data)).toThrow(/encriptado/)
  })
  test("esBundleZenkai detecta shape", () => {
    const exp = exportarBundle({ bundle: {} })
    const check = esBundleZenkai(exp.data)
    expect(check.ok).toBe(true)
    expect(check.encrypted).toBe(false)
    expect(esBundleZenkai("no es json").ok).toBe(false)
    expect(esBundleZenkai(JSON.stringify({ nada: 1 })).ok).toBe(false)
  })
})

describe("v1.27 #7 · Preview sandbox", () => {
  test("html-css envuelve como body", () => {
    const r = wrapEnSandbox("<h1>hola</h1>", "html-css")
    expect(r.html).toContain("<h1>hola</h1>")
    expect(r.html).toContain("<!doctype html>")
  })
  test("html-css passthrough si ya viene html completo", () => {
    const r = wrapEnSandbox("<!doctype html><body>hi</body>", "html-css")
    expect(r.html).toBe("<!doctype html><body>hi</body>")
  })
  test("react-tailwind incluye CDN scripts", () => {
    const r = wrapEnSandbox("function App() { return React.createElement('div',{}, 'x') }", "react-tailwind")
    expect(r.html).toContain("esm.sh/react")
    expect(r.html).toContain("tailwindcss")
  })
  test("solidjs incluye render", () => {
    const r = wrapEnSandbox("function App() { return null }", "solidjs")
    expect(r.html).toContain("solid-js")
    expect(r.html).toContain("render")
  })
})

describe("v1.27 #8 · MCP catálogo expandido", () => {
  test("catálogo tiene 40+ MCPs", () => {
    expect(contarMcps()).toBeGreaterThanOrEqual(40)
  })
  test("buscarMcp por texto", () => {
    const r = buscarMcp("github")
    expect(r.some((m) => m.id.toLowerCase().includes("github"))).toBe(true)
  })
  test("mcpsPorCategoria filtra", () => {
    const dev = mcpsPorCategoria("dev-tools")
    expect(dev.length).toBeGreaterThan(3)
    dev.forEach((m) => expect(m.categoria).toBe("dev-tools"))
  })
  test("built-in MCPs marcados con yaViene", () => {
    const builtins = MCP_CATALOG.filter((m) => m.yaViene)
    expect(builtins.length).toBeGreaterThanOrEqual(6)
    expect(builtins.some((m) => m.id.includes("brave-search"))).toBe(true)
  })
})
