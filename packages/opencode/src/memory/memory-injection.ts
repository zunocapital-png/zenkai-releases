import { getMemories, type Memory } from "./memory-store"

export async function getRelevantMemories(
  userMessage: string,
  projectPath?: string,
): Promise<string> {
  const sections: string[] = []

  // Una sola lectura del directorio; particionamos por tipo en memoria (antes eran 4
  // readdir + re-parse de TODOS los .json por mensaje).
  const all = await getMemories()
  const userMems = all.filter((m) => m.type === "user")
  const feedbackMems = all.filter((m) => m.type === "feedback")
  const factMems = all.filter((m) => m.type === "fact")

  // Un tag matchea el proyecto solo si es un SEGMENTO de la ruta (no substring laxo:
  // tag '' matcheaba siempre y 'app' matcheaba cualquier ruta que contenga "app").
  const segmentos = new Set(projectPath ? projectPath.split(/[\\/]/).filter(Boolean) : [])
  const filteredProject = projectPath
    ? all.filter((m) => m.type === "project" && m.tags.some((t) => t !== "" && segmentos.has(t)))
    : []

  // User/feedback/project son preferencias globales: se inyectan SIEMPRE (deben aplicar
  // aunque no matcheen el mensaje). Los "Learned Facts" pueden crecer mucho y meter ruido:
  // si son muchos, quedamos con los mas relevantes al mensaje (overlap de palabras, sin
  // embeddings -> determinista y sin depender de Ollama).
  const relevantFacts = topRelevant(factMems, userMessage, 8)

  if (userMems.length > 0) {
    sections.push(formatSection("User Preferences", userMems))
  }
  if (filteredProject.length > 0) {
    sections.push(formatSection("Project Context", filteredProject))
  }
  if (feedbackMems.length > 0) {
    sections.push(formatSection("Previous Corrections", feedbackMems))
  }
  if (relevantFacts.length > 0) {
    sections.push(formatSection("Learned Facts", relevantFacts))
  }

  if (sections.length === 0) return ""

  return [
    "# Persistent Memory",
    "The following memories were saved from previous sessions:",
    "",
    ...sections,
  ].join("\n")
}

// Overlap de palabras (>=3 letras) entre un texto y el mensaje del usuario.
function overlap(content: string, message: string): number {
  const words = new Set(message.toLowerCase().match(/[a-záéíóúñ0-9]{3,}/gi) ?? [])
  if (words.size === 0) return 0
  let score = 0
  for (const w of content.toLowerCase().match(/[a-záéíóúñ0-9]{3,}/gi) ?? []) {
    if (words.has(w)) score++
  }
  return score
}

// Devuelve todos si son <= limit; si no, los mas relevantes al mensaje.
// Schwartzian: calculamos el score UNA vez por memoria (antes se recomputaba dentro del
// comparador, re-tokenizando el mensaje O(n log n) veces).
function topRelevant(memories: Memory[], message: string, limit: number): Memory[] {
  if (memories.length <= limit) return memories
  return memories
    .map((m) => ({ m, score: overlap(m.content, message) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m)
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
