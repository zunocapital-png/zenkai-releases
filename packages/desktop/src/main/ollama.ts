// Garantiza que Ollama (modelos locales) esté SIEMPRE listo, sin que el usuario abra nada:
//   1. Si el server responde en :11434 -> ya está, nada que hacer.
//   2. Si el binario existe pero está apagado -> lo prende (`ollama serve`).
//   3. Si no está instalado y hay winget -> lo instala en segundo plano y luego lo prende.
//   4. Si nada de eso se puede -> se omite en silencio (quedan los modelos de nube).
// Nunca bloquea el arranque de la app (igual patrón que team-keys / omniroute).

import { spawn, type ChildProcess } from "node:child_process"
import net from "node:net"
import { existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"

const OLLAMA_PORT = 11434
const isWin = process.platform === "win32"

let child: ChildProcess | undefined

function portInUse(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (r: boolean) => {
      socket.destroy()
      resolve(r)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
    socket.connect(port, "127.0.0.1")
  })
}

// Ubicaciones típicas del binario de Ollama por plataforma.
function findOllamaBinary(): string | undefined {
  const candidates: string[] = []
  if (isWin) {
    const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local")
    candidates.push(path.join(local, "Programs", "Ollama", "ollama.exe"))
    if (process.env.PROGRAMFILES) candidates.push(path.join(process.env.PROGRAMFILES, "Ollama", "ollama.exe"))
  } else {
    candidates.push("/usr/local/bin/ollama", "/usr/bin/ollama", "/opt/homebrew/bin/ollama")
  }
  return candidates.find((p) => existsSync(p))
}

function run(cmd: string, args: string[], detached = false): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, { stdio: "ignore", shell: isWin, detached })
      if (detached) {
        proc.unref()
        resolve(true)
        return
      }
      proc.once("error", () => resolve(false))
      proc.once("exit", (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

function startServer(bin: string): void {
  try {
    child = spawn(bin, ["serve"], { stdio: "ignore", shell: isWin, detached: true })
    child.unref()
    child.once("error", () => {})
  } catch {
    /* noop */
  }
}

async function waitForPort(tries = 20, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await portInUse(OLLAMA_PORT)) return true
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

export type OllamaStatus = "running" | "started" | "installing" | "skipped"

export async function ensureOllama(): Promise<OllamaStatus> {
  try {
    if (await portInUse(OLLAMA_PORT)) return "running"

    const bin = findOllamaBinary()
    if (bin) {
      startServer(bin)
      return (await waitForPort()) ? "started" : "skipped"
    }

    // No instalado: intentar instalar con winget (Windows) en segundo plano, luego prender.
    if (isWin) {
      void (async () => {
        const ok = await run("winget", [
          "install",
          "--id",
          "Ollama.Ollama",
          "-e",
          "--silent",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ])
        if (ok) {
          const b = findOllamaBinary()
          if (b) startServer(b)
        }
      })()
      return "installing"
    }

    return "skipped"
  } catch {
    return "skipped"
  }
}

export function stopOllama(): void {
  // No matamos Ollama al cerrar: puede ser usado por otras apps del usuario.
  child = undefined
}
