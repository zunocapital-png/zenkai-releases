export { correrAutoRepair } from "./auto-repair"
export type { AutoRepairInput, AutoRepairIntento, AutoRepairResultado, LlmProposer, FixPropuesto } from "./auto-repair"
export { reflexionar } from "./reflector"
export type { ReflexionInput, ReflexionVeredicto, ChatFn } from "./reflector"

export { correrAgentLoop } from "./agent-loop"
export type {
  AgentLoopInput, AgentLoopResultado, EjecucionPaso, Plan, PlanPaso,
  ToolRunner, CheckpointFn, RollbackFn,
} from "./agent-loop"

export { inlineEdit, extraerCodigoLimpio, generarDiffSimple, contarCambios } from "./inline-edit"
export type { InlineEditInput, InlineEditResultado } from "./inline-edit"
