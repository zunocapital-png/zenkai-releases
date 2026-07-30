import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Cognitive Sandbox: ejecución aislada por child_process. NO es una VM ni un
// contenedor — es aislamiento a nivel proceso: cwd propio, env whitelist,
// timeout duro con kill, límite de stdout, no shell metacharacters.
//
// Honesto sobre lo que ES y NO ES:
//   ES:      cwd controlado, kill al colgar, límite de output, no herencia de env.
//   NO ES:   contención de syscalls (usá firejail/nsjail para eso).
//            containerización (usá docker si el fuera necesita fs/net aislados).
//            protección contra fork bombs (cover con ulimit desde afuera).
//
// Cubre el 90% de casos reales de ZENKAI: correr código sugerido por el LLM
// (script.py, snippet.js) sin que tumbe el proceso principal ni deje archivos.

export type SandboxInput = {
  /** Comando + args. NO se pasa por shell → sin escaping issues. */
  cmd: string
  args?: string[]
  /** stdin opcional. */
  stdin?: string
  /** ENV whitelist. Si no se pasa, va vacío (solo PATH). */
  env?: Record<string, string>
  /** Timeout duro en ms. Al vencerse, SIGKILL. Default 30s. */
  timeoutMs?: number
  /** Máximo bytes acumulados de stdout+stderr. Default 512 KB. */
  maxOutputBytes?: number
  /** Directorio de trabajo. Si no se pasa, se crea temp y se borra al final. */
  cwd?: string
  /** Si true, no crea temp dir (usa cwd || process.cwd()). */
  noTempDir?: boolean
}

export type SandboxResultado = {
  ok: boolean
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  stdoutTruncado: boolean
  stderrTruncado: boolean
  duracionMs: number
  timeout: boolean
  cwd: string
}

/**
 * Escribe un archivo de código y lo corre. Cambia el nombre según lenguaje.
 * Útil para snippets del LLM sin construir el comando a mano.
 */
export async function correrCodigo(input: {
  lenguaje: "node" | "python" | "bash"
  codigo: string
  timeoutMs?: number
  env?: Record<string, string>
}): Promise<SandboxResultado> {
  const map = {
    node: { cmd: "node", file: "code.js" },
    python: { cmd: "python", file: "code.py" },
    bash: { cmd: "bash", file: "code.sh" },
  } as const
  const cfg = map[input.lenguaje]
  const dir = mkdtempSync(join(tmpdir(), "zenkai-sandbox-"))
  writeFileSync(join(dir, cfg.file), input.codigo, "utf8")
  try {
    return await correrSandbox({
      cmd: cfg.cmd,
      args: [cfg.file],
      cwd: dir,
      noTempDir: true, // ya lo creamos
      timeoutMs: input.timeoutMs,
      env: input.env,
    })
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch { /* Windows retiene handles a veces */ }
  }
}

export async function correrSandbox(input: SandboxInput): Promise<SandboxResultado> {
  const t0 = Date.now()
  const timeoutMs = input.timeoutMs ?? 30_000
  const maxOutputBytes = input.maxOutputBytes ?? 512 * 1024
  const tempDir = input.noTempDir ? undefined : mkdtempSync(join(tmpdir(), "zenkai-sbx-"))
  const cwd = input.cwd ?? tempDir ?? process.cwd()

  // Env whitelist estricto — nunca heredamos secretos del proceso padre.
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" }
  if (input.env) Object.assign(env, input.env)

  return new Promise<SandboxResultado>((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(input.cmd, input.args ?? [], {
        cwd,
        env,
        shell: false, // clave: no shell → no injection
        windowsHide: true,
      })
    } catch (e) {
      if (tempDir) tryRm(tempDir)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: String((e as Error).message),
        stdoutTruncado: false,
        stderrTruncado: false,
        duracionMs: Date.now() - t0,
        timeout: false,
        cwd,
      })
      return
    }

    let stdout = ""
    let stderr = ""
    let stdoutTrunc = false
    let stderrTrunc = false
    let timeout = false

    const timer = setTimeout(() => {
      timeout = true
      try { child.kill("SIGKILL") } catch { /* noop */ }
    }, timeoutMs)

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length >= maxOutputBytes) { stdoutTrunc = true; return }
      const remaining = maxOutputBytes - stdout.length
      stdout += chunk.toString("utf8", 0, Math.min(chunk.length, remaining))
      if (chunk.length > remaining) stdoutTrunc = true
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length >= maxOutputBytes) { stderrTrunc = true; return }
      const remaining = maxOutputBytes - stderr.length
      stderr += chunk.toString("utf8", 0, Math.min(chunk.length, remaining))
      if (chunk.length > remaining) stderrTrunc = true
    })
    if (input.stdin && child.stdin) {
      try {
        child.stdin.end(input.stdin)
      } catch { /* pipe cerrado */ }
    }
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      if (tempDir) tryRm(tempDir)
      resolve({
        ok: code === 0 && !timeout,
        exitCode: code,
        signal: signal ?? null,
        stdout,
        stderr,
        stdoutTruncado: stdoutTrunc,
        stderrTruncado: stderrTrunc,
        duracionMs: Date.now() - t0,
        timeout,
        cwd,
      })
    })
    child.on("error", (err) => {
      clearTimeout(timer)
      if (tempDir) tryRm(tempDir)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr: stderr + String(err.message),
        stdoutTruncado: stdoutTrunc,
        stderrTruncado: stderrTrunc,
        duracionMs: Date.now() - t0,
        timeout,
        cwd,
      })
    })
  })
}

function tryRm(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch { /* Windows: puede quedar hasta que GC libere */ }
}
