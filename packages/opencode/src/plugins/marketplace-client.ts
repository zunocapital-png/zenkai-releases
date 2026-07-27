import path from "path"
import os from "os"
import { readFile, writeFile, mkdir, rm, cp } from "fs/promises"
import { existsSync } from "fs"
import { getInstalledPlugins } from "./plugin-loader"

const CONFIG_DIR = path.join(os.homedir(), ".config", "opencode")
const PLUGINS_DIR = path.join(CONFIG_DIR, "plugins")
const REGISTRY_PATH = path.join(CONFIG_DIR, "plugin-registry.json")

export type MarketplaceCategory = "all" | "tool" | "theme" | "agent" | "provider" | "language"

export interface MarketplaceEntry {
  id: string
  name: string
  version: string
  description: string
  author: string
  authorUrl?: string
  type: MarketplaceCategory
  icon?: string
  installs: number
  rating: number
  entry: string
  homepage?: string
  repository?: string
  screenshots?: string[]
  dependencies?: string[]
  changelog?: { version: string; date: string; changes: string }[]
  defaults?: Record<string, unknown>
  configSchema?: Record<string, { type: string; label: string; default?: unknown; description?: string }>
}

const DEFAULT_REGISTRY: MarketplaceEntry[] = [
  {
    id: "code-formatter",
    name: "Code Formatter",
    version: "1.2.0",
    description: "Auto-format code in multiple languages using configurable rules. Supports JavaScript, TypeScript, Python, Go, and Rust with per-project settings.",
    author: "zenkai-tools",
    type: "tool",
    icon: "wand",
    installs: 12840,
    rating: 4.7,
    entry: "index.js",
    homepage: "https://github.com/zenkai-tools/code-formatter",
    repository: "https://github.com/zenkai-tools/code-formatter",
    screenshots: [],
    dependencies: [],
    changelog: [
      { version: "1.2.0", date: "2026-07-15", changes: "Added Rust support and improved Python formatting" },
      { version: "1.1.0", date: "2026-06-01", changes: "Added Go support" },
      { version: "1.0.0", date: "2026-04-20", changes: "Initial release" },
    ],
    configSchema: {
      tabWidth: { type: "number", label: "Tab Width", default: 2, description: "Number of spaces per indentation level" },
      useTabs: { type: "boolean", label: "Use Tabs", default: false, description: "Indent with tabs instead of spaces" },
    },
  },
  {
    id: "dark-theme-pro",
    name: "Dark Theme Pro",
    version: "2.0.1",
    description: "A polished dark theme with carefully crafted contrast ratios and syntax highlighting colors optimized for long coding sessions.",
    author: "theme-studio",
    type: "theme",
    icon: "palette",
    installs: 34500,
    rating: 4.9,
    entry: "index.js",
    homepage: "https://github.com/theme-studio/dark-theme-pro",
    repository: "https://github.com/theme-studio/dark-theme-pro",
    screenshots: [],
    dependencies: [],
    changelog: [
      { version: "2.0.1", date: "2026-07-10", changes: "Fixed contrast issues in diff view" },
      { version: "2.0.0", date: "2026-05-15", changes: "Complete redesign with new palette" },
    ],
    configSchema: {
      variant: { type: "string", label: "Variant", default: "midnight", description: "Theme variant: midnight, charcoal, or abyss" },
    },
  },
  {
    id: "python-agent",
    name: "Python Agent",
    version: "0.9.3",
    description: "Specialized AI agent for Python development with deep knowledge of the ecosystem, virtual environments, package management, and testing frameworks.",
    author: "ai-agents-lab",
    type: "agent",
    icon: "bot",
    installs: 8720,
    rating: 4.5,
    entry: "index.js",
    homepage: "https://github.com/ai-agents-lab/python-agent",
    repository: "https://github.com/ai-agents-lab/python-agent",
    screenshots: [],
    dependencies: [],
    changelog: [
      { version: "0.9.3", date: "2026-07-20", changes: "Improved poetry and uv support" },
      { version: "0.9.0", date: "2026-06-10", changes: "Added pytest integration" },
    ],
    configSchema: {
      pythonPath: { type: "string", label: "Python Path", default: "python3", description: "Path to Python interpreter" },
    },
  },
  {
    id: "docker-tools",
    name: "Docker Tools",
    version: "1.5.0",
    description: "Manage Docker containers, images, and compose stacks directly from Zenkai. Includes Dockerfile generation, container logs, and resource monitoring.",
    author: "devops-plugins",
    type: "tool",
    icon: "container",
    installs: 21300,
    rating: 4.6,
    entry: "index.js",
    homepage: "https://github.com/devops-plugins/docker-tools",
    repository: "https://github.com/devops-plugins/docker-tools",
    screenshots: [],
    dependencies: [],
    changelog: [
      { version: "1.5.0", date: "2026-07-01", changes: "Added compose v2 support and resource monitoring" },
      { version: "1.4.0", date: "2026-05-20", changes: "Container log streaming" },
    ],
    configSchema: {
      dockerHost: { type: "string", label: "Docker Host", default: "unix:///var/run/docker.sock", description: "Docker daemon socket" },
    },
  },
  {
    id: "git-hooks",
    name: "Git Hooks Manager",
    version: "1.1.2",
    description: "Configure and manage Git hooks with a visual interface. Includes pre-commit linting, commit message validation, and pre-push test runners.",
    author: "zenkai-tools",
    type: "tool",
    icon: "git-branch",
    installs: 15600,
    rating: 4.4,
    entry: "index.js",
    homepage: "https://github.com/zenkai-tools/git-hooks",
    repository: "https://github.com/zenkai-tools/git-hooks",
    screenshots: [],
    dependencies: [],
    changelog: [
      { version: "1.1.2", date: "2026-07-05", changes: "Fixed hook path resolution on Windows" },
      { version: "1.1.0", date: "2026-06-15", changes: "Added commit message templates" },
      { version: "1.0.0", date: "2026-04-01", changes: "Initial release" },
    ],
    configSchema: {
      hooksDir: { type: "string", label: "Hooks Directory", default: ".githooks", description: "Directory for hook scripts" },
      runOnInstall: { type: "boolean", label: "Auto-install Hooks", default: true, description: "Automatically install hooks when plugin loads" },
    },
  },
]

async function ensureRegistry(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true })
  }
  if (!existsSync(REGISTRY_PATH)) {
    await writeFile(REGISTRY_PATH, JSON.stringify(DEFAULT_REGISTRY, null, 2), "utf-8")
  }
}

async function readRegistry(): Promise<MarketplaceEntry[]> {
  await ensureRegistry()
  try {
    const raw = await readFile(REGISTRY_PATH, "utf-8")
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data as MarketplaceEntry[]
  } catch {
    return []
  }
}

export interface SearchResult {
  entries: MarketplaceEntry[]
  total: number
  page: number
  pageSize: number
}

export async function searchPlugins(
  query?: string,
  category?: MarketplaceCategory,
  page = 1,
  pageSize = 20,
): Promise<SearchResult> {
  const all = await readRegistry()
  let filtered = all

  if (category && category !== "all") {
    filtered = filtered.filter((e) => e.type === category)
  }

  if (query) {
    const q = query.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.author.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q),
    )
  }

  const start = (page - 1) * pageSize
  const entries = filtered.slice(start, start + pageSize)

  return { entries, total: filtered.length, page, pageSize }
}

export async function getPluginDetail(id: string): Promise<MarketplaceEntry | undefined> {
  const all = await readRegistry()
  return all.find((e) => e.id === id)
}

export async function installPlugin(id: string): Promise<boolean> {
  const entry = await getPluginDetail(id)
  if (!entry) return false

  const pluginDir = path.join(PLUGINS_DIR, id)
  if (!existsSync(PLUGINS_DIR)) {
    await mkdir(PLUGINS_DIR, { recursive: true })
  }

  if (!existsSync(pluginDir)) {
    await mkdir(pluginDir, { recursive: true })
  }

  const manifest = {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    description: entry.description,
    author: entry.author,
    type: entry.type,
    entry: entry.entry,
  }
  await writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2), "utf-8")

  const stubContent = `export const plugin = {
  id: "${entry.id}",
  name: "${entry.name}",
  version: "${entry.version}",
  description: "${entry.description}",
  author: "${entry.author}",
  type: "${entry.type}",
  activate(context) {
    context.log("${entry.name} activated");
  },
  deactivate() {}
};
export default plugin;
`
  const entryPath = path.join(pluginDir, entry.entry)
  if (!existsSync(entryPath)) {
    await writeFile(entryPath, stubContent, "utf-8")
  }

  return true
}

export async function uninstallPlugin(id: string): Promise<boolean> {
  const pluginDir = path.join(PLUGINS_DIR, id)
  if (!existsSync(pluginDir)) return false

  try {
    await rm(pluginDir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

export interface UpdateInfo {
  id: string
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
}

export async function checkUpdates(): Promise<UpdateInfo[]> {
  const installed = await getInstalledPlugins()
  const registry = await readRegistry()
  const updates: UpdateInfo[] = []

  for (const manifest of installed) {
    const entry = registry.find((e) => e.id === manifest.id)
    if (!entry) continue

    updates.push({
      id: manifest.id,
      currentVersion: manifest.version,
      latestVersion: entry.version,
      hasUpdate: entry.version !== manifest.version,
    })
  }

  return updates
}

export async function getCategories(): Promise<{ id: MarketplaceCategory; label: string }[]> {
  return [
    { id: "all", label: "All" },
    { id: "tool", label: "Tools" },
    { id: "theme", label: "Themes" },
    { id: "agent", label: "Agents" },
    { id: "provider", label: "Providers" },
    { id: "language", label: "Languages" },
  ]
}
