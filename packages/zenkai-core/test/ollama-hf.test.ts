import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { normalizarIdOllama, prettyOllamaName, ollamaEstaInstalado } from "../src/runtime/ollama-import"
import { extraerQuant, buscarModelosHf, listarGgufsDeModelo, limpiarCacheHf } from "../src/runtime/hf-search"

describe("Ollama import · pure fns", () => {
  test("normalizarIdOllama sanitiza el id", () => {
    expect(normalizarIdOllama("qwen2.5", "7b")).toBe("qwen2.5-7b")
    expect(normalizarIdOllama("qwen2.5", "7b-instruct")).toBe("qwen2.5-7b-instruct")
    expect(normalizarIdOllama("llama3.1", "8B")).toBe("llama3.1-8b")
    expect(normalizarIdOllama("model/with:weird", "chars@1")).toBe("model-with-weird-chars-1")
  })

  test("prettyOllamaName legible", () => {
    expect(prettyOllamaName("qwen2.5:7b-instruct")).toContain("Instruct")
    expect(prettyOllamaName("llama3.1:8b")).toContain("Llama3.1")
  })

  test("ollamaEstaInstalado no falla si no está", () => {
    // No aseveramos true/false — depende del sistema. Solo debe devolver boolean.
    const r = ollamaEstaInstalado()
    expect(typeof r).toBe("boolean")
  })
})

describe("HF search · pure fns", () => {
  test("extraerQuant reconoce quantizaciones típicas", () => {
    expect(extraerQuant("Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf")).toBe("Q4_K_M")
    expect(extraerQuant("model-Q5_K_S.gguf")).toBe("Q5_K_S")
    expect(extraerQuant("model.F16.gguf")).toBe("F16")
    expect(extraerQuant("model.IQ2_XS.gguf")).toBe("IQ2_XS")
    expect(extraerQuant("random-name.gguf")).toBe("unknown")
  })

  test("buscarModelosHf usa cache y devuelve shape correcto (mock)", async () => {
    limpiarCacheHf()
    // Mock via monkey-patch temporal — reemplazamos globalThis.fetch.
    const origFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async (url: string) => {
      calls++
      if (url.includes("/models?")) {
        return new Response(
          JSON.stringify([
            { id: "test/model-1", downloads: 1000, likes: 50, lastModified: "2025-01-01", tags: ["gguf"] },
            { id: "test/model-2", downloads: 500, likes: 20, lastModified: "2025-01-02", tags: ["gguf"] },
          ]),
          { status: 200 },
        )
      }
      throw new Error("URL inesperada")
    }) as unknown as typeof fetch
    try {
      const r1 = await buscarModelosHf("qwen", 10)
      expect(r1.length).toBe(2)
      expect(r1[0]!.id).toBe("test/model-1")
      expect(r1[0]!.autor).toBe("test")
      expect(r1[0]!.descargas).toBe(1000)
      // Segunda llamada debería usar cache.
      const r2 = await buscarModelosHf("qwen", 10)
      expect(r2.length).toBe(2)
      expect(calls).toBe(1) // no re-fetch
    } finally {
      globalThis.fetch = origFetch
      limpiarCacheHf()
    }
  })

  test("listarGgufsDeModelo filtra .gguf y ordena por quant", async () => {
    limpiarCacheHf()
    const origFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          { path: "README.md", type: "file", size: 1024 },
          { path: "model-Q8_0.gguf", type: "file", size: 8_000_000_000 },
          { path: "model-Q4_K_M.gguf", type: "file", size: 4_000_000_000 },
          { path: "model-Q5_K_M.gguf", type: "file", size: 5_000_000_000 },
          { path: "config.json", type: "file", size: 512 },
        ]),
        { status: 200 },
      )) as unknown as typeof fetch
    try {
      const files = await listarGgufsDeModelo("test/model")
      expect(files.length).toBe(3) // filtró no-gguf
      expect(files[0]!.quant).toBe("Q4_K_M") // sweet spot primero
      expect(files[1]!.quant).toBe("Q5_K_M")
      expect(files[0]!.sizeMB).toBeGreaterThan(3000)
      expect(files[0]!.url).toContain("huggingface.co")
    } finally {
      globalThis.fetch = origFetch
      limpiarCacheHf()
    }
  })

  test("buscarModelosHf propaga error HTTP", async () => {
    limpiarCacheHf()
    const origFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response("fail", { status: 500 })) as unknown as typeof fetch
    try {
      await expect(buscarModelosHf("x")).rejects.toThrow(/HF HTTP 500/)
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

describe("Binary bootstrap · shape", () => {
  test("bootstrap detecta plataforma no soportada", async () => {
    // No podemos falsificar process.platform en runtime; solo verificamos que
    // el flujo devuelve el shape correcto sin explotar.
    const { bootstrapLlamaBinary } = await import("../src/runtime/binary-bootstrap")
    const dir = mkdtempSync(join(tmpdir(), "boot-test-"))
    try {
      // Pasamos urlOverride inválida para que falle rápido — así verificamos
      // el error handling sin depender de red externa.
      const r = await bootstrapLlamaBinary({
        binDir: dir,
        urlOverride: "http://localhost:1/inexistente.zip",
      })
      expect(r.ok).toBe(false)
      expect(r.mensajeError).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
