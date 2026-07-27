import { estimateTokens } from "./smart-context"

export type Message = {
  role: "user" | "assistant" | "system"
  content: string
  timestamp?: number
}

export type CompressedContext = {
  messages: Message[]
  summary: string
  totalTokens: number
  originalCount: number
  compressedCount: number
}

export type KeyFact = {
  fact: string
  source: "user" | "assistant"
  importance: "high" | "medium" | "low"
  timestamp?: number
}

export { estimateTokens as estimateTokenCount }

function scoreSentence(sentence: string): number {
  let score = 0
  if (/[\/\\][\w.\-]+(?:[\/\\][\w.\-]+)+/.test(sentence)) score += 3
  if (/`[^`]+`/.test(sentence)) score += 2
  if (/\b(error|fix|bug|issue|fail|crash|resolve)\b/i.test(sentence)) score += 2
  if (/\b(function|class|interface|type|import|export|const|let|var)\b/.test(sentence)) score += 2
  if (/https?:\/\/\S+/.test(sentence)) score += 1
  if (/\b(decided?|should|must|let's|we'll|i'll|agreed)\b/i.test(sentence)) score += 2
  if (sentence.length > 20 && sentence.length < 300) score += 1
  return score
}

function extractSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|(?:\n\s*\n)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
}

function generateSummary(messages: Message[]): string {
  const allSentences: { text: string; score: number }[] = []

  for (const msg of messages) {
    const sentences = extractSentences(msg.content)
    for (const s of sentences) {
      allSentences.push({ text: s, score: scoreSentence(s) })
    }
  }

  allSentences.sort((a, b) => b.score - a.score)

  const picked = allSentences.slice(0, 10).map((s) => s.text)
  return picked.join(" ")
}

export async function compressContext(
  messages: Message[],
  maxTokens: number,
): Promise<CompressedContext> {
  const systemMessages = messages.filter((m) => m.role === "system")
  const nonSystem = messages.filter((m) => m.role !== "system")

  const systemTokens = systemMessages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  )
  const available = maxTokens - systemTokens

  let recentCount = nonSystem.length
  let recentTokens = nonSystem.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  )

  while (recentTokens > available && recentCount > 2) {
    recentCount--
    recentTokens = nonSystem
      .slice(nonSystem.length - recentCount)
      .reduce((sum, m) => sum + estimateTokens(m.content), 0)
  }

  const older = nonSystem.slice(0, nonSystem.length - recentCount)
  const recent = nonSystem.slice(nonSystem.length - recentCount)
  const summary = older.length > 0 ? generateSummary(older) : ""

  const summaryMessage: Message[] =
    summary.length > 0
      ? [{ role: "system", content: `[Conversation summary]: ${summary}` }]
      : []

  const result = [...systemMessages, ...summaryMessage, ...recent]
  const totalTokens = result.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  )

  return {
    messages: result,
    summary,
    totalTokens,
    originalCount: messages.length,
    compressedCount: result.length,
  }
}

export async function summarizeOlderMessages(
  messages: Message[],
  keepRecent: number,
): Promise<CompressedContext> {
  const systemMessages = messages.filter((m) => m.role === "system")
  const nonSystem = messages.filter((m) => m.role !== "system")

  const cutoff = Math.max(0, nonSystem.length - keepRecent)
  const older = nonSystem.slice(0, cutoff)
  const recent = nonSystem.slice(cutoff)
  const summary = older.length > 0 ? generateSummary(older) : ""

  const summaryMessage: Message[] =
    summary.length > 0
      ? [{ role: "system", content: `[Conversation summary]: ${summary}` }]
      : []

  const result = [...systemMessages, ...summaryMessage, ...recent]
  const totalTokens = result.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  )

  return {
    messages: result,
    summary,
    totalTokens,
    originalCount: messages.length,
    compressedCount: result.length,
  }
}

export async function slideWindowWithSummary(
  messages: Message[],
  windowSize: number,
): Promise<CompressedContext> {
  const systemMessages = messages.filter((m) => m.role === "system")
  const nonSystem = messages.filter((m) => m.role !== "system")

  if (nonSystem.length <= windowSize) {
    const totalTokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    )
    return {
      messages: [...messages],
      summary: "",
      totalTokens,
      originalCount: messages.length,
      compressedCount: messages.length,
    }
  }

  const overflow = nonSystem.slice(0, nonSystem.length - windowSize)
  const window = nonSystem.slice(nonSystem.length - windowSize)
  const summary = generateSummary(overflow)

  const summaryMessage: Message = {
    role: "system",
    content: `[Sliding window summary]: ${summary}`,
  }

  const result = [...systemMessages, summaryMessage, ...window]
  const totalTokens = result.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  )

  return {
    messages: result,
    summary,
    totalTokens,
    originalCount: messages.length,
    compressedCount: result.length,
  }
}

const FILE_PATH_RE = /(?:[a-zA-Z]:)?[\/\\][\w.\-]+(?:[\/\\][\w.\-]+)+/g
const FUNCTION_RE = /\b(?:function|def|fn|func)\s+([\w$]+)/g
const CLASS_RE = /\b(?:class|interface|type|enum)\s+([\w$]+)/g
const ERROR_RE = /(?:Error|Exception|FAIL|ERR)[:\s].*?(?=[.!?\n]|$)/gi
const URL_RE = /https?:\/\/[^\s)>"]+/g
const DECISION_RE =
  /(?:let's|we should|i'll|we'll|decided to|agreed to|going to)\s+[^.!?\n]+[.!?]?/gi

export function extractKeyFacts(messages: Message[]): KeyFact[] {
  const facts: KeyFact[] = []

  for (const msg of messages) {
    if (msg.role === "system") continue

    const source = msg.role as "user" | "assistant"
    const content = msg.content

    const paths = content.match(FILE_PATH_RE)
    if (paths) {
      for (const p of [...new Set(paths)]) {
        facts.push({
          fact: `File path referenced: ${p}`,
          source,
          importance: "medium",
          timestamp: msg.timestamp,
        })
      }
    }

    let match: RegExpExecArray | null
    const fnRe = new RegExp(FUNCTION_RE.source, FUNCTION_RE.flags)
    while ((match = fnRe.exec(content)) !== null) {
      facts.push({
        fact: `Function defined: ${match[1]}`,
        source,
        importance: "medium",
        timestamp: msg.timestamp,
      })
    }

    const clsRe = new RegExp(CLASS_RE.source, CLASS_RE.flags)
    while ((match = clsRe.exec(content)) !== null) {
      facts.push({
        fact: `Type/class defined: ${match[1]}`,
        source,
        importance: "medium",
        timestamp: msg.timestamp,
      })
    }

    const errors = content.match(ERROR_RE)
    if (errors) {
      for (const e of errors.slice(0, 5)) {
        facts.push({
          fact: e.trim(),
          source,
          importance: "high",
          timestamp: msg.timestamp,
        })
      }
    }

    const urls = content.match(URL_RE)
    if (urls) {
      for (const u of [...new Set(urls)]) {
        facts.push({
          fact: `URL referenced: ${u}`,
          source,
          importance: "low",
          timestamp: msg.timestamp,
        })
      }
    }

    const decisions = content.match(DECISION_RE)
    if (decisions) {
      for (const d of decisions) {
        facts.push({
          fact: d.trim(),
          source,
          importance: "high",
          timestamp: msg.timestamp,
        })
      }
    }
  }

  return facts
}

export * as LongContext from "./long-context"
