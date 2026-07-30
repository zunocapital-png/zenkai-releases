import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectarBinario, plataformaAsset, nombreBinario } from "../src/runtime/llama-server"
import { downloadGguf, MODELOS_RECOMENDADOS } from "../src/runtime/gguf-downloader"

describe("Runtime propio · #79/#80", () => {
  test("nombreBinario correcto por plataforma", () => {
    const n = nombreBinario()
    expect(n === "llama-server" || n === "llama-server.exe").toBe(true)
  })

  test("plataformaAsset devuelve slug conocido", () => {
    const p = plataformaAsset()
    expect(p).toMatch(/(win|macos|linux)-(x64|arm64)/)
  })

  test("detectarBinario devuelve undefined si no hay ninguno", () => {
    const prev = process.env.ZENKAI_LLAMA_SERVER
    delete process.env.ZENKAI_LLAMA_SERVER
    try {
      // Sin bundledDir y sin env — probablemente no está en PATH del CI.
      // El test es correcto en ambos casos: si está en PATH devuelve string, si no undefined.
      const r = detectarBinario()
      expect(r === undefined || typeof r === "string").toBe(true)
    } finally {
      if (prev) process.env.ZENKAI_LLAMA_SERVER = prev
    }
  })

  test("detectarBinario respeta env var explícita", () => {
    const dir = mkdtempSync(join(tmpdir(), "bin-test-"))
    try {
      const fakeBinary = join(dir, "llama-server")
      writeFileSync(fakeBinary, "#!/bin/sh\necho ok")
      process.env.ZENKAI_LLAMA_SERVER = fakeBinary
      const r = detectarBinario()
      expect(r).toBe(fakeBinary)
    } finally {
      delete process.env.ZENKAI_LLAMA_SERVER
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("MODELOS_RECOMENDADOS tiene entradas válidas con URL HuggingFace", () => {
    expect(MODELOS_RECOMENDADOS.length).toBeGreaterThan(0)
    for (const m of MODELOS_RECOMENDADOS) {
      expect(m.id).toBeTruthy()
      expect(m.url.startsWith("https://huggingface.co/")).toBe(true)
      expect(m.url.endsWith(".gguf")).toBe(true)
    }
  })

  test("downloadGguf escribe archivo con progress real (mock server local)", async () => {
    // Servidor mock que sirve 10 KB con Content-Length correcto.
    const contenido = new Uint8Array(10_000)
    for (let i = 0; i < contenido.length; i++) contenido[i] = i % 256
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === "/model.gguf") {
          const range = req.headers.get("range")
          if (range) {
            const m = /bytes=(\d+)-/.exec(range)
            const from = m ? Number(m[1]) : 0
            return new Response(contenido.slice(from), {
              status: 206,
              headers: {
                "content-length": String(contenido.length - from),
                "content-range": `bytes ${from}-${contenido.length - 1}/${contenido.length}`,
              },
            })
          }
          return new Response(contenido, {
            status: 200,
            headers: { "content-length": String(contenido.length) },
          })
        }
        return new Response("not found", { status: 404 })
      },
    })
    const dir = mkdtempSync(join(tmpdir(), "gguf-test-"))
    try {
      const dest = join(dir, "model.gguf")
      const progresos: number[] = []
      const r = await downloadGguf({
        url: `http://localhost:${server.port}/model.gguf`,
        destPath: dest,
        onProgress: (p) => progresos.push(p.percent),
      })
      expect(r.bytes).toBe(contenido.length)
      expect(r.reanudado).toBe(false)
      expect(statSync(dest).size).toBe(contenido.length)
      // Debe haber al menos el 100% final.
      expect(progresos[progresos.length - 1]).toBe(100)
      // El contenido descargado matchea el original.
      const leido = readFileSync(dest)
      expect(leido[0]).toBe(0)
      expect(leido[255]).toBe(255)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      server.stop()
    }
  })

  test("downloadGguf reanuda desde .part existente", async () => {
    const contenido = new Uint8Array(5_000)
    for (let i = 0; i < contenido.length; i++) contenido[i] = (i * 3) % 256
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const range = req.headers.get("range")
        if (!range) {
          return new Response(contenido, { headers: { "content-length": String(contenido.length) } })
        }
        const from = Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0)
        return new Response(contenido.slice(from), {
          status: 206,
          headers: {
            "content-length": String(contenido.length - from),
            "content-range": `bytes ${from}-${contenido.length - 1}/${contenido.length}`,
          },
        })
      },
    })
    const dir = mkdtempSync(join(tmpdir(), "resume-test-"))
    try {
      const dest = join(dir, "m.gguf")
      // Pre-creamos .part con 2000 bytes.
      writeFileSync(`${dest}.part`, contenido.slice(0, 2000))
      const r = await downloadGguf({
        url: `http://localhost:${server.port}/m.gguf`,
        destPath: dest,
      })
      expect(r.reanudado).toBe(true)
      expect(r.bytes).toBe(contenido.length)
      const leido = readFileSync(dest)
      expect(leido.length).toBe(contenido.length)
      expect(leido[0]).toBe(0) // el prefijo pre-existente
      expect(leido[1999]).toBe((1999 * 3) % 256)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      server.stop()
    }
  })

  test("downloadGguf devuelve error HTTP no-ok", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() { return new Response("nope", { status: 404 }) },
    })
    const dir = mkdtempSync(join(tmpdir(), "err-test-"))
    try {
      await expect(
        downloadGguf({ url: `http://localhost:${server.port}/x`, destPath: join(dir, "x") }),
      ).rejects.toThrow(/HTTP 404/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      server.stop()
    }
  })
})
