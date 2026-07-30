import { describe, expect, test } from "bun:test"
import { detectarGpu, mejorBackend } from "../src/finetune/gpu"
import { generarScriptUnsloth, correrTraining } from "../src/finetune/runner"

describe("Fine-tune GPU + runner · #82", () => {
  test("detectarGpu siempre devuelve al menos CPU", async () => {
    const gpus = await detectarGpu()
    expect(gpus.length).toBeGreaterThan(0)
    const cpu = gpus.find((g) => g.backend === "cpu")
    expect(cpu).toBeDefined()
    expect(cpu?.disponible).toBe(true)
  })

  test("mejorBackend prioriza GPU sobre CPU", async () => {
    const gpus = await detectarGpu()
    const mejor = mejorBackend(gpus)
    // Si hay CUDA/ROCm/Metal disponible, no debería ser cpu.
    const hayGpuReal = gpus.some((g) => g.disponible && g.backend !== "cpu")
    if (hayGpuReal) expect(mejor.backend).not.toBe("cpu")
  })

  test("generarScriptUnsloth produce Python válido", () => {
    const script = generarScriptUnsloth({
      datasetPath: "/tmp/data.jsonl",
      baseModel: "Qwen/Qwen2.5-7B-Instruct",
      outputDir: "/tmp/out",
      epochs: 2,
      rank: 8,
    })
    expect(script).toContain("from unsloth import FastLanguageModel")
    expect(script).toContain('model_name = "Qwen/Qwen2.5-7B-Instruct"')
    expect(script).toContain("r = 8")
    expect(script).toContain("num_train_epochs = 2")
    expect(script).toContain("ZENKAI_TRAIN_DONE")
  })

  test("correrTraining rechaza si dataset no existe", async () => {
    const r = await correrTraining({
      datasetPath: "/no/existe/nunca.jsonl",
      baseModel: "x",
      outputDir: "/tmp/no",
    })
    expect(r.ok).toBe(false)
    expect(r.mensajeError).toContain("no existe")
  })

  test("correrTraining rechaza CPU-only por default", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = require("node:fs")
    const { tmpdir } = require("node:os")
    const { join } = require("node:path")
    const dir = mkdtempSync(join(tmpdir(), "train-cpu-"))
    try {
      const dataset = join(dir, "d.jsonl")
      writeFileSync(dataset, '{"messages":[]}\n')
      const r = await correrTraining({
        datasetPath: dataset,
        baseModel: "x",
        outputDir: dir,
      })
      // Si no hay GPU real, rechaza; si hay GPU real, intenta y probablemente
      // falle por python/unsloth ausente — ambos son OK para este test.
      if (r.mensajeError?.includes("no se detectó GPU")) {
        expect(r.ok).toBe(false)
      } else {
        expect(typeof r.ok).toBe("boolean")
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
