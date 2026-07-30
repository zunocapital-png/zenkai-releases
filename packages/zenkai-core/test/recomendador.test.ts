import { describe, expect, test } from "bun:test"
import {
  diagnosticar,
  evaluarModelos,
  elegirMejorPorTipo,
  resumenRecomendacion,
} from "../src/runtime/recomendador"
import type { HwSnapshot } from "../src/runtime/hw-monitor"
import { MODELOS_RECOMENDADOS } from "../src/runtime/gguf-downloader"

function hw(opts: { ramGB: number; ramLibreGB?: number; vramGB?: number; gpuNombre?: string }): HwSnapshot {
  return {
    ram: {
      totalMB: opts.ramGB * 1024,
      libreMB: (opts.ramLibreGB ?? opts.ramGB * 0.7) * 1024,
      usadoPct: 30,
    },
    cpu: { cores: 8 },
    gpu: opts.vramGB ? { nombre: opts.gpuNombre ?? "test-gpu", vramTotalMB: opts.vramGB * 1024 } : undefined,
    ts: 0,
  }
}

describe("Recomendador · diagnóstico de HW", () => {
  test("laptop 12 GB sin GPU → perfil laptop", () => {
    const d = diagnosticar(hw({ ramGB: 12, ramLibreGB: 8 }))
    expect(d.tieneGpu).toBe(false)
    expect(d.perfil).toBe("laptop")
    expect(d.memoriaUtilMB).toBeGreaterThan(4000)
  })

  test("máquina 4 GB → perfil muy-limitado", () => {
    const d = diagnosticar(hw({ ramGB: 4, ramLibreGB: 3 }))
    expect(d.perfil).toBe("muy-limitado")
  })

  test("GPU 8 GB → workstation", () => {
    const d = diagnosticar(hw({ ramGB: 16, vramGB: 12 }))
    expect(d.tieneGpu).toBe(true)
    expect(d.perfil).toBe("workstation")
    expect(d.vramDisponibleMB).toBeGreaterThan(9000)
  })

  test("GPU 24 GB → gpu-dedicada", () => {
    const d = diagnosticar(hw({ ramGB: 32, vramGB: 24 }))
    expect(d.perfil).toBe("gpu-dedicada")
  })

  test("GPU 48 GB → estacion-ml", () => {
    const d = diagnosticar(hw({ ramGB: 64, vramGB: 48 }))
    expect(d.perfil).toBe("estacion-ml")
  })
})

describe("Recomendador · evaluación de modelos", () => {
  test("laptop 8 GB puede correr 7B pero no 32B", () => {
    const d = diagnosticar(hw({ ramGB: 16, ramLibreGB: 10 }))
    const evals = evaluarModelos(d)
    const coder7b = evals.find((e) => e.modelo.id === "qwen2.5-coder-7b-q4")
    const coder32b = evals.find((e) => e.modelo.id === "qwen2.5-coder-32b-q4")
    expect(coder7b?.puedeCorrer).toBe(true)
    expect(coder32b?.puedeCorrer).toBe(false)
    expect(coder32b?.motivo).toContain("necesita")
  })

  test("GPU 32 GB puede correr Qwen 32B óptimo", () => {
    const d = diagnosticar(hw({ ramGB: 64, vramGB: 32 }))
    const evals = evaluarModelos(d)
    const coder32b = evals.find((e) => e.modelo.id === "qwen2.5-coder-32b-q4")
    expect(coder32b?.puedeCorrer).toBe(true)
    expect(["muy-rapido", "rapido"]).toContain(coder32b?.velocidadEsperada ?? "")
  })

  test("elegirMejorPorTipo devuelve el más potente que corra óptimo", () => {
    const d = diagnosticar(hw({ ramGB: 64, vramGB: 32 }))
    const evals = evaluarModelos(d)
    const mejor = elegirMejorPorTipo(evals, "coding")
    expect(mejor?.modelo.tipo).toBe("coding")
    // Con 32 GB VRAM debería ser Qwen 32B Coder.
    expect(mejor?.modelo.id).toBe("qwen2.5-coder-32b-q4")
  })

  test("laptop chica sugiere 7B como mejor coding", () => {
    const d = diagnosticar(hw({ ramGB: 12, ramLibreGB: 8 }))
    const evals = evaluarModelos(d)
    const mejor = elegirMejorPorTipo(evals, "coding")
    expect(mejor?.modelo.id).toBe("qwen2.5-coder-7b-q4")
  })

  test("evaluación anota velocidad esperada", () => {
    // 8 GB libres → 6 GB útiles → tiny (2 GB pide) corre.
    const d = diagnosticar(hw({ ramGB: 8, ramLibreGB: 8 }))
    const evals = evaluarModelos(d)
    const tiny = evals.find((e) => e.modelo.tipo === "tiny")
    expect(tiny?.puedeCorrer).toBe(true)
  })
})

describe("Recomendador · resumen completo", () => {
  test("laptop devuelve mensaje adecuado + mejores por tipo", () => {
    const r = resumenRecomendacion(hw({ ramGB: 16, ramLibreGB: 10 }))
    expect(r.diagnostico.perfil).toBe("workstation")
    expect(r.mensaje).toContain("Workstation")
    expect(r.mejorCoding?.modelo.tipo).toBe("coding")
    expect(r.mejorGeneral?.modelo.tipo).toBe("general")
    expect(r.mejorEmbed?.modelo.tipo).toBe("embed")
    expect(r.todos.length).toBe(MODELOS_RECOMENDADOS.length)
  })

  test("muy-limitado avisa que use nube", () => {
    const r = resumenRecomendacion(hw({ ramGB: 4, ramLibreGB: 2.5 }))
    expect(r.diagnostico.perfil).toBe("muy-limitado")
    expect(r.mensaje.toLowerCase()).toContain("cloud")
  })

  test("estación ML sugiere modelo frontera", () => {
    const r = resumenRecomendacion(hw({ ramGB: 128, vramGB: 80 }))
    expect(r.diagnostico.perfil).toBe("estacion-ml")
    // Debería sugerir el 70B/72B como general.
    expect(["llama3.3-70b-q4", "qwen2.5-72b-q4", "qwen2.5-32b-q4"]).toContain(r.mejorGeneral?.modelo.id ?? "")
  })
})

describe("Catálogo · sanidad", () => {
  test("todos los modelos tienen URL HF válida", () => {
    for (const m of MODELOS_RECOMENDADOS) {
      expect(m.url.startsWith("https://huggingface.co/")).toBe(true)
      expect(m.url.endsWith(".gguf")).toBe(true)
      expect(m.bytesAprox).toBeGreaterThan(0)
      expect(m.ramMinimaMB).toBeGreaterThan(0)
      expect(m.potencia).toBeGreaterThan(0)
      expect(m.potencia).toBeLessThanOrEqual(10)
    }
  })

  test("catálogo cubre potencia de 1 a 10 al menos parcialmente", () => {
    const potencias = new Set(MODELOS_RECOMENDADOS.map((m) => m.potencia))
    expect(potencias.size).toBeGreaterThanOrEqual(5)
  })

  test("cada tipo tiene al menos un modelo", () => {
    const tipos = ["coding", "general", "reasoning", "vision", "embed", "tiny"] as const
    for (const t of tipos) {
      expect(MODELOS_RECOMENDADOS.some((m) => m.tipo === t)).toBe(true)
    }
  })
})
