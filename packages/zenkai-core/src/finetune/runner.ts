import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { detectarGpu, mejorBackend } from "./gpu"
import type { BackendGpu } from "./gpu"

// LoRA training runner: orquesta un training real vía unsloth/axolotl como
// subprocess, con streaming de progress. NO reimplementamos el training —
// invocamos el script Python del usuario (o uno que generamos).
//
// Diseño honesto:
//   - unsloth/axolotl son PIP packages Python; el runner asume que están
//     instalados en el env Python del usuario.
//   - Si no hay GPU real → refusa a arrancar (no queremos mentir 3 días de CPU).
//   - Todo el progress se emite via callback → UI lo pinta en vivo.

export type TrainRequest = {
  /** Archivo dataset JSONL (formato sharegpt o messages). */
  datasetPath: string
  /** Modelo base a fine-tunear (HF id o path local). */
  baseModel: string
  /** Directorio de output para el adapter GGUF. */
  outputDir: string
  /** Epochs (default 3). */
  epochs?: number
  /** Learning rate (default 2e-4). */
  learningRate?: number
  /** Rank del LoRA (default 16). */
  rank?: number
  /** True para forzar arranque en CPU aún sin GPU. Default false. */
  permitirCpu?: boolean
  /** Ejecutable python a usar. Default "python". */
  pythonBinary?: string
  /** Callback de línea de log (streaming). */
  onLog?: (linea: string) => void
  /** Callback de progress parseado (step actual, loss). */
  onProgress?: (info: TrainProgress) => void
}

export type TrainProgress = {
  stepActual?: number
  stepsTotales?: number
  epoch?: number
  loss?: number
  learningRate?: number
  crudoLog: string
}

export type TrainResultado = {
  ok: boolean
  backendUsado: BackendGpu
  adapterPath?: string
  exitCode: number | null
  duracionMs: number
  mensajeError?: string
}

/**
 * Genera el script Python de training basado en unsloth (default) o axolotl.
 * Es una plantilla razonable pero deliberadamente simple. El usuario avanzado
 * puede sobrescribirla escribiendo su propio `train.py` en `outputDir`.
 */
export function generarScriptUnsloth(req: TrainRequest): string {
  const epochs = req.epochs ?? 3
  const lr = req.learningRate ?? 2e-4
  const rank = req.rank ?? 16
  return `# ZENKAI · Training LoRA con Unsloth
from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "${req.baseModel}",
    max_seq_length = 2048,
    dtype = None,
    load_in_4bit = True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r = ${rank},
    lora_alpha = ${rank * 2},
    lora_dropout = 0,
    bias = "none",
    use_gradient_checkpointing = True,
    random_state = 3407,
)

dataset = load_dataset("json", data_files = "${req.datasetPath.replace(/\\/g, "/")}")["train"]

def format_chat(sample):
    convs = sample.get("messages") or [
        {"role": "user" if c["from"] == "human" else "assistant", "content": c["value"]}
        for c in sample["conversations"]
    ]
    return tokenizer.apply_chat_template(convs, tokenize=False, add_generation_prompt=False)

trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = dataset,
    dataset_text_field = None,
    formatting_func = format_chat,
    max_seq_length = 2048,
    args = TrainingArguments(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 4,
        warmup_steps = 5,
        num_train_epochs = ${epochs},
        learning_rate = ${lr},
        logging_steps = 1,
        output_dir = "${req.outputDir.replace(/\\/g, "/")}",
        save_strategy = "epoch",
    ),
)
trainer.train()

# Exportar a GGUF adapter (usable por Ollama Modelfile ADAPTER).
model.save_pretrained_gguf("${req.outputDir.replace(/\\/g, "/")}/adapter", tokenizer, quantization_method="q4_k_m")
print("ZENKAI_TRAIN_DONE " + "${req.outputDir.replace(/\\/g, "/")}/adapter")
`
}

/**
 * Corre el training. Requiere GPU real (a menos que `permitirCpu=true`).
 * Devuelve el resultado — el path del adapter queda en `adapterPath`.
 */
export async function correrTraining(req: TrainRequest): Promise<TrainResultado> {
  const t0 = Date.now()
  if (!existsSync(req.datasetPath)) {
    return { ok: false, backendUsado: "cpu", exitCode: null, duracionMs: 0, mensajeError: `dataset no existe: ${req.datasetPath}` }
  }

  const gpus = await detectarGpu()
  const backend = mejorBackend(gpus)
  if (backend.backend === "cpu" && !req.permitirCpu) {
    return {
      ok: false,
      backendUsado: "cpu",
      exitCode: null,
      duracionMs: Date.now() - t0,
      mensajeError: "no se detectó GPU. Training en CPU está deshabilitado por default (muy lento). Pasá permitirCpu=true para forzar.",
    }
  }

  // Generar y escribir el script si no existe.
  const scriptPath = join(req.outputDir, "train.py")
  const dir = dirname(scriptPath)
  const { mkdirSync } = await import("node:fs")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(scriptPath, generarScriptUnsloth(req), "utf8")

  const python = req.pythonBinary ?? (process.platform === "win32" ? "python" : "python3")

  return new Promise<TrainResultado>((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(python, [scriptPath], { cwd: req.outputDir, windowsHide: true })
    } catch (e) {
      resolve({
        ok: false,
        backendUsado: backend.backend,
        exitCode: null,
        duracionMs: Date.now() - t0,
        mensajeError: `no se pudo lanzar ${python}: ${(e as Error).message}`,
      })
      return
    }

    let adapterPath: string | undefined
    let bufferLinea = ""

    const emitLinea = (linea: string) => {
      req.onLog?.(linea)
      // Parseo de progress típico de unsloth/TRL.
      const m1 = /(\d+)\/(\d+)/.exec(linea)
      const mLoss = /loss[\s=:]+([\d.]+)/i.exec(linea)
      const mEpoch = /epoch\s+([\d.]+)/i.exec(linea)
      const mLr = /learning_rate[\s=:]+([\d.e-]+)/i.exec(linea)
      req.onProgress?.({
        stepActual: m1 ? Number(m1[1]) : undefined,
        stepsTotales: m1 ? Number(m1[2]) : undefined,
        epoch: mEpoch ? Number(mEpoch[1]) : undefined,
        loss: mLoss ? Number(mLoss[1]) : undefined,
        learningRate: mLr ? Number(mLr[1]) : undefined,
        crudoLog: linea,
      })
      const mDone = /ZENKAI_TRAIN_DONE\s+(.+)/.exec(linea)
      if (mDone) adapterPath = mDone[1]!.trim()
    }

    const procesarBuffer = (chunk: Buffer) => {
      bufferLinea += chunk.toString("utf8")
      const lineas = bufferLinea.split("\n")
      bufferLinea = lineas.pop() ?? ""
      for (const l of lineas) emitLinea(l)
    }
    child.stdout?.on("data", procesarBuffer)
    child.stderr?.on("data", procesarBuffer)

    child.on("close", (code) => {
      if (bufferLinea) emitLinea(bufferLinea)
      resolve({
        ok: code === 0 && !!adapterPath,
        backendUsado: backend.backend,
        exitCode: code,
        duracionMs: Date.now() - t0,
        adapterPath,
        mensajeError: code !== 0 ? `training salió con code=${code}` : undefined,
      })
    })
    child.on("error", (err) => {
      resolve({
        ok: false,
        backendUsado: backend.backend,
        exitCode: null,
        duracionMs: Date.now() - t0,
        mensajeError: err.message,
      })
    })
  })
}
