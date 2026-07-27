import fs from "fs/promises"
import path from "path"

export interface ModelfileParams {
  temperature?: number
  top_p?: number
  top_k?: number
  num_ctx?: number
  repeat_penalty?: number
  stop?: string[]
}

export interface LoRAConfig {
  base_model: string
  dataset_path: string
  output_dir: string
  lora_r: number
  lora_alpha: number
  lora_dropout: number
  learning_rate: number
  num_epochs: number
  batch_size: number
  max_seq_length: number
  gradient_accumulation_steps: number
  warmup_steps: number
  fp16: boolean
  bf16: boolean
  use_4bit: boolean
  use_8bit: boolean
}

export interface DatasetValidation {
  valid: boolean
  totalLines: number
  validLines: number
  invalidLines: number
  errors: { line: number; error: string }[]
  avgTokenEstimate: number
  formatDetected: "alpaca" | "sharegpt" | "unknown"
}

export interface TrainingEstimate {
  totalMinutes: number
  tokensPerSecond: number
  epochs: number
  stepsPerEpoch: number
  totalSteps: number
  memoryRequired: string
  feasible: boolean
  notes: string[]
}

const DEFAULT_RTX4060: ModelfileParams = {
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  num_ctx: 4096,
  repeat_penalty: 1.1,
}

export function generateOllamaModelfile(
  baseModel: string,
  datasetPath: string,
  params: Partial<ModelfileParams> = {},
): string {
  const merged = { ...DEFAULT_RTX4060, ...params }
  const lines: string[] = [
    `FROM ${baseModel}`,
    "",
    `SYSTEM """You are a coding assistant fine-tuned on project-specific patterns. Training data: ${path.basename(datasetPath)}. Follow the project's naming conventions, import style, and code patterns exactly."""`,
    "",
  ]

  if (merged.temperature !== undefined) lines.push(`PARAMETER temperature ${merged.temperature}`)
  if (merged.top_p !== undefined) lines.push(`PARAMETER top_p ${merged.top_p}`)
  if (merged.top_k !== undefined) lines.push(`PARAMETER top_k ${merged.top_k}`)
  if (merged.num_ctx !== undefined) lines.push(`PARAMETER num_ctx ${merged.num_ctx}`)
  if (merged.repeat_penalty !== undefined) lines.push(`PARAMETER repeat_penalty ${merged.repeat_penalty}`)
  if (merged.stop) {
    for (const s of merged.stop) {
      lines.push(`PARAMETER stop "${s}"`)
    }
  }

  return lines.join("\n") + "\n"
}

export function generateLoRAConfig(
  baseModel: string,
  datasetPath: string,
  overrides: Partial<LoRAConfig> = {},
): LoRAConfig {
  const outputDir = path.join(path.dirname(datasetPath), "output", baseModel.replace(/\//g, "_"))
  return {
    base_model: baseModel,
    dataset_path: datasetPath,
    output_dir: outputDir,
    lora_r: 16,
    lora_alpha: 32,
    lora_dropout: 0.05,
    learning_rate: 2e-4,
    num_epochs: 3,
    batch_size: 2,
    max_seq_length: 2048,
    gradient_accumulation_steps: 4,
    warmup_steps: 10,
    fp16: false,
    bf16: true,
    use_4bit: true,
    use_8bit: false,
    ...overrides,
  }
}

export function estimateTrainingTime(
  datasetSize: number,
  modelSizeB: number,
  gpuVramGB: number = 8,
): TrainingEstimate {
  const notes: string[] = []
  const feasibleModelSize = gpuVramGB >= 8 ? 7 : gpuVramGB >= 6 ? 3 : 1
  const feasible = modelSizeB <= feasibleModelSize

  if (!feasible) {
    notes.push(`Model ${modelSizeB}B requires more VRAM than available ${gpuVramGB}GB with 4-bit quantization`)
  }

  const tokensPerExample = 512
  const totalTokens = datasetSize * tokensPerExample
  const tokensPerSecond = gpuVramGB >= 8 ? (modelSizeB <= 3 ? 80 : 35) : 15
  const batchSize = gpuVramGB >= 8 ? 2 : 1
  const gradAccum = 4
  const effectiveBatch = batchSize * gradAccum
  const stepsPerEpoch = Math.ceil(datasetSize / effectiveBatch)
  const epochs = 3
  const totalSteps = stepsPerEpoch * epochs
  const totalTokensProcessed = totalSteps * effectiveBatch * tokensPerExample
  const totalSeconds = totalTokensProcessed / tokensPerSecond
  const totalMinutes = Math.ceil(totalSeconds / 60)

  const memGB = modelSizeB <= 3 ? 5.5 : modelSizeB <= 7 ? 7.2 : 14
  const memoryRequired = `~${memGB.toFixed(1)}GB VRAM (4-bit LoRA)`

  if (totalMinutes > 60) {
    notes.push(`Training will take over ${Math.ceil(totalMinutes / 60)} hour(s)`)
  }
  if (datasetSize < 100) {
    notes.push("Dataset is small; consider collecting more examples to avoid overfitting")
  }

  return {
    totalMinutes,
    tokensPerSecond,
    epochs,
    stepsPerEpoch,
    totalSteps,
    memoryRequired,
    feasible,
    notes,
  }
}

export async function validateDataset(filePath: string): Promise<DatasetValidation> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, "utf-8")
  } catch {
    return {
      valid: false,
      totalLines: 0,
      validLines: 0,
      invalidLines: 0,
      errors: [{ line: 0, error: `Cannot read file: ${filePath}` }],
      avgTokenEstimate: 0,
      formatDetected: "unknown",
    }
  }

  const lines = raw.split("\n").filter((l) => l.trim())
  let format: "alpaca" | "sharegpt" | "unknown" = "unknown"
  let validLines = 0
  const errors: { line: number; error: string }[] = []
  let totalCharLen = 0

  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i])
      if (obj.instruction !== undefined && obj.output !== undefined) {
        if (format === "unknown") format = "alpaca"
        if (!obj.instruction.trim()) {
          errors.push({ line: i + 1, error: "Empty instruction field" })
          continue
        }
        if (!obj.output.trim()) {
          errors.push({ line: i + 1, error: "Empty output field" })
          continue
        }
        totalCharLen += obj.instruction.length + (obj.input?.length || 0) + obj.output.length
        validLines++
      } else if (obj.conversations !== undefined && Array.isArray(obj.conversations)) {
        if (format === "unknown") format = "sharegpt"
        if (obj.conversations.length < 2) {
          errors.push({ line: i + 1, error: "Conversation needs at least 2 turns" })
          continue
        }
        for (const turn of obj.conversations) {
          totalCharLen += (turn.value || "").length
        }
        validLines++
      } else {
        errors.push({ line: i + 1, error: "Unrecognized format: missing instruction/output or conversations" })
      }
    } catch {
      errors.push({ line: i + 1, error: "Invalid JSON" })
    }
  }

  const avgTokenEstimate = validLines > 0 ? Math.round(totalCharLen / validLines / 4) : 0

  return {
    valid: errors.length === 0 && validLines > 0,
    totalLines: lines.length,
    validLines,
    invalidLines: lines.length - validLines,
    errors: errors.slice(0, 50),
    avgTokenEstimate,
    formatDetected: format,
  }
}

export * as TrainingConfig from "./training-config"
