import { searchIndex, type IndexChunk } from "./indexer"

const MAX_CHUNKS = 5
const SEPARATOR = "\n---\n"

function formatChunk(chunk: IndexChunk, index: number): string {
  const header = `[${index + 1}] ${chunk.filePath} (lines ${chunk.startLine}-${chunk.endLine})`
  return `${header}\n${chunk.content}`
}

export async function buildContext(query: string, projectPath: string): Promise<string> {
  const chunks = await searchIndex(projectPath, query)
  if (chunks.length === 0) {
    return ""
  }
  const top = chunks.slice(0, MAX_CHUNKS)
  const formatted = top.map((c, i) => formatChunk(c, i))
  const header = `## Relevant code context (${top.length} chunks)\n`
  return header + formatted.join(SEPARATOR)
}
