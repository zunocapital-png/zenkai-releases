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
    model: "omniroute/auto",
    provider: {
      // Auto-relevo: enruta solo y engancha el siguiente si uno se agota. Sin key, sin configurar.
      omniroute: {
        npm: "@ai-sdk/openai-compatible",
        name: "ZENKAI Auto (relevo automático)",
        options: {
          baseURL: "http://localhost:20128/v1",
        },
        models: {
          auto: { name: "[CODIGO] Auto — el mejor disponible" },
          "auto/coding": { name: "[CODIGO] Auto Código" },
          "auto/smart": { name: "[RAZON] Auto Razonamiento" },
          "auto/fast": { name: "[CHAT] Auto Rápido" },
        },
      },
      ollama: {
        npm: "@ai-sdk/openai-compatible",
        name: "Ollama (local)",
        options: {
          baseURL: "http://localhost:11434/v1",
        },
        models: {
          // Solo modelos que entran en ~8GB de VRAM (seguros para casi todas las placas).
          // qwen3:14b y qwen3:30b-a3b se omiten: crashean Ollama en 8GB (0xc0000409).
          "qwen2.5-coder:7b": { name: "[CODIGO] Qwen2.5 Coder 7B (recomendado)" },
          "qwen3:8b": { name: "[CODIGO] Qwen3 8B Rapido" },
          "qwen2.5:7b": { name: "[CHAT] Qwen2.5 7B" },
        },
      },
      // Nube con modelos GRATIS o casi gratis. Conecta tu API key en "Conectar proveedor".
      openrouter: {
        name: "OpenRouter (nube · modelos GRATIS)",
        models: {
          "deepseek/deepseek-chat-v3-0324:free": { name: "[CODIGO] DeepSeek V3 Free" },
          "deepseek/deepseek-r1:free": { name: "[RAZON] DeepSeek R1 Free" },
          "qwen/qwen-2.5-coder-32b-instruct:free": { name: "[CODIGO] Qwen2.5 Coder 32B Free" },
          "qwen/qwq-32b:free": { name: "[RAZON] QwQ 32B Free" },
          "meta-llama/llama-3.3-70b-instruct:free": { name: "[CHAT] Llama 3.3 70B Free" },
          "google/gemini-2.0-flash-exp:free": { name: "[CHAT] Gemini 2.0 Flash Free" },
        },
      },
      // NVIDIA NIM — modelos grandes GRATIS en la nube (405B, Nemotron 253B). Key gratis en build.nvidia.com
      nvidia: {
        npm: "@ai-sdk/openai-compatible",
        name: "NVIDIA NIM (nube · grandes GRATIS)",
        options: {
          baseURL: "https://integrate.api.nvidia.com/v1",
        },
        models: {
          "meta/llama-3.1-405b-instruct": { name: "[CODIGO] Llama 3.1 405B NVIDIA" },
          "nvidia/llama-3.1-nemotron-ultra-253b-v1": { name: "[RAZON] Nemotron Ultra 253B NVIDIA" },
          "meta/llama-3.3-70b-instruct": { name: "[CODIGO] Llama 3.3 70B NVIDIA" },
          "qwen/qwen2.5-coder-32b-instruct": { name: "[CODIGO] Qwen2.5 Coder 32B NVIDIA" },
          "deepseek-ai/deepseek-r1": { name: "[RAZON] DeepSeek R1 NVIDIA" },
          "nvidia/llama-3.1-nemotron-70b-instruct": { name: "[CHAT] Nemotron 70B NVIDIA" },
        },
      },
      deepseek: {
        name: "DeepSeek (nube · barato, potente)",
        models: {
          "deepseek-chat": { name: "[CODIGO] DeepSeek V3" },
          "deepseek-reasoner": { name: "[RAZON] DeepSeek R1" },
        },
      },
      google: {
        name: "Google Gemini (nube · tier gratis)",
        models: {
          "gemini-2.0-flash": { name: "[CHAT] Gemini 2.0 Flash" },
        },
      },
      groq: {
        name: "Groq (nube · gratis, ultrarrápido)",
        models: {
          "llama-3.3-70b-versatile": { name: "[CHAT] Llama 3.3 70B Groq" },
          "qwen-2.5-coder-32b": { name: "[CODIGO] Qwen2.5 Coder 32B Groq" },
          "deepseek-r1-distill-llama-70b": { name: "[RAZON] DeepSeek R1 Distill 70B Groq" },
        },
      },
      cerebras: {
        name: "Cerebras (nube · gratis, el más rápido)",
        models: {
          "qwen-2.5-coder-32b": { name: "[CODIGO] Qwen2.5 Coder 32B Cerebras" },
          "llama-3.3-70b": { name: "[CHAT] Llama 3.3 70B Cerebras" },
        },
      },
    },
    mcp: {
      // Docs siempre actualizadas de librerías/frameworks (online, sin key).
      context7: {
        type: "local",
        command: ["npx", "-y", "@upstash/context7-mcp"],
        enabled: true,
      },
      // Razonamiento paso a paso estructurado para tareas complejas (offline, sin key). Oficial MCP.
      "sequential-thinking": {
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
        enabled: true,
      },
      // Memoria persistente tipo knowledge-graph entre sesiones (offline, sin key). Oficial MCP.
      memory: {
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
        enabled: true,
      },
      // Leer/escribir archivos con acceso acotado a un directorio (offline, sin key). Oficial MCP.
      // El último arg es el directorio permitido; por defecto el HOME del usuario.
      // Cambialo por la ruta de tu proyecto si querés limitar el alcance.
      filesystem: {
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", os.homedir()],
        enabled: true,
      },
      // Traer contenido de URLs (HTML/JSON/Markdown/texto) desde la web (online, sin key).
      // Paquete de comunidad: el oficial @modelcontextprotocol/server-fetch es solo Python (no npm).
      fetch: {
        type: "local",
        command: ["npx", "-y", "@tokenizin/mcp-npx-fetch"],
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
        return "qwen2.5-coder:7b" // < 10GB VRAM: ~4.7GB, el más seguro que entra en 8GB
      }
      if (vramMB >= 10_000 && vramMB < 16_000) {
        return "qwen3:14b" // 10-16GB VRAM: cabe cómodo
      }
    } catch {
      // nvidia-smi not available, check total system RAM as rough proxy
    }
  }

  const totalRAM = os.totalmem()
  const totalGB = totalRAM / (1024 ** 3)
  if (totalGB < 12) {
    return "qwen2.5-coder:7b"
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
