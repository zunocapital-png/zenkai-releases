import { spawn, execFile } from "child_process"
import { existsSync, mkdirSync } from "fs"
import { readFile, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { detectFirstLaunchStatus, DEFAULT_MODEL, configFilePath } from "./first-launch"

export interface SetupProgress {
  step: "detect" | "install-ollama" | "start-ollama" | "pull-model" | "write-config" | "done" | "error"
  message: string
  detail?: string
}

export type ProgressCallback = (progress: SetupProgress) => void

function execAsync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) return reject(error)
      resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" })
    })
  })
}

// Long-running commands (installers) need a much larger timeout than probes.
function execAsyncLong(cmd: string, args: string[], timeoutMs = 15 * 60 * 1000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) return reject(error)
      resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" })
    })
  })
}

// ---------- Ollama auto-install ----------

// Installs Ollama without user intervention. Tries winget first (present on
// Windows 10/11), then falls back to downloading the official silent installer.
// Returns the resolved ollama path on success, or undefined if it could not
// be installed automatically (caller should then guide a manual install).
export async function ensureOllamaInstalled(onProgress?: ProgressCallback): Promise<string | undefined> {
  const before = await detectFirstLaunchStatus()
  if (before.ollamaInstalled) return before.ollamaPath!

  if (process.platform !== "win32") return undefined

  onProgress?.({
    step: "install-ollama",
    message: "Instalando Ollama automaticamente...",
    detail: "Primera vez: puede tardar unos minutos",
  })

  // Attempt 1: winget (silent, accepts agreements)
  try {
    await execAsyncLong("winget", [
      "install",
      "--id",
      "Ollama.Ollama",
      "-e",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ])
  } catch {
    // Attempt 2: download the official installer and run it silently
    try {
      onProgress?.({ step: "install-ollama", message: "Descargando instalador de Ollama..." })
      const setupPath = path.join(os.tmpdir(), "OllamaSetup.exe")
      const res = await fetch("https://ollama.com/download/OllamaSetup.exe", {
        signal: AbortSignal.timeout(10 * 60 * 1000),
      })
      if (!res.ok) return undefined
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(setupPath, buf)
      await execAsyncLong(setupPath, ["/SILENT", "/VERYSILENT", "/NORESTART"])
    } catch {
      return undefined
    }
  }

  // Re-detect after install (PATH may not be refreshed in this process, so
  // detectFirstLaunchStatus also probes the known install locations).
  const after = await detectFirstLaunchStatus()
  return after.ollamaPath
}

// ---------- Ollama lifecycle ----------

export async function ensureOllamaRunning(ollamaPath: string): Promise<boolean> {
  // Check if already running via HTTP endpoint
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) })
    if (res.ok) return true
  } catch {
    // not running yet
  }

  // Spawn ollama serve in the background
  const child = spawn(ollamaPath, ["serve"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  child.unref()

  // Wait up to 15s for the server to become reachable
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
    try {
      const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) })
      if (res.ok) return true
    } catch {
      // keep waiting
    }
  }
  return false
}

// ---------- Model pull ----------

export async function pullModelIfNeeded(
  ollamaPath: string,
  model: string,
  onProgress?: ProgressCallback,
): Promise<boolean> {
  // Check if already present via HTTP API
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string }> }
      const found = (data.models ?? []).some((m) => m.name.toLowerCase().includes(model.toLowerCase()))
      if (found) return true
    }
  } catch {
    // server may not be ready; try CLI below
  }

  onProgress?.({ step: "pull-model", message: `Descargando modelo ${model}...`, detail: "Esto puede tardar varios minutos la primera vez" })

  // Pull via HTTP streaming API for progress visibility
  try {
    const res = await fetch("http://localhost:11434/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(30 * 60 * 1000), // 30 min timeout for large models
    })

    if (!res.ok || !res.body) {
      // Fallback to CLI
      return pullModelViaCLI(ollamaPath, model)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let lastPercent = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        try {
          const obj = JSON.parse(line) as { status?: string; completed?: number; total?: number }
          if (obj.total && obj.completed) {
            const pct = Math.round((obj.completed / obj.total) * 100)
            const pctStr = `${pct}%`
            if (pctStr !== lastPercent) {
              lastPercent = pctStr
              onProgress?.({ step: "pull-model", message: `Descargando ${model}: ${pctStr}`, detail: obj.status })
            }
          } else if (obj.status) {
            onProgress?.({ step: "pull-model", message: obj.status })
          }
        } catch {
          // non-JSON line, ignore
        }
      }
    }
    return true
  } catch {
    return pullModelViaCLI(ollamaPath, model)
  }
}

async function pullModelViaCLI(ollamaPath: string, model: string): Promise<boolean> {
  try {
    await execAsync(ollamaPath, ["pull", model])
    return true
  } catch {
    return false
  }
}

// ---------- Config ----------

function defaultConfig(model: string): string {
  const config = {
    $schema: "https://opencode.ai/config.json",
    model: `ollama/${model}`,
    provider: {
      ollama: {
        npm: "@ai-sdk/openai-compatible",
        name: "Ollama (local)",
        options: {
          baseURL: "http://localhost:11434/v1",
        },
        models: {
          "qwen3:14b": { name: "Qwen3 14B (local, default)" },
          "qwen3:8b": { name: "Qwen3 8B (local, fallback)" },
          "qwen3:30b-a3b": { name: "Qwen3 30B-A3B MoE (local, 3B activos)" },
          "qwen2.5-coder:7b": { name: "Qwen2.5 Coder 7B (local)" },
          "qwen2.5:7b": { name: "Qwen2.5 7B (local)" },
        },
      },
    },
    mcp: {
      context7: {
        type: "local",
        command: ["npx", "-y", "@upstash/context7-mcp"],
        enabled: true,
      },
    },
  }
  return JSON.stringify(config, null, 2) + "\n"
}

async function writeDefaultConfig(model: string): Promise<void> {
  const cfgPath = configFilePath()
  const cfgDir = path.dirname(cfgPath)
  if (!existsSync(cfgDir)) {
    mkdirSync(cfgDir, { recursive: true })
  }
  await writeFile(cfgPath, defaultConfig(model), "utf-8")
}

async function readExistingConfig(): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(configFilePath(), "utf-8")
    // Strip JSONC comments for basic parsing
    const stripped = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    return JSON.parse(stripped)
  } catch {
    return undefined
  }
}

// ---------- VRAM heuristic ----------

async function pickModelForVRAM(): Promise<string> {
  // On Windows, try to detect VRAM via nvidia-smi
  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync("nvidia-smi", [
        "--query-gpu=memory.total",
        "--format=csv,noheader,nounits",
      ])
      const vramMB = parseInt(stdout.trim().split(/\r?\n/)[0] ?? "0", 10)
      if (vramMB > 0 && vramMB < 10_000) {
        return "qwen3:8b" // < 10GB VRAM, use smaller model
      }
    } catch {
      // nvidia-smi not available, check total system RAM as rough proxy
    }
  }

  const totalRAM = os.totalmem()
  const totalGB = totalRAM / (1024 ** 3)
  if (totalGB < 12) {
    return "qwen3:8b"
  }
  return DEFAULT_MODEL
}

// ---------- Orchestrator ----------

export async function runFirstLaunchSetup(onProgress?: ProgressCallback): Promise<{
  success: boolean
  model: string
  error?: string
}> {
  try {
    // 1. Detect current state
    onProgress?.({ step: "detect", message: "Detectando entorno..." })
    let status = await detectFirstLaunchStatus()

    // Auto-install Ollama if missing (winget → silent installer fallback).
    if (!status.ollamaInstalled) {
      const installedPath = await ensureOllamaInstalled(onProgress)
      if (!installedPath) {
        return {
          success: false,
          model: status.modelName,
          error: "No se pudo instalar Ollama automaticamente. Descargalo desde https://ollama.com/download",
        }
      }
      status = await detectFirstLaunchStatus()
    }

    const ollamaCmd = status.ollamaPath!

    // 2. Start Ollama if needed
    if (!status.ollamaRunning) {
      onProgress?.({ step: "start-ollama", message: "Iniciando Ollama..." })
      const started = await ensureOllamaRunning(ollamaCmd)
      if (!started) {
        return {
          success: false,
          model: status.modelName,
          error: "No se pudo iniciar Ollama. Ejecuta 'ollama serve' manualmente.",
        }
      }
    }

    // 3. Pick best model for hardware
    const model = await pickModelForVRAM()

    // 4. Pull model if needed
    if (!status.modelReady || model !== status.modelName) {
      const pulled = await pullModelIfNeeded(ollamaCmd, model, onProgress)
      if (!pulled) {
        return {
          success: false,
          model,
          error: `No se pudo descargar el modelo ${model}. Ejecuta 'ollama pull ${model}' manualmente.`,
        }
      }
    }

    // 5. Write config if it doesn't exist
    if (!status.configExists) {
      onProgress?.({ step: "write-config", message: "Escribiendo configuracion..." })
      await writeDefaultConfig(model)
    } else {
      // Config exists — verify ollama provider is configured
      const existing = await readExistingConfig()
      if (existing && !existing.provider) {
        onProgress?.({ step: "write-config", message: "Actualizando configuracion con proveedor Ollama..." })
        await writeDefaultConfig(model)
      }
    }

    onProgress?.({ step: "done", message: "Listo — Zenkai configurado con " + model })

    return { success: true, model }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    onProgress?.({ step: "error", message: "Error durante la configuracion", detail: msg })
    return { success: false, model: DEFAULT_MODEL, error: msg }
  }
}
