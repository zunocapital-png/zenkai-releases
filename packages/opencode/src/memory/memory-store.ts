import path from "path"
import fs from "fs/promises"
import { Global } from "@opencode-ai/core/global"
import crypto from "crypto"

const MEMORY_DIR = path.join(Global.Path.data, "memory")

export type MemoryType = "user" | "project" | "feedback" | "fact"

export interface Memory {
  id: string
  type: MemoryType
  content: string
  createdAt: string
  updatedAt: string
  tags: string[]
}

async function ensureDir() {
  await fs.mkdir(MEMORY_DIR, { recursive: true })
}

function memoryPath(id: string): string {
  return path.join(MEMORY_DIR, `${id}.json`)
}

export async function saveMemory(
  type: MemoryType,
  content: string,
  tags: string[] = [],
): Promise<Memory> {
  await ensureDir()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const memory: Memory = { id, type, content, createdAt: now, updatedAt: now, tags }
  await fs.writeFile(memoryPath(id), JSON.stringify(memory, null, 2), "utf-8")
  return memory
}

export async function getMemories(
  type?: MemoryType,
  tags?: string[],
): Promise<Memory[]> {
  await ensureDir()
  const files = await fs.readdir(MEMORY_DIR)
  const memories: Memory[] = []
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const raw = await fs.readFile(path.join(MEMORY_DIR, file), "utf-8")
      const memory: Memory = JSON.parse(raw)
      if (type && memory.type !== type) continue
      if (tags && tags.length > 0 && !tags.some((t) => memory.tags.includes(t))) continue
      memories.push(memory)
    } catch {
      // skip malformed files
    }
  }
  return memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function searchMemories(query: string): Promise<Memory[]> {
  const all = await getMemories()
  const lower = query.toLowerCase()
  const terms = lower.split(/\s+/).filter(Boolean)
  return all.filter((m) => {
    const text = `${m.content} ${m.tags.join(" ")}`.toLowerCase()
    return terms.every((term) => text.includes(term))
  })
}

export async function deleteMemory(id: string): Promise<boolean> {
  try {
    await fs.unlink(memoryPath(id))
    return true
  } catch {
    return false
  }
}

export async function getMemoryById(id: string): Promise<Memory | undefined> {
  try {
    const raw = await fs.readFile(memoryPath(id), "utf-8")
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export * as MemoryStore from "./memory-store"
