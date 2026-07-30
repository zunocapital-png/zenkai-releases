import { spawn } from "node:child_process"
import { existsSync } from "node:fs"

// TTS local con Piper — motor de síntesis de voz totalmente offline.
// https://github.com/rhasspy/piper
//
// Por qué Piper:
//   - 100% local, sin llamadas a nube.
//   - ~30MB por voz, corre en CPU en tiempo real.
//   - Docenas de voces en español, inglés, portugués, etc.
//   - Salida WAV → el frontend la reproduce con Web Audio.
//
// Alternativa: si Piper no está instalado, la voz cae en Web Speech API del
// browser (speechSynthesis) que es "gratis" pero suena robótica y depende del OS.
// El fallback lo maneja el cliente, no este módulo.

export type PiperOptions = {
  /** Path al binario piper (o "piper" si está en PATH). */
  binaryPath?: string
  /** Path al archivo .onnx del modelo de voz. */
  modelPath: string
  /** Path al .onnx.json (config). Default: modelPath + ".json". */
  configPath?: string
  /** Length scale (velocidad — <1 más rápido). Default 1.0. */
  lengthScale?: number
}

export type SintetizarResultado = {
  ok: boolean
  wavBytes?: Uint8Array
  duracionMs: number
  mensajeError?: string
}

export async function detectarPiper(binaryPath?: string): Promise<boolean> {
  const bin = binaryPath ?? "piper"
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(bin, ["--help"], { windowsHide: true })
    } catch {
      resolve(false)
      return
    }
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch { /* noop */ } }, 3000)
    child.on("error", () => { clearTimeout(timer); resolve(false) })
    child.on("close", (code) => { clearTimeout(timer); resolve(code === 0) })
  })
}

/**
 * Sintetiza texto a WAV en memoria. stdin: texto, stdout: WAV bytes.
 * El cliente Electron/browser reproduce el WAV con AudioContext.
 */
export async function sintetizar(texto: string, opts: PiperOptions): Promise<SintetizarResultado> {
  const t0 = Date.now()
  if (!existsSync(opts.modelPath)) {
    return { ok: false, duracionMs: 0, mensajeError: `modelo Piper no existe: ${opts.modelPath}` }
  }
  const bin = opts.binaryPath ?? "piper"
  const args = ["--model", opts.modelPath, "--output-raw"]
  if (opts.configPath) args.push("--config", opts.configPath)
  if (opts.lengthScale) args.push("--length-scale", String(opts.lengthScale))

  return new Promise<SintetizarResultado>((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(bin, args, { windowsHide: true })
    } catch (e) {
      resolve({ ok: false, duracionMs: Date.now() - t0, mensajeError: (e as Error).message })
      return
    }
    const chunks: Buffer[] = []
    let stderr = ""
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch { /* noop */ } }, 30_000)
    child.stdout?.on("data", (c: Buffer) => chunks.push(c))
    child.stderr?.on("data", (c: Buffer) => { stderr += c.toString("utf8") })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        return resolve({ ok: false, duracionMs: Date.now() - t0, mensajeError: stderr.trim() || `exit ${code}` })
      }
      const raw = Buffer.concat(chunks)
      // Piper output-raw es PCM s16le mono 22050Hz — envolvemos en WAV header.
      const wav = envolverWav(raw, 22050, 1, 16)
      resolve({ ok: true, wavBytes: new Uint8Array(wav), duracionMs: Date.now() - t0 })
    })
    child.on("error", (e) => {
      clearTimeout(timer)
      resolve({ ok: false, duracionMs: Date.now() - t0, mensajeError: e.message })
    })
    // Escribimos el texto por stdin.
    try {
      child.stdin?.end(texto)
    } catch { /* pipe cerrado */ }
  })
}

/** Envuelve PCM raw en un contenedor WAV. */
export function envolverWav(pcm: Uint8Array | Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16) // subchunk1 size
  header.writeUInt16LE(1, 20)  // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, Buffer.from(pcm)])
}

/** Voces recomendadas — el usuario elige una y ZENKAI descarga los 2 archivos. */
export const VOCES_PIPER = [
  { id: "es-carlfm", nombre: "Español · Carlfm", url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx", config: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx.json", tamanoAprox: "22 MB" },
  { id: "es-mls_9972", nombre: "Español · MLS 9972 (medium)", url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx", config: "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx.json", tamanoAprox: "26 MB" },
  { id: "en-lessac", nombre: "English · Lessac (medium)", url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx", config: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json", tamanoAprox: "63 MB" },
]
