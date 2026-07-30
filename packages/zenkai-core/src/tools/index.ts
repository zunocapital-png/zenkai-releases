// Registro central de las tools implementadas en @zenkai/core. Cada tool está
// aislada en su propio archivo bajo impl/, con sus tests independientes.
import type { ToolExecutor } from "./executor"
import { readTool } from "./impl/read"
import { writeTool } from "./impl/write"
import { bashTool } from "./impl/bash"
import { grepTool } from "./impl/grep"

export { readTool, writeTool, bashTool, grepTool }
export type { ReadInput, ReadOutput } from "./impl/read"
export type { WriteInput, WriteOutput } from "./impl/write"
export type { BashInput, BashOutput } from "./impl/bash"
export type { GrepInput, GrepOutput, GrepMatch } from "./impl/grep"

/** Registra las 4 tools built-in en un ToolExecutor. */
export function registrarBuiltins(executor: ToolExecutor): void {
  executor.register(readTool)
  executor.register(writeTool)
  executor.register(bashTool)
  executor.register(grepTool)
}
