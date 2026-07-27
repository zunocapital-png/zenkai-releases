import type { ZenkaiPlugin, PluginType, PluginContext, ToolDefinition, ThemeDefinition, AgentDefinition } from "./plugin-types"

const activePlugins = new Map<string, ZenkaiPlugin>()

/**
 * Creates a PluginContext that collects registrations for a given plugin.
 */
export function createPluginContext(pluginId: string): PluginContext {
  return {
    registerTool(tool: ToolDefinition) {
      const key = `${pluginId}:tool:${tool.name}`
      registeredTools.set(key, tool)
    },
    registerTheme(theme: ThemeDefinition) {
      const key = `${pluginId}:theme:${theme.name}`
      registeredThemes.set(key, theme)
    },
    registerAgent(agent: AgentDefinition) {
      const key = `${pluginId}:agent:${agent.name}`
      registeredAgents.set(key, agent)
    },
    getConfig() {
      return {}
    },
    log(message: string) {
      console.log(`[plugin:${pluginId}] ${message}`)
    },
  }
}

// Sub-registries for tools, themes, and agents provided by plugins
const registeredTools = new Map<string, ToolDefinition>()
const registeredThemes = new Map<string, ThemeDefinition>()
const registeredAgents = new Map<string, AgentDefinition>()

/**
 * Registers a plugin and calls its activate method.
 */
export async function register(plugin: ZenkaiPlugin): Promise<void> {
  if (activePlugins.has(plugin.id)) {
    await unregister(plugin.id)
  }
  const context = createPluginContext(plugin.id)
  await plugin.activate(context)
  activePlugins.set(plugin.id, plugin)
}

/**
 * Deactivates and removes a plugin by id.
 */
export async function unregister(id: string): Promise<void> {
  const plugin = activePlugins.get(id)
  if (!plugin) return
  await plugin.deactivate?.()
  activePlugins.delete(id)

  // Clean up sub-registries
  for (const key of registeredTools.keys()) {
    if (key.startsWith(`${id}:`)) registeredTools.delete(key)
  }
  for (const key of registeredThemes.keys()) {
    if (key.startsWith(`${id}:`)) registeredThemes.delete(key)
  }
  for (const key of registeredAgents.keys()) {
    if (key.startsWith(`${id}:`)) registeredAgents.delete(key)
  }
}

/**
 * Returns all active plugins.
 */
export function getAll(): ZenkaiPlugin[] {
  return Array.from(activePlugins.values())
}

/**
 * Returns active plugins filtered by type.
 */
export function getByType(type: PluginType): ZenkaiPlugin[] {
  return Array.from(activePlugins.values()).filter((p) => p.type === type)
}
