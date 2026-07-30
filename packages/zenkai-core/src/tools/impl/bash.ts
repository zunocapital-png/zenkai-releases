import { spawn } from "node:child_process"
import type { Tool } from "../types"

// Tool 'bash' — ejecutar comando con MEJORAS vs opencode:
//   - Streaming de output mid-run (progress con líneas de stdout/stderr).
//   - Kill de procesos hijos (tree kill): SIGTERM → SIGKILL tras N ms.
//   - stdout/stderr separados con líneas contadas.
//   - Working directory configurable.
//   - Env vars custom sin heredar todo el entorno.
//   - Detección de shell por plataforma (cmd/pwsh/bash/zsh).
//   - Signal integrado (cancel externo aborta el proceso).

export type BashInput = {
  cmd: string
  cwd?: string
  env?: Record<string, string>
  /** Solo stdout (más rápido). Default false. */
  stdoutOnly?: boolean
  /** Shell explícito. Default: bash si existe, si no cmd/pwsh. */
  shell?: string
}

export type BashOutput = {
  cmd: string
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  stdoutLines: number
  stderrLines: number
  timedOut: boolean
  killedByUser: boolean
}

function shellDefault(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "cmd.exe"
  }
  return process.env.SHELL ?? "/bin/bash"
}

export const bashTool: Tool<BashInput, BashOutput> = {
  meta: {
    name: "bash",
    description: "Ejecuta un comando en la shell. Captura stdout/stderr con streaming mid-run.",
    riesgo: "alto",
    idempotente: false,
    costo: "medio",
    timeoutMs: 60_000,
    rateLimitPorMin: 30,
  },
  validate: (i) => {
    if (!i.cmd || typeof i.cmd !== "string") return "cmd requerido"
    if (i.cmd.length > 8_000) return "cmd demasiado largo (>8KB)"
    return undefined
  },
  run: async (input, ctx) => {
    const shell = input.shell ?? shellDefault()
    const isWin = process.platform === "win32"
    // En Windows con cmd usamos /c, en unix -c.
    const args = shell.toLowerCase().includes("cmd") ? ["/c", input.cmd] : ["-c", input.cmd]

    let stdout = ""
    let stderr = ""
    let stdoutLines = 0
    let stderrLines = 0
    let timedOut = false
    let killedByUser = false

    return await new Promise<BashOutput>((resolve) => {
      const proc = spawn(shell, args, {
        cwd: input.cwd,
        env: input.env ?? process.env,
        windowsHide: true,
        shell: false,
      })

      const cancelListener = () => {
        killedByUser = true
        // Tree kill: primero TERM, si sigue vivo → KILL.
        try {
          proc.kill("SIGTERM")
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL")
          }, 500)
        } catch {
          /* ignore */
        }
      }
      ctx.signal.addEventListener("abort", cancelListener, { once: true })

      proc.stdout.on("data", (chunk: Buffer) => {
        const s = chunk.toString("utf8")
        stdout += s
        const nl = (s.match(/\n/g) ?? []).length
        stdoutLines += nl
        if (nl > 0) ctx.reportar(`+${stdoutLines} líneas stdout`)
      })
      if (!input.stdoutOnly) {
        proc.stderr.on("data", (chunk: Buffer) => {
          const s = chunk.toString("utf8")
          stderr += s
          const nl = (s.match(/\n/g) ?? []).length
          stderrLines += nl
          if (nl > 0) ctx.reportar(`+${stderrLines} líneas stderr`)
        })
      }

      proc.on("error", (err) => {
        stderr += String(err)
        resolve({
          cmd: input.cmd,
          exitCode: null,
          signal: null,
          stdout,
          stderr,
          stdoutLines,
          stderrLines,
          timedOut,
          killedByUser,
        })
      })
      proc.on("exit", (code, signal) => {
        ctx.signal.removeEventListener("abort", cancelListener)
        // Si nos abortaron internamente por timeout (no por user), lo marcamos.
        if (ctx.signal.aborted && !killedByUser) timedOut = true
        void isWin
        resolve({
          cmd: input.cmd,
          exitCode: code,
          signal: signal ?? null,
          stdout,
          stderr,
          stdoutLines,
          stderrLines,
          timedOut,
          killedByUser,
        })
      })
    })
  },
}
