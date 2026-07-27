/**
 * Core type definitions for the Zenkai plugin system.
 */

export type PluginType = "tool" | "theme" | "agent" | "provider"

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>): Promise<unknown>
}

export interface ThemeDefinition {
  name: string
  colors: Record<string, string>
  variant: "light" | "dark"
}

export interface AgentDefinition {
  name: string
  description: string
  systemPrompt: string
  model?: string
  tools?: string[]
}

export interface PluginContext {
  registerTool(tool: ToolDefinition): void
  registerTheme(theme: ThemeDefinition): void
  registerAgent(agent: AgentDefinition): void
  getConfig(): Record<string, unknown>
  log(message: string): void
}

export interface ZenkaiPlugin {
  id: string
  name: string
  version: string
  description: string
  author: string
  type: PluginType
  activate(context: PluginContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  type: PluginType
  entry: string
}
