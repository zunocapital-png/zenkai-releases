import { describe, expect, test } from "bun:test"
import { EnergyVAD } from "../src/voice/vad"
import { envolverWav } from "../src/voice/tts-piper"

function tono(freqHz: number, sr: number, ms: number, amp = 0.5): Float32Array {
  const n = Math.floor((sr * ms) / 1000)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * freqHz * i / sr) * amp
  return out
}

function silencio(sr: number, ms: number): Float32Array {
  const n = Math.floor((sr * ms) / 1000)
  return new Float32Array(n)
}

describe("Voz duplex · #81", () => {
  test("VAD detecta silencio como sin voz", () => {
    const vad = new EnergyVAD({ sampleRate: 16000 })
    const s = silencio(16000, 30)
    for (let i = 0; i < 10; i++) vad.procesarChunk(s)
    const r = vad.procesarChunk(s)
    expect(r.hayVoz).toBe(false)
    expect(r.rms).toBe(0)
  })

  test("VAD detecta tono fuerte como voz tras hangover", () => {
    const vad = new EnergyVAD({ sampleRate: 16000, hangoverFrames: 3 })
    const t = tono(200, 16000, 30, 0.5)
    let ultima = vad.procesarChunk(t)
    for (let i = 0; i < 5; i++) ultima = vad.procesarChunk(t)
    expect(ultima.hayVoz).toBe(true)
    expect(ultima.rms).toBeGreaterThan(0.1)
  })

  test("VAD hangover: 1 frame de voz no dispara", () => {
    const vad = new EnergyVAD({ sampleRate: 16000, hangoverFrames: 3 })
    const s = silencio(16000, 30)
    for (let i = 0; i < 5; i++) vad.procesarChunk(s)
    const r = vad.procesarChunk(tono(200, 16000, 30, 0.5))
    expect(r.hayVoz).toBe(false) // solo 1 frame con voz, hangover=3
  })

  test("VAD reset limpia el estado", () => {
    const vad = new EnergyVAD({ sampleRate: 16000 })
    const t = tono(200, 16000, 30, 0.5)
    for (let i = 0; i < 10; i++) vad.procesarChunk(t)
    vad.reset()
    const r = vad.procesarChunk(silencio(16000, 30))
    expect(r.framesConVoz).toBe(0)
  })

  test("envolverWav produce header RIFF+WAVE válido", () => {
    const pcm = new Uint8Array(100)
    const wav = envolverWav(pcm, 22050, 1, 16)
    expect(wav.length).toBe(44 + 100)
    expect(wav.slice(0, 4).toString()).toBe("RIFF")
    expect(wav.slice(8, 12).toString()).toBe("WAVE")
    expect(wav.slice(12, 16).toString()).toBe("fmt ")
    expect(wav.slice(36, 40).toString()).toBe("data")
    // sample rate en offset 24 LE
    expect(wav.readUInt32LE(24)).toBe(22050)
    // canales en 22
    expect(wav.readUInt16LE(22)).toBe(1)
  })
})
