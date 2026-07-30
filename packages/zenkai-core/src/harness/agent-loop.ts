import type { ChatFn } from "./reflector"
import type { Message } from "../types/index"

// Autonomous Agent Loop (Cline/Devin/Windsurf Cascade style).
// El agente hace:
//   1. PLAN — descompone el objetivo en pasos numerados
//   2. ACT  — ejecuta paso N (llama tools reales)
//   3. VERIFY — chequea que el paso salió bien
//   4. CHECKPOINT — guarda estado post-paso para rollback si algo se rompe
//   5. Repite hasta terminar o alcanzar límite de pasos
//
// Diferencia vs auto-repair:
//   - auto-repair es 1 objetivo binario (test pasa/no pasa) con fix-loop simple.
//   - agent-loop es objetivo abierto ("agregar login") con planificación explícita.
//
// Los tools los ejecuta un `ToolRunner` inyectable — el motor no asume implementación
// específica, solo llama tools con nombre + args y espera resultado. Así funciona
// contra el ToolExecutor propio, MCPs, o cualquier otro backend.

export type PlanPaso = {
  numero: number
  descripcion: string
  toolSugerido?: string
  argsSugeridos?: Record<string, unknown>
}

export type Plan = {
  objetivo: string
  pasos: PlanPaso[]
}

export type EjecucionPaso = {
  paso: PlanPaso
  toolUsado?: string
  args?: Record<string, unknown>
  resultado?: unknown
  ok: boolean
  error?: string
  verificacion?: { pasa: boolean; motivo?: string }
  duracionMs: number
}

export type CheckpointFn = (paso: number) => Promise<{ id: string; timestamp: number }>
export type RollbackFn = (checkpointId: string) => Promise<void>

export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<{ ok: boolean; resultado?: unknown; error?: string }>

export type AgentLoopInput = {
  objetivo: string
  modelo: string
  candidateProviders?: string[]
  /** Máximo de pasos totales. Default 15. */
  maxPasos?: number
  /** Máximo de reintentos por paso. Default 2. */
  maxReintentosPorPaso?: number
  /** Contexto opcional (código, sistema, restricciones). */
  contexto?: string
  /** Tools disponibles — nombre + descripción para que el planner sepa qué existe. */
  toolsDisponibles?: Array<{ name: string; description: string }>
}

export type AgentLoopResultado = {
  ok: boolean
  plan?: Plan
  ejecuciones: EjecucionPaso[]
  detenidoPor: "completado" | "max_pasos" | "paso_fatal" | "plan_invalido"
  duracionMs: number
}

const PROMPT_PLANNER = `Sos un planificador de agente. Recibís un objetivo y descomponés en pasos ejecutables.

Reglas:
- Máximo 8 pasos por plan. Mejor pocos pasos grandes que muchos chicos.
- Cada paso debe ser verificable (podés decir si salió bien o no).
- Si tenés tools disponibles, sugerí cuál usar por paso.
- Respondé SOLO en JSON: {"pasos": [{"numero":1,"descripcion":"...","toolSugerido":"...","argsSugeridos":{...}}]}`

const PROMPT_ACTOR = `Sos un ejecutor de agente. Recibís UN paso del plan y decidís qué tool ejecutar.

Contexto: el paso puede o no venir con una sugerencia. Podés seguirla o cambiarla si no aplica.

Respondé SOLO JSON: {"tool":"<nombre>","args":{...},"razon":"<1 frase>"}
Si el paso no requiere tool (ej. razonar, planear sub-plan), devolvé {"tool":null,"razon":"..."}.`

const PROMPT_VERIFIER = `Sos el verificador. Recibís lo que se PIDIÓ hacer y lo que RESULTÓ. Decidís si pasa.

Respondé SOLO JSON: {"pasa": true|false, "motivo": "<1 frase>"}`

export async function correrAgentLoop(
  input: AgentLoopInput,
  chat: ChatFn,
  runner: ToolRunner,
  hooks: { checkpoint?: CheckpointFn; rollback?: RollbackFn } = {},
): Promise<AgentLoopResultado> {
  const t0 = Date.now()
  const maxPasos = input.maxPasos ?? 15
  const maxReintentos = input.maxReintentosPorPaso ?? 2
  const ejecuciones: EjecucionPaso[] = []

  // ── FASE 1: PLAN ──
  const plan = await pedirPlan(input, chat)
  if (!plan || plan.pasos.length === 0) {
    return { ok: false, ejecuciones: [], detenidoPor: "plan_invalido", duracionMs: Date.now() - t0 }
  }

  // ── FASE 2-4: ACT + VERIFY + CHECKPOINT por paso ──
  for (let i = 0; i < plan.pasos.length && ejecuciones.length < maxPasos; i++) {
    const paso = plan.pasos[i]!
    const t1 = Date.now()
    let ejec: EjecucionPaso | undefined

    for (let intento = 0; intento <= maxReintentos; intento++) {
      const decision = await pedirAccion(paso, input, chat, intento > 0 ? ejec : undefined)
      if (!decision || !decision.tool) {
        // Paso puramente cognitivo — lo damos por hecho.
        ejec = { paso, ok: true, duracionMs: Date.now() - t1 }
        break
      }
      const res = await runner(decision.tool, decision.args ?? {})
      const verif = await verificarPaso(paso, decision, res, chat, input.modelo, input.candidateProviders)
      ejec = {
        paso,
        toolUsado: decision.tool,
        args: decision.args,
        resultado: res.resultado,
        ok: res.ok && (verif?.pasa ?? true),
        error: res.error,
        verificacion: verif,
        duracionMs: Date.now() - t1,
      }
      if (ejec.ok) break
    }

    ejecuciones.push(ejec!)
    // Checkpoint post-paso.
    if (hooks.checkpoint) {
      try { await hooks.checkpoint(i) } catch { /* best-effort */ }
    }
    // Si el paso falló definitivamente y era fatal (marcado por verifier), abortamos.
    if (!ejec!.ok && ejec!.verificacion?.motivo?.toLowerCase().includes("fatal")) {
      return { ok: false, plan, ejecuciones, detenidoPor: "paso_fatal", duracionMs: Date.now() - t0 }
    }
  }

  const detenidoPor: AgentLoopResultado["detenidoPor"] =
    ejecuciones.length >= maxPasos && ejecuciones.length < plan.pasos.length ? "max_pasos" : "completado"
  const ok = ejecuciones.length > 0 && ejecuciones.every((e) => e.ok)
  return { ok, plan, ejecuciones, detenidoPor, duracionMs: Date.now() - t0 }
}

async function pedirPlan(input: AgentLoopInput, chat: ChatFn): Promise<Plan | undefined> {
  const toolsList = (input.toolsDisponibles ?? [])
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n")
  const user = [
    `OBJETIVO: ${input.objetivo}`,
    input.contexto ? `\nCONTEXTO:\n${input.contexto}` : "",
    toolsList ? `\nTOOLS DISPONIBLES:\n${toolsList}` : "",
  ].join("\n")

  const messages: Message[] = [
    { id: "s", role: "system", parts: [{ type: "text", text: PROMPT_PLANNER }], createdAt: 0 },
    { id: "u", role: "user", parts: [{ type: "text", text: user }], createdAt: 0 },
  ]
  const res = await chat({ model: input.modelo, messages, temperature: 0.2, cacheable: false }, input.candidateProviders)
  const parsed = extraerJson(res.content) as { pasos?: PlanPaso[] } | undefined
  if (!parsed?.pasos || !Array.isArray(parsed.pasos)) return undefined
  return {
    objetivo: input.objetivo,
    pasos: parsed.pasos
      .filter((p): p is PlanPaso => !!p && typeof p.descripcion === "string")
      .map((p, i) => ({
        numero: typeof p.numero === "number" ? p.numero : i + 1,
        descripcion: String(p.descripcion),
        toolSugerido: typeof p.toolSugerido === "string" ? p.toolSugerido : undefined,
        argsSugeridos: p.argsSugeridos && typeof p.argsSugeridos === "object" ? p.argsSugeridos : undefined,
      })),
  }
}

async function pedirAccion(
  paso: PlanPaso,
  input: AgentLoopInput,
  chat: ChatFn,
  intentoPrevio?: EjecucionPaso,
): Promise<{ tool: string | null; args?: Record<string, unknown>; razon?: string } | undefined> {
  const toolsList = (input.toolsDisponibles ?? [])
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n") || "(sin tools disponibles)"
  const user = [
    `PASO ${paso.numero}: ${paso.descripcion}`,
    paso.toolSugerido ? `\nSUGERENCIA: usar tool "${paso.toolSugerido}" con args ${JSON.stringify(paso.argsSugeridos ?? {})}` : "",
    `\nTOOLS:\n${toolsList}`,
    intentoPrevio?.error ? `\nEl intento anterior FALLÓ con: ${intentoPrevio.error}. Probá algo distinto.` : "",
  ].filter(Boolean).join("\n")

  const messages: Message[] = [
    { id: "s", role: "system", parts: [{ type: "text", text: PROMPT_ACTOR }], createdAt: 0 },
    { id: "u", role: "user", parts: [{ type: "text", text: user }], createdAt: 0 },
  ]
  const res = await chat({ model: input.modelo, messages, temperature: 0.2, cacheable: false }, input.candidateProviders)
  const parsed = extraerJson(res.content) as { tool?: unknown; args?: unknown; razon?: unknown } | undefined
  if (!parsed) return undefined
  const tool = typeof parsed.tool === "string" ? parsed.tool : null
  const args = parsed.args && typeof parsed.args === "object" ? (parsed.args as Record<string, unknown>) : undefined
  return { tool, args, razon: typeof parsed.razon === "string" ? parsed.razon : undefined }
}

async function verificarPaso(
  paso: PlanPaso,
  decision: { tool: string | null; args?: Record<string, unknown> },
  resultado: { ok: boolean; resultado?: unknown; error?: string },
  chat: ChatFn,
  modelo: string,
  providers?: string[],
): Promise<{ pasa: boolean; motivo?: string }> {
  // Si el runner ya reportó error, no gastamos otro roundtrip.
  if (!resultado.ok) return { pasa: false, motivo: resultado.error ?? "runner falló" }
  const user = [
    `PASO PEDIDO: ${paso.descripcion}`,
    `TOOL EJECUTADO: ${decision.tool ?? "(ninguno)"}`,
    `ARGS: ${JSON.stringify(decision.args ?? {})}`,
    `RESULTADO: ${JSON.stringify(resultado.resultado ?? "").slice(0, 2000)}`,
  ].join("\n")
  const messages: Message[] = [
    { id: "s", role: "system", parts: [{ type: "text", text: PROMPT_VERIFIER }], createdAt: 0 },
    { id: "u", role: "user", parts: [{ type: "text", text: user }], createdAt: 0 },
  ]
  const res = await chat({ model: modelo, messages, temperature: 0.1, cacheable: false }, providers)
  const parsed = extraerJson(res.content) as { pasa?: unknown; motivo?: unknown } | undefined
  return {
    pasa: parsed?.pasa === true,
    motivo: typeof parsed?.motivo === "string" ? parsed.motivo : undefined,
  }
}

function extraerJson(text: string): unknown {
  try { return JSON.parse(text.trim()) } catch { /* try block match */ }
  const start = text.indexOf("{")
  if (start < 0) return undefined
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
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return undefined }
      }
    }
  }
  return undefined
}
