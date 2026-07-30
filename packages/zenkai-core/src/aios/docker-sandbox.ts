import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { correrCodigo, correrSandbox } from "./sandbox"
import type { SandboxResultado } from "./sandbox"

// Docker sandbox: ejecución containerizada opcional.
// Estrategia: intenta docker; si no está disponible, hace fallback graceful
// al child_process sandbox. Ambos devuelven el mismo shape SandboxResultado.
//
// Trade-offs honestos:
//   Docker    → aislamiento real (net, fs, kernel), pero requiere Docker Desktop.
//   Child     → aislamiento a nivel proceso (env whitelist, timeout, no shell).
//
// La UI elige: "sandbox seguro" (Docker) vs "sandbox rápido" (child).
// Si el usuario elige seguro y no hay Docker, avisamos ANTES de correr.

export type DockerSandboxOptions = {
  lenguaje: "node" | "python" | "bash"
  codigo: string
  timeoutMs?: number
  /** Imagen Docker override. Default: node:20-alpine / python:3.12-slim / alpine:3.19. */
  image?: string
  /** Límite de memoria (ej. "512m"). Default sin límite. */
  memoryLimit?: string
  /** Límite de CPUs (ej. "1.5"). Default sin límite. */
  cpuLimit?: string
  /** True para desactivar red completamente. Default true — más seguro. */
  sinRed?: boolean
  /** Env vars a exponer dentro del container. */
  env?: Record<string, string>
}

const IMAGES_DEFAULT = {
  node: "node:20-alpine",
  python: "python:3.12-slim",
  bash: "alpine:3.19",
} as const

const RUN_CMD = {
  node: (file: string) => ["node", `/work/${file}`],
  python: (file: string) => ["python", `/work/${file}`],
  bash: (file: string) => ["sh", `/work/${file}`],
} as const

const FILE_NAME = { node: "code.js", python: "code.py", bash: "code.sh" } as const

/** Detecta docker disponible y funcionando. */
export async function detectarDocker(): Promise<{ disponible: boolean; version?: string; motivo?: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn("docker", ["version", "--format", "{{.Server.Version}}"], { windowsHide: true })
    } catch {
      resolve({ disponible: false, motivo: "docker CLI no encontrado" })
      return
    }
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch { /* noop */ } }, 3000)
    child.stdout?.on("data", (c: Buffer) => { stdout += c.toString("utf8") })
    child.stderr?.on("data", (c: Buffer) => { stderr += c.toString("utf8") })
    child.on("error", () => {
      clearTimeout(timer)
      resolve({ disponible: false, motivo: "no se pudo lanzar docker" })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) return resolve({ disponible: false, motivo: stderr.trim() || `exit ${code}` })
      resolve({ disponible: true, version: stdout.trim() })
    })
  })
}

/**
 * Corre código en Docker si está disponible; si no, fallback a child_process.
 * Devuelve el mismo shape SandboxResultado + campo `backendUsado`.
 */
export async function correrEnDocker(
  input: DockerSandboxOptions,
): Promise<SandboxResultado & { backendUsado: "docker" | "child_process" }> {
  const docker = await detectarDocker()
  if (!docker.disponible) {
    // Fallback graceful — el usuario recibe resultado igual pero sin container.
    const r = await correrCodigo({ lenguaje: input.lenguaje, codigo: input.codigo, timeoutMs: input.timeoutMs, env: input.env })
    return { ...r, backendUsado: "child_process" }
  }

  const image = input.image ?? IMAGES_DEFAULT[input.lenguaje]
  const fileName = FILE_NAME[input.lenguaje]
  const dir = mkdtempSync(join(tmpdir(), "zenkai-docker-"))
  writeFileSync(join(dir, fileName), input.codigo, "utf8")

  const cmd = RUN_CMD[input.lenguaje](fileName)
  const args = ["run", "--rm"]
  args.push("-v", `${dir}:/work:ro`) // read-only mount
  args.push("-w", "/work")
  if (input.sinRed ?? true) args.push("--network=none")
  if (input.memoryLimit) args.push("-m", input.memoryLimit)
  if (input.cpuLimit) args.push("--cpus", input.cpuLimit)
  args.push("--user", "nobody") // sin root en el container
  args.push("--cap-drop=ALL")   // sin capabilities Linux
  args.push("--security-opt", "no-new-privileges:true")
  for (const [k, v] of Object.entries(input.env ?? {})) args.push("-e", `${k}=${v}`)
  args.push(image, ...cmd)

  try {
    const r = await correrSandbox({
      cmd: "docker",
      args,
      timeoutMs: input.timeoutMs ?? 60_000,
      noTempDir: true, // usamos el nuestro
    })
    return { ...r, backendUsado: "docker" }
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* noop */ }
  }
}
