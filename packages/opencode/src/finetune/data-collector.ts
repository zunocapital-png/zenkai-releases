import fs from "fs/promises"
import path from "path"

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
])

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".turbo",
  "__pycache__", "target", ".cache", "coverage",
])

export interface PromptResponsePair {
  instruction: string
  input: string
  output: string
  source: string
  timestamp: string
}

export interface ShareGPTConversation {
  conversations: { from: "human" | "gpt"; value: string }[]
}

export interface DatasetStats {
  totalExamples: number
  avgInstructionLength: number
  avgOutputLength: number
  topicDistribution: Record<string, number>
  formats: { alpaca: number; sharegpt: number }
}

interface SessionMessage {
  role: string
  content: string
  createdAt?: string
}

async function readSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const home = process.env.USERPROFILE || process.env.HOME || ""
  const sessionDir = path.join(home, ".config", "opencode", "sessions", sessionId)
  let files: string[]
  try {
    files = await fs.readdir(sessionDir)
  } catch {
    return []
  }
  const messages: SessionMessage[] = []
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const raw = await fs.readFile(path.join(sessionDir, file), "utf-8")
      const parsed = JSON.parse(raw)
      if (parsed.role && parsed.content) {
        messages.push(parsed)
      }
    } catch {
      continue
    }
  }
  return messages
}

export async function collectFromSession(sessionId: string): Promise<PromptResponsePair[]> {
  const messages = await readSessionMessages(sessionId)
  const pairs: PromptResponsePair[] = []
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i]
    const next = messages[i + 1]
    if (msg.role === "user" && next.role === "assistant") {
      pairs.push({
        instruction: msg.content,
        input: "",
        output: next.content,
        source: `session:${sessionId}`,
        timestamp: msg.createdAt || new Date().toISOString(),
      })
      i++
    }
  }
  return pairs
}

async function walkDir(dir: string, files: string[]): Promise<void> {
  let entries: import("fs").Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDir(full, files)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SOURCE_EXTENSIONS.has(ext)) {
        files.push(full)
      }
    }
  }
}

function extractNamingConvention(content: string): string {
  const camelCase = (content.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g) || []).length
  const snakeCase = (content.match(/\b[a-z]+_[a-z]+\b/g) || []).length
  const pascalCase = (content.match(/\b[A-Z][a-zA-Z0-9]+\b/g) || []).length
  if (camelCase >= snakeCase && camelCase >= pascalCase) return "camelCase"
  if (snakeCase >= camelCase && snakeCase >= pascalCase) return "snake_case"
  return "PascalCase"
}

function extractImportStyle(content: string): string {
  const esm = (content.match(/^import\s/gm) || []).length
  const cjs = (content.match(/require\(/g) || []).length
  return esm >= cjs ? "esm" : "commonjs"
}

export async function collectFromProject(projectPath: string): Promise<PromptResponsePair[]> {
  const absPath = path.resolve(projectPath)
  const files: string[] = []
  await walkDir(absPath, files)

  const pairs: PromptResponsePair[] = []
  const patterns: Record<string, string[]> = {}

  for (const file of files.slice(0, 200)) {
    let content: string
    try {
      content = await fs.readFile(file, "utf-8")
    } catch {
      continue
    }
    const rel = path.relative(absPath, file)
    const ext = path.extname(file)
    const naming = extractNamingConvention(content)
    const importStyle = extractImportStyle(content)

    if (!patterns[ext]) patterns[ext] = []
    patterns[ext].push(`naming:${naming},imports:${importStyle}`)

    const functions = content.match(/(?:export\s+)?(?:async\s+)?function\s+\w+[^{]*\{[^}]{0,500}\}/g)
    if (functions) {
      for (const fn of functions.slice(0, 5)) {
        const nameMatch = fn.match(/function\s+(\w+)/)
        if (nameMatch) {
          pairs.push({
            instruction: `Write a ${ext.slice(1)} function named ${nameMatch[1]} following the project's ${naming} naming convention and ${importStyle} import style`,
            input: `File: ${rel}`,
            output: fn,
            source: `project:${rel}`,
            timestamp: new Date().toISOString(),
          })
        }
      }
    }
  }
  return pairs
}

export function formatAsAlpaca(
  pairs: PromptResponsePair[],
): { instruction: string; input: string; output: string }[] {
  return pairs.map((p) => ({
    instruction: p.instruction,
    input: p.input,
    output: p.output,
  }))
}

export function formatAsShareGPT(pairs: PromptResponsePair[]): ShareGPTConversation[] {
  return pairs.map((p) => ({
    conversations: [
      { from: "human" as const, value: p.input ? `${p.instruction}\n\n${p.input}` : p.instruction },
      { from: "gpt" as const, value: p.output },
    ],
  }))
}

export async function exportDataset(
  format: "alpaca" | "sharegpt",
  pairs: PromptResponsePair[],
  outputPath: string,
): Promise<number> {
  const formatted = format === "alpaca" ? formatAsAlpaca(pairs) : formatAsShareGPT(pairs)
  const lines = formatted.map((item) => JSON.stringify(item))
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, lines.join("\n"), "utf-8")
  return formatted.length
}

export function getDatasetStats(pairs: PromptResponsePair[]): DatasetStats {
  if (pairs.length === 0) {
    return {
      totalExamples: 0,
      avgInstructionLength: 0,
      avgOutputLength: 0,
      topicDistribution: {},
      formats: { alpaca: 0, sharegpt: 0 },
    }
  }
  const totalInstLen = pairs.reduce((sum, p) => sum + p.instruction.length, 0)
  const totalOutLen = pairs.reduce((sum, p) => sum + p.output.length, 0)

  const topics: Record<string, number> = {}
  for (const p of pairs) {
    const source = p.source.split(":")[0]
    topics[source] = (topics[source] || 0) + 1
  }

  return {
    totalExamples: pairs.length,
    avgInstructionLength: Math.round(totalInstLen / pairs.length),
    avgOutputLength: Math.round(totalOutLen / pairs.length),
    topicDistribution: topics,
    formats: { alpaca: pairs.length, sharegpt: pairs.length },
  }
}

export * as DataCollector from "./data-collector"
