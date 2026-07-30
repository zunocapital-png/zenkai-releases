import { spawn } from "node:child_process"

// Detección de GPU disponible para fine-tuning.
// Es honesta: sólo devuelve `disponible=true` si un backend real responde.
// No mentimos "sí hay GPU" a partir de un env var o algo optimista.
//
// Estrategia por plataforma:
//   - CUDA:   nvidia-smi (Linux, Windows)
//   - ROCm:   rocm-smi (Linux AMD)
//   - Metal:  system_profiler SPHardwareDataType | grep Apple (macOS)
//   - CPU:    fallback siempre disponible pero muy lento (no recomendado)

export type BackendGpu = "cuda" | "rocm" | "metal" | "cpu"
export type DetalleGpu = {
  backend: BackendGpu
  disponible: boolean
  nombre?: string
  vramMB?: number
  driver?: string
  mensaje?: string
}

export async function detectarGpu(): Promise<DetalleGpu[]> {
  const resultados: DetalleGpu[] = []

  // CUDA
  const cuda = await ejecutar("nvidia-smi", ["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"])
  if (cuda.ok && cuda.stdout.trim()) {
    for (const line of cuda.stdout.trim().split("\n")) {
      const [nombre, vram, driver] = line.split(",").map((s) => s.trim())
      resultados.push({
        backend: "cuda",
        disponible: true,
        nombre: nombre || "NVIDIA GPU",
        vramMB: vram ? Number(vram) : undefined,
        driver: driver || undefined,
      })
    }
  }

  // ROCm (AMD Linux)
  if (process.platform === "linux") {
    const rocm = await ejecutar("rocm-smi", ["--showproductname", "--showmeminfo", "vram", "--csv"])
    if (rocm.ok && rocm.stdout.trim() && !rocm.stdout.includes("ERROR")) {
      resultados.push({
        backend: "rocm",
        disponible: true,
        nombre: extraerNombre(rocm.stdout) ?? "AMD GPU",
      })
    }
  }

  // Metal (macOS Apple Silicon)
  if (process.platform === "darwin") {
    const prof = await ejecutar("system_profiler", ["SPHardwareDataType"])
    if (prof.ok && /Apple/i.test(prof.stdout)) {
      resultados.push({
        backend: "metal",
        disponible: true,
        nombre: extraerModeloApple(prof.stdout) ?? "Apple Silicon",
      })
    }
  }

  // CPU siempre presente como último recurso.
  resultados.push({
    backend: "cpu",
    disponible: true,
    mensaje: "training en CPU es MUY lento; no recomendado para LoRA >1B parámetros",
  })

  return resultados
}

/** Recomienda el mejor backend disponible priorizando GPU real. */
export function mejorBackend(detalles: DetalleGpu[]): DetalleGpu {
  const prioridad: BackendGpu[] = ["cuda", "rocm", "metal", "cpu"]
  for (const b of prioridad) {
    const hit = detalles.find((d) => d.backend === b && d.disponible)
    if (hit) return hit
  }
  return detalles[0]!
}

function extraerNombre(csv: string): string | undefined {
  const line = csv.split("\n").find((l) => l.includes("Card series") || l.includes("Marketing"))
  return line?.split(",")[1]?.trim()
}

function extraerModeloApple(text: string): string | undefined {
  const m = /Chip:\s+(.+)/.exec(text)
  return m?.[1]?.trim()
}

async function ejecutar(cmd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cmd, args, { windowsHide: true })
    } catch {
      resolve({ ok: false, stdout: "", stderr: "cmd inexistente" })
      return
    }
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL") } catch { /* noop */ }
    }, 5000)
    child.stdout?.on("data", (c: Buffer) => { stdout += c.toString("utf8") })
    child.stderr?.on("data", (c: Buffer) => { stderr += c.toString("utf8") })
    child.on("error", () => {
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, stdout, stderr })
    })
  })
}
