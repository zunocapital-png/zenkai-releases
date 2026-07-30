import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  detectarMimeMagic,
  normalizarImagen,
  normalizarPartsImagen,
} from "../src/vision/normalizador"

// Bytes de una PNG mínima 1x1 transparente.
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const GIF_MAGIC = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
const BMP_MAGIC = new Uint8Array([0x42, 0x4d, 0x00, 0x00])

describe("Vision · corto plazo #4 (attach validado)", () => {
  test("detectarMimeMagic reconoce PNG/JPEG/GIF/BMP", () => {
    expect(detectarMimeMagic(PNG_1X1)).toBe("image/png")
    expect(detectarMimeMagic(JPEG_MAGIC)).toBe("image/jpeg")
    expect(detectarMimeMagic(GIF_MAGIC)).toBe("image/gif")
    expect(detectarMimeMagic(BMP_MAGIC)).toBe("image/bmp")
  })

  test("detectarMimeMagic rechaza WEBP incompleto (solo RIFF sin WEBP tag)", () => {
    // RIFF pero SIN los bytes "WEBP" en pos 8-11.
    const fake = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x42, 0x43, 0x44])
    expect(detectarMimeMagic(fake)).toBeUndefined()
  })

  test("detectarMimeMagic acepta WEBP válido", () => {
    const real = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    expect(detectarMimeMagic(real)).toBe("image/webp")
  })

  test("detectarMimeMagic devuelve undefined para bytes desconocidos", () => {
    expect(detectarMimeMagic(new Uint8Array([0x00, 0x00, 0x00]))).toBeUndefined()
  })

  test("normalizarImagen passthrough data URI", () => {
    const uri = "data:image/png;base64,iVBORw0KGgo="
    const r = normalizarImagen(uri)
    expect(r.url).toBe(uri)
    expect(r.mimeType).toBe("image/png")
    expect(r.fuente).toBe("data")
  })

  test("normalizarImagen passthrough URL http", () => {
    const r = normalizarImagen("https://example.com/foo.png")
    expect(r.url).toBe("https://example.com/foo.png")
    expect(r.fuente).toBe("http")
  })

  test("normalizarImagen lee file path → data URI base64", () => {
    const dir = mkdtempSync(join(tmpdir(), "vision-test-"))
    try {
      const path = join(dir, "test.png")
      writeFileSync(path, PNG_1X1)
      const r = normalizarImagen(path)
      expect(r.mimeType).toBe("image/png")
      expect(r.fuente).toBe("file")
      expect(r.bytes).toBe(PNG_1X1.length)
      expect(r.url.startsWith("data:image/png;base64,")).toBe(true)
      // Verificar que el base64 decode devuelve los bytes originales.
      const b64 = r.url.slice("data:image/png;base64,".length)
      const decoded = Buffer.from(b64, "base64")
      expect(decoded.length).toBe(PNG_1X1.length)
      expect(decoded[0]).toBe(0x89)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("normalizarImagen rechaza archivo grande", () => {
    const dir = mkdtempSync(join(tmpdir(), "vision-big-"))
    try {
      const path = join(dir, "big.png")
      // 100 KB — pero límite lo pongo a 50 KB para forzar el fail.
      writeFileSync(path, new Uint8Array(100_000))
      expect(() => normalizarImagen(path, { maxBytes: 50_000 })).toThrow(/demasiado grande/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("normalizarImagen rechaza archivo no-imagen", () => {
    const dir = mkdtempSync(join(tmpdir(), "vision-txt-"))
    try {
      const path = join(dir, "note.txt")
      writeFileSync(path, "hola mundo")
      expect(() => normalizarImagen(path)).toThrow(/no parece una imagen/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("normalizarPartsImagen convierte parts image y preserva text", () => {
    const dir = mkdtempSync(join(tmpdir(), "vision-parts-"))
    try {
      const path = join(dir, "test.png")
      writeFileSync(path, PNG_1X1)
      const parts = normalizarPartsImagen([
        { type: "text", text: "Analizá esta imagen:" },
        { type: "image", url: path },
        { type: "image", url: "https://example.com/otra.jpg" },
      ])
      expect(parts.length).toBe(3)
      expect(parts[0]!.type).toBe("text")
      expect(parts[1]!.type).toBe("image")
      expect((parts[1] as { type: "image"; url: string }).url.startsWith("data:image/png;base64,")).toBe(true)
      expect((parts[2] as { type: "image"; url: string }).url).toBe("https://example.com/otra.jpg")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("normalizarPartsImagen convierte error de imagen a text descriptivo", () => {
    const parts = normalizarPartsImagen([
      { type: "text", text: "hola" },
      { type: "image", url: "/no/existe/nunca.png" },
    ])
    expect(parts[1]!.type).toBe("text")
    expect((parts[1] as { type: "text"; text: string }).text).toContain("imagen no cargada")
  })
})
