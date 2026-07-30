import { spawn } from "node:child_process"
import { totalmem, freemem, cpus } from "node:os"

// Monitor de hardware en vivo — RAM del sistema + VRAM de la GPU si hay.
// Corre en background emitiendo snapshots cada N segundos vía callback.
//
// Estrategia:
//   - RAM: node os.totalmem/freemem (0-dep).
//   - CPU: os.cpus() para core count + load estimado en Bun/Node.
//   - VRAM NVIDIA: nvidia-smi (única forma cross-platform reliable).
//   - VRAM Apple: system_profiler (Metal shared memory).
//   - VRAM AMD: rocm-smi (Linux).
//
// El monitor es SILENCIOSO por default — no polls si nadie está escuchando.
// La UI se suscribe con subscribe(cb) y desuscribe con unsub().

export type HwSnapshot = {
  ram: {
    totalMB: number
    libreMB: number
    usadoPct: number
  }
  cpu: {
    cores: number
    modelo?: string
  }
  gpu?: {
    nombre: string
    vramTotalMB?: number
    vramUsadoMB?: number
    utilizacionPct?: number
    tempC?: number
  }
  ts: number
}

export type HwMonitorOptions = {
  /** ms entre snapshots. Default 2000. */
  intervalMs?: number
}

export class HwMonitor {
  private opts: HwMonitorOptions
  private subs = new Set<(s: HwSnapshot) => void>()
  private timer: ReturnType<typeof setInterval> | undefined
  private ultima: HwSnapshot | undefined

  constructor(opts: HwMonitorOptions = {}) {
    this.opts = opts
  }

  subscribe(cb: (s: HwSnapshot) => void): () => void {
    this.subs.add(cb)
    this.arrancar()
    // Emitimos el último snapshot inmediatamente al suscribirse (si hay).
    if (this.ultima) cb(this.ultima)
    return () => {
      this.subs.delete(cb)
      if (this.subs.size === 0) this.parar()
    }
  }

  /** Snapshot único on-demand (sin arrancar el poll). */
  async snapshot(): Promise<HwSnapshot> {
    return this.tomarSnapshot()
  }

  private arrancar() {
    if (this.timer) return
    const interval = this.opts.intervalMs ?? 2000
    // Emit inicial rápido.
    void this.tick()
    this.timer = setInterval(() => void this.tick(), interval)
    this.timer.unref?.()
  }

  private parar() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private async tick() {
    const s = await this.tomarSnapshot()
    this.ultima = s
    for (const cb of this.subs) {
      try { cb(s) } catch { /* subs muertos no bloquean */ }
    }
  }

  private async tomarSnapshot(): Promise<HwSnapshot> {
    const total = totalmem()
    const libre = freemem()
    const cpuList = cpus()
    const gpu = await detectarGpuLive()
    return {
      ram: {
        totalMB: Math.round(total / (1024 * 1024)),
        libreMB: Math.round(libre / (1024 * 1024)),
        usadoPct: Math.round(((total - libre) / total) * 100),
      },
      cpu: {
        cores: cpuList.length,
        modelo: cpuList[0]?.model,
      },
      gpu,
      ts: Date.now(),
    }
  }
}

async function detectarGpuLive(): Promise<HwSnapshot["gpu"] | undefined> {
  // NVIDIA primero — es lo que la mayoría de usuarios con GPU tiene.
  const nvidia = await ejecutar("nvidia-smi", [
    "--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu",
    "--format=csv,noheader,nounits",
  ])
  if (nvidia.ok && nvidia.stdout.trim()) {
    const line = nvidia.stdout.trim().split("\n")[0]
    const parts = line?.split(",").map((s) => s.trim()) ?? []
    return {
      nombre: parts[0] ?? "NVIDIA GPU",
      vramTotalMB: Number(parts[1]) || undefined,
      vramUsadoMB: Number(parts[2]) || undefined,
      utilizacionPct: Number(parts[3]) || undefined,
      tempC: Number(parts[4]) || undefined,
    }
  }
  // Apple Silicon — VRAM es shared memory (RAM del sistema), reportamos como estimación.
  if (process.platform === "darwin") {
    const r = await ejecutar("system_profiler", ["SPHardwareDataType"])
    if (r.ok && /Apple/i.test(r.stdout)) {
      const chip = /Chip:\s+(.+)/.exec(r.stdout)?.[1]?.trim()
      return {
        nombre: chip ?? "Apple Silicon",
        // Metal unified memory: no reportamos VRAM total separado.
      }
    }
  }
  return undefined
}

async function ejecutar(cmd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cmd, args, { windowsHide: true })
    } catch {
      resolve({ ok: false, stdout: "" })
      return
    }
    let stdout = ""
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch { /* noop */ } }, 3000)
    child.stdout?.on("data", (c: Buffer) => { stdout += c.toString("utf8") })
    child.on("error", () => { clearTimeout(timer); resolve({ ok: false, stdout }) })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, stdout })
    })
  })
}
