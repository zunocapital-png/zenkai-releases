import type { ChatFn } from "../harness/reflector"
import type { Message } from "../types/index"

// AI Parliament: consulta a N modelos simultáneamente sobre la misma pregunta,
// y decide por voting (majority) con desempate por confidence.
//
// Casos de uso:
//   - Decisiones críticas donde 1 modelo puede alucinar.
//   - Comparación de perspectivas entre modelos distintos.
//   - Cross-check antes de aplicar un fix o borrar algo.
//
// Diseño:
//   - Cada "miembro" es {modelo, providers?}.
//   - Se les pide voto en un formato estructurado (SI/NO + confianza 0-1 + razón).
//   - Se agrega por majority y en empate gana el promedio ponderado de confianza.

export type MiembroParlamento = {
  modelo: string
  candidateProviders?: string[]
  /** Peso del voto — default 1. */
  peso?: number
}

export type VotoParlamento = {
  miembro: string
  voto: "si" | "no" | "abstain"
  confianza: number // 0..1
  razon?: string
  latencyMs: number
  error?: string
}

export type ResultadoParlamento = {
  decision: "si" | "no" | "empate"
  votos: VotoParlamento[]
  votosSi: number
  votosNo: number
  votosAbstain: number
  confianzaPromedioSi: number
  confianzaPromedioNo: number
  totalMiembros: number
  quorum: number
}

const PROMPT_PARLAMENTO = `Sos un miembro de un consejo de decisión. Se te presenta una pregunta binaria (sí/no).
Respondé SOLO JSON con este shape exacto:
{"voto":"si"|"no"|"abstain", "confianza": <0..1>, "razon": <string corto>}

Reglas:
- Sé riguroso. Preferí "abstain" a inventar cuando no sabés.
- confianza 0.9+ = seguro. 0.5 = duda. 0.2 = casi al azar.
- razon: 1-2 frases máximo.`

export async function consultarParlamento(input: {
  pregunta: string
  contexto?: string
  miembros: MiembroParlamento[]
  chat: ChatFn
}): Promise<ResultadoParlamento> {
  const { pregunta, contexto, miembros, chat } = input
  if (miembros.length === 0) throw new Error("parliament sin miembros")

  const votos = await Promise.all(
    miembros.map(async (m): Promise<VotoParlamento> => {
      const t0 = Date.now()
      try {
        const userContent = [
          contexto ? `CONTEXTO:\n${contexto}\n` : "",
          `PREGUNTA:\n${pregunta}`,
        ].filter(Boolean).join("\n")
        const messages: Message[] = [
          { id: "sys", role: "system", parts: [{ type: "text", text: PROMPT_PARLAMENTO }], createdAt: 0 },
          { id: "u", role: "user", parts: [{ type: "text", text: userContent }], createdAt: 0 },
        ]
        const res = await chat({ model: m.modelo, messages, temperature: 0.3, cacheable: false }, m.candidateProviders)
        const parsed = extraerJson(res.content)
        const voto = normalizarVoto(parsed?.voto)
        const confianza = clamp01(parsed?.confianza)
        return {
          miembro: m.modelo,
          voto,
          confianza,
          razon: typeof parsed?.razon === "string" ? parsed.razon : undefined,
          latencyMs: Date.now() - t0,
        }
      } catch (e) {
        return {
          miembro: m.modelo,
          voto: "abstain",
          confianza: 0,
          error: String((e as Error).message),
          latencyMs: Date.now() - t0,
        }
      }
    }),
  )

  return contabilizarVotos(votos, miembros)
}

export function contabilizarVotos(votos: VotoParlamento[], miembros: MiembroParlamento[]): ResultadoParlamento {
  const pesosPorMiembro = new Map(miembros.map((m) => [m.modelo, m.peso ?? 1]))
  let pesoSi = 0, pesoNo = 0
  let confSi = 0, confNo = 0
  let countSi = 0, countNo = 0, countAbstain = 0
  for (const v of votos) {
    const p = pesosPorMiembro.get(v.miembro) ?? 1
    if (v.voto === "si") { pesoSi += p; confSi += v.confianza * p; countSi++ }
    else if (v.voto === "no") { pesoNo += p; confNo += v.confianza * p; countNo++ }
    else countAbstain++
  }
  let decision: "si" | "no" | "empate"
  if (pesoSi > pesoNo) decision = "si"
  else if (pesoNo > pesoSi) decision = "no"
  else if (pesoSi === 0 && pesoNo === 0) decision = "empate"
  else {
    // Empate en votos: desempata la confianza promedio ponderada.
    const cSi = countSi > 0 ? confSi / pesoSi : 0
    const cNo = countNo > 0 ? confNo / pesoNo : 0
    decision = cSi > cNo ? "si" : cNo > cSi ? "no" : "empate"
  }
  return {
    decision,
    votos,
    votosSi: countSi,
    votosNo: countNo,
    votosAbstain: countAbstain,
    confianzaPromedioSi: countSi > 0 ? confSi / pesoSi : 0,
    confianzaPromedioNo: countNo > 0 ? confNo / pesoNo : 0,
    totalMiembros: miembros.length,
    quorum: countSi + countNo, // cuántos votaron algo distinto de abstain
  }
}

function normalizarVoto(v: unknown): "si" | "no" | "abstain" {
  const s = String(v ?? "").toLowerCase().trim()
  if (s === "si" || s === "sí" || s === "yes") return "si"
  if (s === "no") return "no"
  return "abstain"
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number.parseFloat(String(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function extraerJson(text: string): { voto?: unknown; confianza?: unknown; razon?: unknown } {
  try { return JSON.parse(text.trim()) } catch { /* no direct */ }
  const start = text.indexOf("{")
  if (start < 0) return {}
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]!
    if (esc) { esc = false; continue }
    if (c === "\\") { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return {} }
      }
    }
  }
  return {}
}
