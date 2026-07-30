// Analiza el hardware de la PC para recomendar qué modelos locales entran.
// RAM y CPU vienen de `os`; la GPU/VRAM se intenta por nvidia-smi (NVIDIA) y, si no,
// por WMIC/PowerShell (nombre de GPU, sin VRAM). Todo best-effort: si algo falla,
// devuelve lo que pudo, nunca tira.

import os from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type HardwareInfo = {
  ramGB: number
  freeRamGB: number
  cpuModel: string
  cpuCores: number
  gpuName: string | null
  vramGB: number | null
}

async function detectNvidia(): Promise<{ name: string; vramGB: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
      { timeout: 4000 },
    )
    const line = stdout.trim().split(/\r?\n/)[0] ?? ""
    const [name, vramMB] = line.split(",").map((s) => s.trim())
    const mb = parseInt(vramMB ?? "0", 10)
    if (name && mb > 0) return { name, vramGB: Math.round((mb / 1024) * 10) / 10 }
  } catch {
    /* sin NVIDIA o sin nvidia-smi */
  }
  return null
}

async function detectGpuName(): Promise<string | null> {
  if (process.platform !== "win32") return null
  // WMIC primero (más rápido); si no está, PowerShell CIM.
  try {
    const { stdout } = await execFileAsync("wmic", ["path", "win32_VideoController", "get", "name"], { timeout: 4000 })
    const names = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== "name")
    if (names.length) return names[0]
  } catch {
    /* wmic no disponible (Win11 lo deprecó en algunas ediciones) */
  }
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name"],
      { timeout: 6000 },
    )
    const name = stdout.trim().split(/\r?\n/)[0]?.trim()
    if (name) return name
  } catch {
    /* noop */
  }
  return null
}

export async function analyzeHardware(): Promise<HardwareInfo> {
  const cpus = os.cpus()
  const ramGB = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
  const freeRamGB = Math.round((os.freemem() / 1024 ** 3) * 10) / 10
  const nvidia = await detectNvidia()
  const gpuName = nvidia?.name ?? (await detectGpuName())
  return {
    ramGB,
    freeRamGB,
    cpuModel: cpus[0]?.model?.trim() ?? "Desconocido",
    cpuCores: cpus.length,
    gpuName: gpuName ?? null,
    vramGB: nvidia?.vramGB ?? null,
  }
}
