import { getMemories, searchMemories, type Memory } from "./memory-store"

export async function getRelevantMemories(
  userMessage: string,
  projectPath?: string,
): Promise<string> {
  const sections: string[] = []

  const [userMems, feedbackMems, factMems, projectMems] = await Promise.all([
    getMemories("user"),
    getMemories("feedback"),
    getMemories("fact"),
    projectPath ? getMemories("project") : Promise.resolve([]),
  ])

  const filteredProject = projectPath
    ? projectMems.filter((m) => m.tags.some((t) => projectPath.includes(t)))
    : []

  if (userMems.length > 0) {
    sections.push(formatSection("User Preferences", userMems))
  }
  if (filteredProject.length > 0) {
    sections.push(formatSection("Project Context", filteredProject))
  }
  if (feedbackMems.length > 0) {
    sections.push(formatSection("Previous Corrections", feedbackMems))
  }
  if (factMems.length > 0) {
    sections.push(formatSection("Learned Facts", factMems))
  }

  if (sections.length === 0) return ""

  return [
    "# Persistent Memory",
    "The following memories were saved from previous sessions:",
    "",
    ...sections,
  ].join("\n")
}

function formatSection(title: string, memories: Memory[]): string {
  const lines = memories.map((m) => `- ${m.content}`)
  return [`## ${title}`, ...lines, ""].join("\n")
}

export function detectMemoryRequest(userMessage: string): boolean {
  const lower = userMessage.toLowerCase()
  const patterns = [
    /\bremember\b/,
    /\brecuerda\b/,
    /\bno olvides\b/,
    /\bdon'?t forget\b/,
    /\bkeep in mind\b/,
    /\bten en cuenta\b/,
    /\bnote that\b/,
    /\bsave.*memory\b/,
    /\bguarda.*memoria\b/,
  ]
  return patterns.some((p) => p.test(lower))
}

export * as MemoryInjection from "./memory-injection"
