// OmniRoute: gateway local de auto-relevo (failover) entre proveedores de IA.
// Corre como sidecar en localhost:20128 y expone una API OpenAI-compatible con el
// modelo "auto" (y variantes auto/coding, auto/fast, auto/smart...). Si un modelo se
// queda sin tokens o falla, OmniRoute engancha el siguiente solo, sin cambiar nada a mano.
//
// Estrategia (nunca bloquea el arranque, como team-keys):
//   1. Si ya hay algo respondiendo en :20128 -> no hacemos nada (ya está corriendo).
//   2. Si el binario `omniroute` está instalado -> lo lanzamos como hijo administrado.
//   3. Si no está pero hay npm -> intentamos `npm i -g omniroute` en segundo plano y luego lo lanzamos.
//   4. Si no hay npm/Node -> se omite en silencio (el usuario igual tiene los otros modelos gratis).

import { spawn, type ChildProcess } from "node:child_process"
import net from "node:net"

export const OMNIROUTE_PORT = 20128
export const OMNIROUTE_BASE_URL = `http://localhost:${OMNIROUTE_PORT}/v1`

const isWin = process.platform === "win32"
// npm instala los binarios globales como .cmd en Windows.
const bin = (name: string) => (isWin ? `${name}.cmd` : name)

let child: ChildProcess | undefined

function portInUse(port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (result: boolean) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
    socket.connect(port, "127.0.0.1")
  })
}

// Lanza un comando y resuelve true si termina con código 0. No hereda stdio (silencioso).
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

function hasCommand(cmd: string): Promise<boolean> {
  // `omniroute --version` / `npm --version`: si el binario no existe, spawn emite "error".
  return run(cmd, ["--version"])
}

function startServer(): ChildProcess | undefined {
  try {
    const proc = spawn(bin("omniroute"), [], { stdio: "ignore", shell: isWin, detached: false })
    proc.once("error", () => {})
    return proc
  } catch {
    return undefined
  }
}

// Espera hasta `tries` intentos a que el puerto responda.
async function waitForPort(tries = 20, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await portInUse(OMNIROUTE_PORT)) return true
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

export type OmniRouteStatus = "already-running" | "started" | "installing" | "skipped"

export async function startOmniRoute(): Promise<OmniRouteStatus> {
  try {
    if (await portInUse(OMNIROUTE_PORT)) return "already-running"

    if (await hasCommand(bin("omniroute"))) {
      child = startServer()
      return (await waitForPort()) ? "started" : "skipped"
    }

    // No instalado: si hay npm, lo instalamos en segundo plano y lo lanzamos cuando termine.
    if (await hasCommand(bin("npm"))) {
      void (async () => {
        const ok = await run(bin("npm"), ["install", "-g", "omniroute"])
        if (ok) child = startServer()
      })()
      return "installing"
    }

    return "skipped" // sin Node/npm -> se omite, arranque normal
  } catch {
    return "skipped"
  }
}

export function stopOmniRoute(): void {
  try {
    child?.kill()
  } catch {
    /* noop */
  }
  child = undefined
}
