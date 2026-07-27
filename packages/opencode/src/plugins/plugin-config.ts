import path from "path"
import os from "os"
import { readFile, writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"

const PLUGINS_DIR = path.join(os.homedir(), ".config", "opencode", "plugins")

function configPath(pluginId: string): string {
  return path.join(PLUGINS_DIR, pluginId, "config.json")
}

async function readConfigFile(pluginId: string): Promise<Record<string, unknown>> {
  const file = configPath(pluginId)
  if (!existsSync(file)) return {}

  try {
    const raw = await readFile(file, "utf-8")
    const data = JSON.parse(raw)
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {}
    return data as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeConfigFile(pluginId: string, config: Record<string, unknown>): Promise<void> {
  const file = configPath(pluginId)
  const dir = path.dirname(file)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(file, JSON.stringify(config, null, 2), "utf-8")
}

export async function getPluginConfig(pluginId: string): Promise<Record<string, unknown>> {
  return readConfigFile(pluginId)
}

export async function setPluginConfig(
  pluginId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const config = await readConfigFile(pluginId)
  config[key] = value
  await writeConfigFile(pluginId, config)
}

export async function getPluginDefaults(manifest: {
  id: string
  defaults?: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  if (manifest.defaults && typeof manifest.defaults === "object") {
    return { ...manifest.defaults }
  }
  return {}
}
