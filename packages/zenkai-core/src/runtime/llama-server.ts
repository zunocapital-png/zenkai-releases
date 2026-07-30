import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { platform, arch } from "node:os"
import { dirname, join } from "node:path"

// Runtime propio ZENKAI: envuelve llama-server (binario oficial de llama.cpp)
// para servir modelos GGUF con API OpenAI-compat SIN depender de Ollama.
//
// Cómo se integra:
//   1. El usuario instala llama-server (o lo empaquetamos con la app).
//   2. `LlamaServer.start({modelPath, port})` lo lanza como child_process.
//   3. Sirve /v1/chat/completions en el puerto elegido (OpenAI-compat nativo).
//   4. `stop()` lo apaga limpio.
//
// Diseño honesto:
//   - NO reimplementamos llama.cpp (sería inviable y contraproducente).
//   - USAMOS su binario oficial (llama-server) que ya tiene GPU accel, quant, etc.
//   - Le damos la misma UX que Ollama: elegí modelo → arranca → chat funciona.
//
// Detección del binario:
//   1. Env var ZENKAI_LLAMA_SERVER (path explícito).
//   2. Path relativo al ejecutable de la app: bin/llama-server[.exe]
//   3. PATH global (usuario lo instaló manual con brew/apt/scoop).
//   Si nada matchea, `detectarBinario()` devuelve undefined y la UI muestra "cómo instalar".

export type LlamaServerOptions = {
  /** Path al archivo .gguf del modelo. */
  modelPath: string
  /** Puerto para el server. Default 20130. */
  port?: number
  /** Nombre del binario. Default "llama-server". */
  binaryPath?: string
  /** Args extra a pasar. Ej. ["--ctx-size", "8192", "--n-gpu-layers", "99"]. */
  extraArgs?: string[]
  /** Callback opcional de stdout/stderr (para mostrar en UI). */
  onLog?: (line: string, tipo: "stdout" | "stderr") => void
}

export type LlamaServerStatus = "stopped" | "starting" | "ready" | "error"

export class LlamaServer {
  private child: ChildProcess | undefined
  private status: LlamaServerStatus = "stopped"
  private opts: LlamaServerOptions
  private lastError: string | undefined

  constructor(opts: LlamaServerOptions) {
    this.opts = opts
  }

  getStatus(): LlamaServerStatus { return this.status }
  getLastError(): string | undefined { return this.lastError }
  getPort(): number { return this.opts.port ?? 20130 }

  /** Levanta el server. Resuelve cuando el health-check responde 200. */
  async start(timeoutMs = 60_000): Promise<void> {
    if (this.status === "ready") return
    if (this.status === "starting") throw new Error("ya está arrancando")

    if (!existsSync(this.opts.modelPath)) {
      throw new Error(`modelo GGUF no encontrado: ${this.opts.modelPath}`)
    }
    const binary = this.opts.binaryPath ?? "llama-server"
    const port = this.getPort()
    const args = [
      "-m", this.opts.modelPath,
      "--port", String(port),
      "--host", "127.0.0.1",
      ...(this.opts.extraArgs ?? []),
    ]

    this.status = "starting"
    this.lastError = undefined

    try {
      this.child = spawn(binary, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      })
    } catch (e) {
      this.status = "error"
      this.lastError = `no se pudo lanzar ${binary}: ${(e as Error).message}`
      throw new Error(this.lastError)
    }

    this.child.stdout?.on("data", (buf: Buffer) => {
      const line = buf.toString("utf8")
      this.opts.onLog?.(line, "stdout")
    })
    this.child.stderr?.on("data", (buf: Buffer) => {
      const line = buf.toString("utf8")
      this.opts.onLog?.(line, "stderr")
    })
    this.child.on("exit", (code) => {
      if (this.status !== "stopped") {
        this.status = "error"
        this.lastError = `proceso salió con code=${code}`
      }
    })

    // Poll de readiness sobre /health del server.
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if ((this.status as LlamaServerStatus) === "error") throw new Error(this.lastError ?? "arranque falló")
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) })
        if (r.ok) {
          this.status = "ready"
          return
        }
      } catch {
        /* aún arrancando */
      }
      await new Promise((res) => setTimeout(res, 300))
    }

    this.stop()
    this.status = "error"
    this.lastError = `timeout de arranque ${timeoutMs}ms`
    throw new Error(this.lastError)
  }

  /** Apaga el server (SIGTERM, luego SIGKILL si no responde en 3s). */
  stop(): void {
    if (!this.child || this.status === "stopped") {
      this.status = "stopped"
      return
    }
    const child = this.child
    try { child.kill("SIGTERM") } catch { /* noop */ }
    setTimeout(() => {
      try {
        if (child.exitCode === null) child.kill("SIGKILL")
      } catch { /* noop */ }
    }, 3_000).unref()
    this.child = undefined
    this.status = "stopped"
  }
}

/** Nombre del binario correcto según plataforma (Windows agrega .exe). */
export function nombreBinario(): string {
  return platform() === "win32" ? "llama-server.exe" : "llama-server"
}

/** Detecta el binario en orden: env var → bundled → PATH. */
export function detectarBinario(bundledDir?: string): string | undefined {
  const nombre = nombreBinario()
  if (process.env.ZENKAI_LLAMA_SERVER && existsSync(process.env.ZENKAI_LLAMA_SERVER)) {
    return process.env.ZENKAI_LLAMA_SERVER
  }
  if (bundledDir) {
    const p = join(bundledDir, nombre)
    if (existsSync(p)) return p
  }
  // Chequeo en PATH — hacemos which manual porque `which` no es cross-platform.
  const path = process.env.PATH ?? ""
  const sep = platform() === "win32" ? ";" : ":"
  for (const dir of path.split(sep)) {
    const p = join(dir, nombre)
    try {
      if (existsSync(p) && statSync(p).isFile()) return p
    } catch { /* skip */ }
  }
  return undefined
}

/** Info de plataforma para elegir el asset correcto al descargar llama.cpp. */
export function plataformaAsset(): string {
  const p = platform()
  const a = arch()
  if (p === "win32") return a === "x64" ? "win-x64" : "win-arm64"
  if (p === "darwin") return a === "arm64" ? "macos-arm64" : "macos-x64"
  if (p === "linux") return a === "x64" ? "linux-x64" : "linux-arm64"
  return `${p}-${a}`
}

/** Crea directorios si no existen — util para bundle de binarios/modelos. */
export function ensureDir(p: string): void {
  const dir = dirname(p)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}
