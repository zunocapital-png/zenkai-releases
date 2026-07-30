import { describe, expect, test } from "bun:test"
import { PASOS_WIZARD, MODELO_BUNDLEADO, SUGERENCIAS_PRIMER_CHAT, progresoWizard } from "../src/onboarding/wizard"

describe("Onboarding wizard", () => {
  test("catálogo tiene 3 pasos ordenados", () => {
    expect(PASOS_WIZARD.length).toBe(3)
    expect(PASOS_WIZARD[0]!.id).toBe("arranque")
    expect(PASOS_WIZARD[1]!.id).toBe("modelo-bundleado")
    expect(PASOS_WIZARD[2]!.id).toBe("primer-chat")
  })

  test("estado vacío → 0% + primer paso pendiente", () => {
    const p = progresoWizard({ routerVivo: false, modeloBundleadoCargado: false, primerMensajeEnviado: false })
    expect(p.pct).toBe(0)
    expect(p.pasoActual?.id).toBe("arranque")
    expect(p.completo).toBe(false)
  })

  test("router vivo → 33% + segundo paso pendiente", () => {
    const p = progresoWizard({ routerVivo: true, modeloBundleadoCargado: false, primerMensajeEnviado: false })
    expect(p.pct).toBe(33)
    expect(p.pasosCompletados).toBe(1)
    expect(p.pasoActual?.id).toBe("modelo-bundleado")
  })

  test("todo completo → 100% + completo=true", () => {
    const p = progresoWizard({ routerVivo: true, modeloBundleadoCargado: true, primerMensajeEnviado: true })
    expect(p.pct).toBe(100)
    expect(p.completo).toBe(true)
    expect(p.pasoActual).toBeUndefined()
  })

  test("modelo bundleado tiene tamaño razonable (~1 GB)", () => {
    expect(MODELO_BUNDLEADO.id).toBe("qwen2.5-1.5b-q4")
    expect(MODELO_BUNDLEADO.bytesAprox).toBeGreaterThan(500_000_000)
    expect(MODELO_BUNDLEADO.bytesAprox).toBeLessThan(2_000_000_000)
    expect(MODELO_BUNDLEADO.ramMinimaMB).toBeLessThanOrEqual(4096)
  })

  test("sugerencias primer chat con id + label + prompt", () => {
    expect(SUGERENCIAS_PRIMER_CHAT.length).toBeGreaterThanOrEqual(4)
    for (const s of SUGERENCIAS_PRIMER_CHAT) {
      expect(s.id).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.prompt.length).toBeGreaterThan(10)
    }
  })

  test("pasos con ejemploPrompt tienen prompt no vacío", () => {
    const chatStep = PASOS_WIZARD.find((p) => p.id === "primer-chat")
    expect(chatStep?.ejemploPrompt).toBeTruthy()
  })
})
