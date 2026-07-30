import fs from "fs/promises"
import path from "path"
import { execSync } from "child_process"
import { searchIndex, type IndexChunk } from "../rag/indexer"
import { getRelevantMemories } from "../memory/memory-injection"

export type ContextItemType = "system" | "rag" | "memory" | "file" | "git"

export interface ContextItem {
  type: ContextItemType
  label: string
  content: string
  tokens: number
  relevance: number
}

export interface SmartContextResult {
  items: ContextItem[]
  totalTokens: number
  maxTokens: number
  truncated: boolean
}

export interface SmartContextOptions {
  maxTokens?: number
  includeGit?: boolean
  includeMemory?: boolean
  includeRag?: boolean
  activeFiles?: string[]
  systemPrompt?: string
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function prioritizeContext(items: ContextItem[], maxTokens: number): ContextItem[] {
  const sorted = [...items].sort((a, b) => {
    if (a.type === "system" && b.type !== "system") return -1
    if (b.type === "system" && a.type !== "system") return 1
    return b.relevance - a.relevance
  })

  const result: ContextItem[] = []
  let used = 0
  for (const item of sorted) {
    if (used + item.tokens <= maxTokens) {
      result.push(item)
      used += item.tokens
    } else {
      const remaining = maxTokens - used
      if (remaining > 100) {
        const ratio = remaining / item.tokens
        const truncatedContent = item.content.slice(0, Math.floor(item.content.length * ratio))
        result.push({
          ...item,
          content: truncatedContent,
          tokens: estimateTokens(truncatedContent),
        })
      }
      break
    }
  }
  return result
}

export async function getActiveFileContext(files: string[]): Promise<ContextItem[]> {
  const items: ContextItem[] = []
  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8")
      const truncated = content.length > 8000 ? content.slice(0, 8000) : content
      items.push({
        type: "file",
        label: path.basename(file),
        content: truncated,
        tokens: estimateTokens(truncated),
        relevance: 0.7,
      })
    } catch {
      continue
    }
  }
  return items
}

export function getGitContext(projectPath: string): ContextItem[] {
  const items: ContextItem[] = []

  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim()
    items.push({
      type: "git",
      label: `Branch: ${branch}`,
      content: `Current branch: ${branch}`,
      tokens: estimateTokens(branch),
      relevance: 0.3,
    })
  } catch {
    //
  }

  try {
    const log = execSync("git log --oneline -10", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim()
    if (log) {
      items.push({
        type: "git",
        label: "Recent commits",
        content: log,
        tokens: estimateTokens(log),
        relevance: 0.4,
      })
    }
  } catch {
    //
  }

  try {
    const diff = execSync("git diff --stat", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 5000,
    }).trim()
    if (diff) {
      items.push({
        type: "git",
        label: "Uncommitted changes",
        content: diff,
        tokens: estimateTokens(diff),
        relevance: 0.6,
      })
    }
  } catch {
    //
  }

  return items
}

function ragChunksToContextItems(chunks: IndexChunk[]): ContextItem[] {
  return chunks.map((chunk, i) => ({
    type: "rag" as ContextItemType,
    label: `${chunk.filePath} (L${chunk.startLine}-${chunk.endLine})`,
    content: chunk.content,
    tokens: estimateTokens(chunk.content),
    relevance: 1 - i * 0.1,
  }))
}

export async function buildSmartContext(
  query: string,
  projectPath: string,
  options: SmartContextOptions = {},
): Promise<SmartContextResult> {
  const maxTokens = options.maxTokens || 8192
  const items: ContextItem[] = []

  if (options.systemPrompt) {
    items.push({
      type: "system",
      label: "System Prompt",
      content: options.systemPrompt,
      tokens: estimateTokens(options.systemPrompt),
      relevance: 1.0,
    })
  }

  const promises: Promise<void>[] = []

  if (options.includeRag !== false) {
    promises.push(
      searchIndex(projectPath, query).then((chunks) => {
        items.push(...ragChunksToContextItems(chunks.slice(0, 5)))
      }),
    )
  }

  if (options.includeMemory !== false) {
    promises.push(
      getRelevantMemories(query, projectPath)
        .then((memText) => {
          if (memText) {
            items.push({
              type: "memory",
              label: "Persistent Memory",
              content: memText,
              tokens: estimateTokens(memText),
              relevance: 0.8,
            })
          }
        })
        // Un fallo de fs en memorias no debe tumbar TODO el ensamblado de contexto (RAG + archivos).
        .catch(() => {}),
    )
  }

  if (options.activeFiles && options.activeFiles.length > 0) {
    promises.push(
      getActiveFileContext(options.activeFiles).then((fileItems) => {
        items.push(...fileItems)
      }),
    )
  }

  await Promise.all(promises)

  if (options.includeGit !== false) {
    items.push(...getGitContext(projectPath))
  }

  const prioritized = prioritizeContext(items, maxTokens)
  const totalTokens = prioritized.reduce((sum, item) => sum + item.tokens, 0)

  return {
    items: prioritized,
    totalTokens,
    maxTokens,
    truncated: totalTokens < items.reduce((sum, item) => sum + item.tokens, 0),
  }
}

export * as SmartContext from "./smart-context"
