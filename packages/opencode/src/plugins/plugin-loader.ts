import path from "path"
import os from "os"
import { readFile, readdir, stat } from "fs/promises"
import { existsSync } from "fs"
import { pathToFileURL } from "url"
import type { ZenkaiPlugin, PluginManifest } from "./plugin-types"

const PLUGINS_DIR = path.join(os.homedir(), ".config", "opencode", "plugins")

function resolvePluginsDir(): string {
  return PLUGINS_DIR
}

async function readManifest(dir: string): Promise<PluginManifest | undefined> {
  const manifestPath = path.join(dir, "plugin.json")
  if (!existsSync(manifestPath)) return undefined

  try {
    const raw = await readFile(manifestPath, "utf-8")
    const data = JSON.parse(raw) as Record<string, unknown>

    if (typeof data.id !== "string" || !data.id) return undefined
    if (typeof data.name !== "string" || !data.name) return undefined
    if (typeof data.version !== "string" || !data.version) return undefined

    return {
      id: data.id,
      name: data.name,
      version: data.version,
      description: typeof data.description === "string" ? data.description : "",
      author: typeof data.author === "string" ? data.author : "",
      type: isValidType(data.type) ? data.type : "tool",
      entry: typeof data.entry === "string" ? data.entry : "index.js",
    }
  } catch {
    return undefined
  }
}

function isValidType(value: unknown): value is PluginManifest["type"] {
  return typeof value === "string" && ["tool", "theme", "agent", "provider"].includes(value)
}

/**
 * Returns manifests for all installed plugins found in the plugins directory.
 */
export async function getInstalledPlugins(): Promise<PluginManifest[]> {
  const dir = resolvePluginsDir()
  if (!existsSync(dir)) return []

  const entries = await readdir(dir)
  const manifests: PluginManifest[] = []

  for (const entry of entries) {
    const full = path.join(dir, entry)
    const info = await stat(full).catch(() => undefined)
    if (!info?.isDirectory()) continue

    const manifest = await readManifest(full)
    if (manifest) manifests.push(manifest)
  }

  return manifests
}

/**
 * Scans the plugins directory, loads each plugin module, and calls activate().
 * Returns the list of successfully loaded plugins.
 */
export async function loadPlugins(): Promise<ZenkaiPlugin[]> {
  const manifests = await getInstalledPlugins()
  const plugins: ZenkaiPlugin[] = []

  for (const manifest of manifests) {
    const dir = path.join(resolvePluginsDir(), manifest.id)
    const entryPath = path.join(dir, manifest.entry)

    if (!existsSync(entryPath)) continue

    try {
      const entryUrl = pathToFileURL(entryPath).href
      const mod = (await import(entryUrl)) as Record<string, unknown>
      const plugin = extractPlugin(mod, manifest)
      if (plugin) plugins.push(plugin)
    } catch {
      // Skip plugins that fail to load
    }
  }

  return plugins
}

function extractPlugin(
  mod: Record<string, unknown>,
  manifest: PluginManifest,
): ZenkaiPlugin | undefined {
  // Support both default export and named plugin export
  const candidate = (mod.default ?? mod.plugin) as Record<string, unknown> | undefined
  if (!candidate || typeof candidate !== "object") return undefined

  const activate = candidate.activate
  if (typeof activate !== "function") return undefined

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    type: manifest.type,
    activate: activate as ZenkaiPlugin["activate"],
    deactivate: typeof candidate.deactivate === "function"
      ? (candidate.deactivate as ZenkaiPlugin["deactivate"])
      : undefined,
  }
}
