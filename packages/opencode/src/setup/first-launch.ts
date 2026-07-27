import { execFile } from "child_process"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import os from "os"
import path from "path"

export interface FirstLaunchStatus {
  ollamaInstalled: boolean
  ollamaRunning: boolean
  modelReady: boolean
  modelName: string
  ollamaPath: string | undefined
  configExists: boolean
}

const DEFAULT_MODEL = "qwen3:14b"

const OLLAMA_WINDOWS_PATHS = [
  path.join(os.homedir(), "AppData", "Local", "Programs", "Ollama", "ollama.exe"),
  path.join(os.homedir(), "AppData", "Local", "Ollama", "ollama.exe"),
  "C:\\Program Files\\Ollama\\ollama.exe",
  "C:\\Program Files (x86)\\Ollama\\ollama.exe",
]

function execAsync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10_000 }, (error, stdout, stderr) => {
      if (error) return reject(error)
      resolve({ stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" })
    })
  })
}

function findOllamaPath(): string | undefined {
  if (process.platform === "win32") {
    for (const p of OLLAMA_WINDOWS_PATHS) {
      if (existsSync(p)) return p
    }
  }
  // On macOS/Linux, check common locations
  const unixPaths = ["/usr/local/bin/ollama", "/usr/bin/ollama", "/opt/homebrew/bin/ollama"]
  for (const p of unixPaths) {
    if (existsSync(p)) return p
  }
  return undefined
}

async function isOllamaOnPath(): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync(process.platform === "win32" ? "where" : "which", ["ollama"])
    const resolved = stdout.trim().split(/\r?\n/)[0]
    if (resolved && existsSync(resolved)) return resolved
  } catch {
    // not on PATH
  }
  return undefined
}

async function isOllamaRunning(ollamaCmd: string): Promise<boolean> {
  try {
    await execAsync(ollamaCmd, ["list"])
    return true
  } catch {
    // Could also check the HTTP endpoint as a fallback
    try {
      const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) })
      return res.ok
    } catch {
      return false
    }
  }
}

async function isModelPulled(ollamaCmd: string, model: string): Promise<boolean> {
  // Try via CLI first
  try {
    const { stdout } = await execAsync(ollamaCmd, ["list"])
    const baseName = model.includes(":") ? model.split(":")[0]! : model
    return stdout.split(/\r?\n/).some((line) => {
      const lower = line.toLowerCase()
      return lower.includes(model.toLowerCase()) || lower.includes(baseName.toLowerCase())
    })
  } catch {
    // Fallback to HTTP API
    try {
      const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return false
      const data = (await res.json()) as { models?: Array<{ name: string }> }
      return (data.models ?? []).some((m) => m.name.toLowerCase().includes(model.toLowerCase()))
    } catch {
      return false
    }
  }
}

function configFilePath(): string {
  return path.join(os.homedir(), ".config", "opencode", "opencode.jsonc")
}

async function configExists(): Promise<boolean> {
  try {
    await readFile(configFilePath(), "utf-8")
    return true
  } catch {
    return false
  }
}

export async function detectFirstLaunchStatus(model?: string): Promise<FirstLaunchStatus> {
  const targetModel = model ?? DEFAULT_MODEL

  // Resolve ollama binary: PATH first, then known install paths
  const pathResult = await isOllamaOnPath()
  const ollamaPath = pathResult ?? findOllamaPath()
  const ollamaInstalled = ollamaPath !== undefined

  let ollamaRunning = false
  let modelReady = false

  if (ollamaInstalled) {
    const cmd = ollamaPath!
    ollamaRunning = await isOllamaRunning(cmd)
    if (ollamaRunning) {
      modelReady = await isModelPulled(cmd, targetModel)
    }
  }

  return {
    ollamaInstalled,
    ollamaRunning,
    modelReady,
    modelName: targetModel,
    ollamaPath,
    configExists: await configExists(),
  }
}

export { DEFAULT_MODEL, configFilePath }
