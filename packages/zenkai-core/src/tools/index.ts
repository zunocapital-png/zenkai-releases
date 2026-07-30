// Registro central de las tools implementadas en @zenkai/core. Cada tool está
// aislada en su propio archivo bajo impl/, con sus tests independientes.
import type { ToolExecutor } from "./executor.ts"
import { readTool } from "./impl/read.ts"
import { writeTool } from "./impl/write.ts"
import { bashTool } from "./impl/bash.ts"
import { grepTool } from "./impl/grep.ts"

export { readTool, writeTool, bashTool, grepTool }
export type { ReadInput, ReadOutput } from "./impl/read.ts"
export type { WriteInput, WriteOutput } from "./impl/write.ts"
export type { BashInput, BashOutput } from "./impl/bash.ts"
export type { GrepInput, GrepOutput, GrepMatch } from "./impl/grep.ts"

/** Registra las 4 tools built-in en un ToolExecutor. */
export function registrarBuiltins(executor: ToolExecutor): void {
  executor.register(readTool)
  executor.register(writeTool)
  executor.register(bashTool)
  executor.register(grepTool)
}
