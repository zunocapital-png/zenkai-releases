import fs from "fs/promises"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export type HookEvent =
  | "beforeToolCall"
  | "afterToolCall"
  | "beforeResponse"
  | "afterResponse"
  | "onError"
  | "onSessionStart"
  | "onSessionEnd"

export interface HookContext {
  event: HookEvent
  data: any
  sessionId: string
  timestamp: number
  projectPath: string
}

export interface HookResult {
  proceed: boolean
  modified?: any
  error?: string
}

export type HookHandler = (context: HookContext) => Promise<HookResult>

export interface HookDefinition {
  command?: string
  script?: string
  enabled: boolean
  timeout?: number
}

export interface HookConfig {
  hooks: Record<HookEvent, HookDefinition[]>
}

export class HookRegistry {
  private static instance: HookRegistry
  private handlers: Map<HookEvent, HookHandler[]> = new Map()

  private constructor() {}

  static getInstance(): HookRegistry {
    if (!HookRegistry.instance) {
      HookRegistry.instance = new HookRegistry()
    }
    return HookRegistry.instance
  }

  register(event: HookEvent, handler: HookHandler): void {
    const existing = this.handlers.get(event) || []
    existing.push(handler)
    this.handlers.set(event, existing)
  }

  unregister(event: HookEvent, handler: HookHandler): void {
    const existing = this.handlers.get(event)
    if (!existing) return
    const idx = existing.indexOf(handler)
    if (idx !== -1) {
      existing.splice(idx, 1)
    }
  }

  async trigger(context: HookContext): Promise<HookResult> {
    const handlers = this.handlers.get(context.event) || []
    for (const handler of handlers) {
      const result = await handler(context)
      if (!result.proceed) {
        return result
      }
      if (result.modified !== undefined) {
        context.data = result.modified
      }
    }
    return { proceed: true }
  }
}

function createCommandHandler(definition: HookDefinition): HookHandler {
  return async (context: HookContext): Promise<HookResult> => {
    if (!definition.enabled) {
      return { proceed: true }
    }

    const timeout = definition.timeout || 30000

    try {
      if (definition.command) {
        const parts = definition.command.split(" ")
        const cmd = parts[0]
        const args = parts.slice(1)
        await execFileAsync(cmd, args, {
          cwd: context.projectPath,
          timeout,
        })
      } else if (definition.script) {
        const scriptPath = path.resolve(context.projectPath, definition.script)
        await execFileAsync(process.execPath, [scriptPath], {
          cwd: context.projectPath,
          timeout,
          env: {
            ...process.env,
            ZENKAI_EVENT: context.event,
            ZENKAI_SESSION_ID: context.sessionId,
            ZENKAI_DATA: JSON.stringify(context.data),
          },
        })
      }
      return { proceed: true }
    } catch (err: any) {
      return { proceed: true, error: err.message }
    }
  }
}

export async function loadProjectHooks(projectPath: string): Promise<void> {
  const configPath = path.join(projectPath, ".zenkai", "hooks.json")
  const registry = HookRegistry.getInstance()

  let raw: string
  try {
    raw = await fs.readFile(configPath, "utf-8")
  } catch {
    return
  }

  const config: HookConfig = JSON.parse(raw)

  for (const [event, definitions] of Object.entries(config.hooks)) {
    for (const definition of definitions) {
      const handler = createCommandHandler(definition)
      registry.register(event as HookEvent, handler)
    }
  }
}

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
])

function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

export function registerBuiltinHooks(): void {
  const registry = HookRegistry.getInstance()

  const lintAfterEdit: HookHandler = async (context) => {
    const { data } = context
    const toolName = data?.tool?.toLowerCase()
    if (toolName !== "edit" && toolName !== "write") {
      return { proceed: true }
    }

    const configPath = path.join(context.projectPath, ".zenkai", "hooks.json")
    try {
      const raw = await fs.readFile(configPath, "utf-8")
      const config: HookConfig = JSON.parse(raw)
      const lintDefs = config.hooks.afterToolCall?.filter(
        (d) => d.command?.includes("lint") && d.enabled,
      )
      if (!lintDefs || lintDefs.length === 0) {
        return { proceed: true }
      }
      const parts = lintDefs[0].command!.split(" ")
      await execFileAsync(parts[0], parts.slice(1), {
        cwd: context.projectPath,
        timeout: lintDefs[0].timeout || 30000,
      })
    } catch {
      // lint not configured or failed
    }
    return { proceed: true }
  }

  const testAfterCodeChange: HookHandler = async (context) => {
    const { data } = context
    const filePath = data?.filePath || data?.path || ""
    if (!isCodeFile(filePath)) {
      return { proceed: true }
    }

    const configPath = path.join(context.projectPath, ".zenkai", "hooks.json")
    try {
      const raw = await fs.readFile(configPath, "utf-8")
      const config: HookConfig = JSON.parse(raw)
      const testDefs = config.hooks.afterToolCall?.filter(
        (d) => d.command?.includes("test") && d.enabled,
      )
      if (!testDefs || testDefs.length === 0) {
        return { proceed: true }
      }
      const parts = testDefs[0].command!.split(" ")
      await execFileAsync(parts[0], parts.slice(1), {
        cwd: context.projectPath,
        timeout: testDefs[0].timeout || 60000,
      })
    } catch {
      // test not configured or failed
    }
    return { proceed: true }
  }

  const formatAfterWrite: HookHandler = async (context) => {
    const { data } = context
    const toolName = data?.tool?.toLowerCase()
    if (toolName !== "write") {
      return { proceed: true }
    }

    const configPath = path.join(context.projectPath, ".zenkai", "hooks.json")
    try {
      const raw = await fs.readFile(configPath, "utf-8")
      const config: HookConfig = JSON.parse(raw)
      const formatDefs = config.hooks.afterToolCall?.filter(
        (d) => d.command?.includes("format") && d.enabled,
      )
      if (!formatDefs || formatDefs.length === 0) {
        return { proceed: true }
      }
      const parts = formatDefs[0].command!.split(" ")
      await execFileAsync(parts[0], parts.slice(1), {
        cwd: context.projectPath,
        timeout: formatDefs[0].timeout || 30000,
      })
    } catch {
      // formatter not configured or failed
    }
    return { proceed: true }
  }

  registry.register("afterToolCall", lintAfterEdit)
  registry.register("afterToolCall", testAfterCodeChange)
  registry.register("afterToolCall", formatAfterWrite)
}
