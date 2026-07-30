import { describe, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { join } from "node:path"

const CLI = join(import.meta.dir, "..", "src", "index.ts")

// Corre el CLI contra un mock server que levantamos en :0.
function correrCli(args: string[], baseUrl: string, timeoutMs = 8000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", ["run", CLI, ...args], {
      env: { ...process.env, ZENKAI_URL: baseUrl, PATH: process.env.PATH ?? "" },
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => { try { proc.kill("SIGKILL") } catch { /* noop */ } }, timeoutMs)
    proc.stdout.on("data", (c: Buffer) => { stdout += c.toString("utf8") })
    proc.stderr.on("data", (c: Buffer) => { stderr += c.toString("utf8") })
    proc.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? -1 }) })
  })
}

describe("Zenkai CLI", () => {
  test("zenkai help imprime uso", async () => {
    const r = await correrCli(["help"], "http://localhost:1")
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("USO:")
    expect(r.stdout).toContain("pull")
    expect(r.stdout).toContain("chat")
    expect(r.stdout).toContain("diagnostico")
  })

  test("sin args → imprime help", async () => {
    const r = await correrCli([], "http://localhost:1")
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Zenkai")
  })

  test("comando desconocido → exit 1 con mensaje", async () => {
    const r = await correrCli(["comando-no-existe"], "http://localhost:1")
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("desconocido")
  })

  test("version imprime versión", async () => {
    const r = await correrCli(["version"], "http://localhost:1")
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("1.28")
  })

  test("router no disponible → mensaje claro", async () => {
    const r = await correrCli(["list"], "http://localhost:59999")
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("router")
  })

  test("list contra mock server con 0 modelos", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === "/v2/engine/models") {
          return Response.json({ catalogo: [], instalados: [] })
        }
        if (url.pathname === "/v2/engine/benchmarks") {
          return Response.json({})
        }
        return new Response("nf", { status: 404 })
      },
    })
    try {
      const r = await correrCli(["list"], `http://localhost:${server.port}`)
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("sin modelos")
    } finally { server.stop() }
  })

  test("list muestra modelos con tok/s", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === "/v2/engine/models") {
          return Response.json({
            catalogo: [],
            instalados: [{ id: "qwen-7b", nombre: "Qwen 7B", bytes: 5_000_000_000, capabilities: ["tools"] }],
          })
        }
        if (url.pathname === "/v2/engine/benchmarks") {
          return Response.json({ "qwen-7b": { tokensPorSegundo: 45 } })
        }
        return new Response("nf", { status: 404 })
      },
    })
    try {
      const r = await correrCli(["list"], `http://localhost:${server.port}`)
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("qwen-7b")
      expect(r.stdout).toContain("45 tok/s")
    } finally { server.stop() }
  })

  test("hw imprime RAM/CPU/GPU", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === "/v2/hw") {
          return Response.json({
            ram: { totalMB: 32000, libreMB: 20000, usadoPct: 37 },
            cpu: { cores: 12, modelo: "Test CPU" },
            gpu: { nombre: "Test GPU", vramTotalMB: 24000, vramUsadoMB: 2000, utilizacionPct: 15, tempC: 45 },
          })
        }
        return new Response("nf", { status: 404 })
      },
    })
    try {
      const r = await correrCli(["hw"], `http://localhost:${server.port}`)
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("31.3 GB total")
      expect(r.stdout).toContain("12 cores")
      expect(r.stdout).toContain("Test GPU")
      expect(r.stdout).toContain("23.4 GB VRAM")
    } finally { server.stop() }
  })

  test("rm devuelve error si modelo no existe", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() { return new Response("not found", { status: 404 }) },
    })
    try {
      const r = await correrCli(["rm", "no-existe"], `http://localhost:${server.port}`)
      expect(r.code).toBe(1)
      expect(r.stderr).toContain("no existe")
    } finally { server.stop() }
  })

  test("rm sin id → error uso", async () => {
    const r = await correrCli(["rm"], "http://localhost:1")
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("uso:")
  })

  test("chat sin prompt → error uso", async () => {
    const r = await correrCli(["chat"], "http://localhost:1")
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("uso:")
  })

  test("diagnostico imprime perfil + recomendaciones", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({
          diagnostico: { perfil: "workstation", memoriaUtilMB: 14000, tieneGpu: true, gpuNombre: "Test GPU" },
          mensaje: "Test workstation - podés correr modelos 14B",
          mejorCoding: { modelo: { id: "qwen2.5-coder-7b-q4", nombre: "Qwen 2.5 Coder 7B" } },
          mejorGeneral: { modelo: { id: "qwen2.5-7b-q4", nombre: "Qwen 2.5 7B" } },
          todos: [
            { modelo: { id: "qwen-7b", potencia: 6 }, puedeCorrer: true, motivo: "corre fluido", velocidadEsperada: "rapido", esOptimo: true },
          ],
        })
      },
    })
    try {
      const r = await correrCli(["diag"], `http://localhost:${server.port}`)
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("workstation")
      expect(r.stdout).toContain("Test workstation")
      expect(r.stdout).toContain("qwen2.5-coder-7b-q4")
    } finally { server.stop() }
  })
})
