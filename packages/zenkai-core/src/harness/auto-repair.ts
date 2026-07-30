// Auto-repair loop harness. Corre un comando (típicamente tests), si falla
// invoca al agente para diagnosticar + proponer un fix, aplica el fix,
// reintenta. Máximo N iteraciones. Sin intervención del usuario.
//
// La gracia: en vez de que la IA "diga qué haría", el loop LO HACE y CIERRA.
// Combina bash tool + un fixApplier custom + un llmProposer que decide.
//
// Es genérico — el llmProposer y fixApplier son inyectables. En producción
// llmProposer llama a un ProviderOrchestrator; en tests usamos uno mock.

import type { ToolExecutor } from "../tools/executor"

export type AutoRepairInput = {
  /** Comando a correr (ej: "bun test"). */
  testCmd: string
  cwd?: string
  /** Máximo de iteraciones. Default 3. */
  maxIntentos?: number
  /** Contexto adicional para el LLM (ej: qué archivo se cambió). */
  contexto?: string
}

export type AutoRepairIntento = {
  numero: number
  outputTest: string
  exitCode: number | null
  hipotesis?: string
  fixAplicado?: string
  fixError?: string
}

export type AutoRepairResultado = {
  ok: boolean
  intentos: AutoRepairIntento[]
  resumen: string
}

/** El proposer recibe el output del test + contexto y devuelve una hipótesis
 *  + un cambio a aplicar. Devolver undefined para abortar el loop. */
export type LlmProposer = (input: {
  testOutput: string
  testExitCode: number | null
  contexto?: string
  intentosPrevios: AutoRepairIntento[]
}) => Promise<{ hipotesis: string; fix: FixPropuesto } | undefined>

export type FixPropuesto =
  | { tipo: "escribir"; path: string; contenido: string }
  | { tipo: "bash"; cmd: string }
  | { tipo: "manual"; nota: string }

/** Aplicador de fixes. Recibe uno propuesto y lo ejecuta usando el executor. */
async function aplicarFix(fix: FixPropuesto, executor: ToolExecutor): Promise<{ ok: boolean; error?: string }> {
  if (fix.tipo === "escribir") {
    const r = await executor.invoke("write", { path: fix.path, content: fix.contenido })
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }
  if (fix.tipo === "bash") {
    const r = await executor.invoke("bash", { cmd: fix.cmd })
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }
  return { ok: false, error: `Fix manual requiere intervención: ${fix.nota}` }
}

export async function correrAutoRepair(
  input: AutoRepairInput,
  executor: ToolExecutor,
  proposer: LlmProposer,
): Promise<AutoRepairResultado> {
  const maxIntentos = input.maxIntentos ?? 3
  const intentos: AutoRepairIntento[] = []

  for (let i = 1; i <= maxIntentos; i++) {
    // 1. Correr el test.
    const testRun = await executor.invoke("bash", { cmd: input.testCmd, cwd: input.cwd })
    if (!testRun.ok) {
      intentos.push({ numero: i, outputTest: `[bash tool falló: ${testRun.error}]`, exitCode: null })
      break
    }
    const out = testRun.output as { stdout: string; stderr: string; exitCode: number | null }
    const combinado = `${out.stdout}\n${out.stderr}`
    const exitCode = out.exitCode

    // 2. Éxito → salir.
    if (exitCode === 0) {
      intentos.push({ numero: i, outputTest: combinado, exitCode })
      return {
        ok: true,
        intentos,
        resumen: `Tests pasaron en el intento ${i} de ${maxIntentos}.`,
      }
    }

    // 3. Test falló. Pedir al proposer que diagnostique.
    const propuesta = await proposer({
      testOutput: combinado,
      testExitCode: exitCode,
      contexto: input.contexto,
      intentosPrevios: intentos,
    })
    if (!propuesta) {
      intentos.push({ numero: i, outputTest: combinado, exitCode })
      break
    }

    // 4. Aplicar fix.
    const fixResult = await aplicarFix(propuesta.fix, executor)
    const intento: AutoRepairIntento = {
      numero: i,
      outputTest: combinado,
      exitCode,
      hipotesis: propuesta.hipotesis,
      fixAplicado: describirFix(propuesta.fix),
    }
    if (!fixResult.ok) intento.fixError = fixResult.error
    intentos.push(intento)

    // 5. Si el fix falló, no seguimos.
    if (!fixResult.ok) break
  }

  return {
    ok: false,
    intentos,
    resumen: `Tests siguen fallando tras ${intentos.length} intento(s). Revisá el diagnóstico manual.`,
  }
}

function describirFix(f: FixPropuesto): string {
  if (f.tipo === "escribir") return `escribir ${f.path} (${f.contenido.length} bytes)`
  if (f.tipo === "bash") return `bash: ${f.cmd.slice(0, 80)}`
  return `manual: ${f.nota}`
}
