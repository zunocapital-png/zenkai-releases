// Voice Activity Detector — detecta si en un chunk de audio hay voz o silencio.
// Es la parte crítica del "duplex": si el usuario empieza a hablar mientras
// la IA está hablando (TTS reproduciendo), cortamos la TTS y escuchamos.
//
// Implementación: energy-based VAD sencillo — calcula RMS del PCM y compara
// contra un umbral adaptativo. No es perfecto (WebRTC VAD lo hace mejor) pero
// es 0-dep, portable a Web Audio API y suficiente para "empezó a hablar".
//
// Uso típico en el cliente:
//   const vad = new EnergyVAD({ sampleRate: 16000 })
//   audioWorklet.onmessage = (e) => {
//     const detect = vad.procesarChunk(e.data.pcm)
//     if (detect.hayVoz && ttsPlayer.reproduciendo) ttsPlayer.pause()
//   }

export type VADOptions = {
  sampleRate: number
  /** Umbral inicial de energía (RMS 0-1). Default 0.02. */
  umbralInicial?: number
  /** Ventana de análisis en ms. Default 30ms. */
  frameMs?: number
  /** Cuántos frames consecutivos con voz para confirmar. Default 3 (~90ms). */
  hangoverFrames?: number
  /** True para adaptar el umbral al ruido de fondo. Default true. */
  adaptativo?: boolean
}

export type DetectVoz = {
  hayVoz: boolean
  rms: number
  umbralActual: number
  framesConVoz: number
}

export class EnergyVAD {
  private opts: Required<VADOptions>
  private ruidoDeBase = 0.0
  private framesConVoz = 0
  private muestrasFrame: number

  constructor(opts: VADOptions) {
    this.opts = {
      sampleRate: opts.sampleRate,
      umbralInicial: opts.umbralInicial ?? 0.02,
      frameMs: opts.frameMs ?? 30,
      hangoverFrames: opts.hangoverFrames ?? 3,
      adaptativo: opts.adaptativo ?? true,
    }
    this.muestrasFrame = Math.floor((this.opts.sampleRate * this.opts.frameMs) / 1000)
    this.ruidoDeBase = this.opts.umbralInicial * 0.5
  }

  /** Procesa un chunk PCM (Float32Array normalizado -1..1). */
  procesarChunk(pcm: Float32Array): DetectVoz {
    const rms = calcularRms(pcm)
    if (this.opts.adaptativo) {
      // Ruido de base: EMA lenta cuando NO hay voz confirmada.
      if (this.framesConVoz === 0) this.ruidoDeBase = this.ruidoDeBase * 0.95 + rms * 0.05
    }
    const umbralActual = Math.max(this.opts.umbralInicial, this.ruidoDeBase * 3)
    const cruzo = rms > umbralActual
    if (cruzo) this.framesConVoz = Math.min(this.framesConVoz + 1, this.opts.hangoverFrames * 10)
    else this.framesConVoz = Math.max(0, this.framesConVoz - 1)
    return {
      hayVoz: this.framesConVoz >= this.opts.hangoverFrames,
      rms,
      umbralActual,
      framesConVoz: this.framesConVoz,
    }
  }

  /** Reset — útil al cambiar de contexto (nueva sesión de mic). */
  reset(): void {
    this.ruidoDeBase = this.opts.umbralInicial * 0.5
    this.framesConVoz = 0
  }
}

function calcularRms(pcm: Float32Array): number {
  if (pcm.length === 0) return 0
  let sum = 0
  for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!
  return Math.sqrt(sum / pcm.length)
}
