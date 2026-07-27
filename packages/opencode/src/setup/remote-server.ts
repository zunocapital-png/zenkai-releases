import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"
import os from "os"
import { existsSync } from "fs"
import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser"

export interface RemoteConnectionResult {
  ok: boolean
  models: string[]
  latency: number
  error?: string
}

export interface OllamaTagsResponse {
  models?: Array<{ name: string; size?: number; digest?: string }>
}

/**
 * Pings a remote Ollama API endpoint and returns available models with latency.
 */
export async function testRemoteConnection(url: string): Promise<RemoteConnectionResult> {
  const base = url.replace(/\/+$/, "")
  const endpoint = `${base}/api/tags`
  const start = performance.now()

  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    })

    const latency = Math.round(performance.now() - start)

    if (!res.ok) {
      return { ok: false, models: [], latency, error: `HTTP ${res.status}: ${res.statusText}` }
    }

    const data = (await res.json()) as OllamaTagsResponse
    const models = (data.models ?? []).map((m) => m.name)

    return { ok: true, models, latency }
  } catch (err) {
    const latency = Math.round(performance.now() - start)
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, models: [], latency, error: message }
  }
}

function configFilePath(): string {
  return path.join(os.homedir(), ".config", "opencode", "opencode.jsonc")
}

/**
 * Adds or updates a remote Ollama provider entry in the opencode config file.
 */
export async function configureRemoteProvider(url: string, apiKey?: string): Promise<void> {
  const configPath = configFilePath()
  const configDir = path.dirname(configPath)

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true })
  }

  let content = "{}"
  if (existsSync(configPath)) {
    content = await readFile(configPath, "utf-8")
  }

  const baseURL = url.replace(/\/+$/, "")

  const providerEntry: Record<string, unknown> = {
    id: "ollama-remote",
    api: "ollama",
    name: "Ollama Cloud",
    baseURL,
    models: {},
  }

  if (apiKey) {
    providerEntry.apiKey = apiKey
  }

  // Use jsonc-parser to safely modify the JSONC file preserving comments
  let edits = modify(content, ["provider", "ollama-remote"], providerEntry, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })

  content = applyEdits(content, edits)
  await writeFile(configPath, content, "utf-8")
}
