import { SessionID, MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { Database } from "@opencode-ai/core/database/database"
import { MessageTable, PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { eq, asc } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([A-Za-z0-9_\-]{16,})['"]?/gi,
  /(?:secret|token|password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi,
  /(?:sk|pk)[-_](?:live|test|prod)[-_][A-Za-z0-9]{16,}/gi,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g,
  /xox[bporsca]-[A-Za-z0-9\-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
  /Bearer\s+[A-Za-z0-9_\-.]{20,}/gi,
]

export const ExportFormat = Schema.Literal("zenkai-session", "markdown", "json")
export type ExportFormat = Schema.Schema.Type<typeof ExportFormat>

export const ExportOptions = Schema.Struct({
  format: ExportFormat,
  includeResponses: Schema.Boolean,
  includeToolOutputs: Schema.Boolean,
  includeFileChanges: Schema.Boolean,
  includeTimestamps: Schema.Boolean,
  redactSecrets: Schema.Boolean,
})
export type ExportOptions = Schema.Schema.Type<typeof ExportOptions>

const SessionSnapshot = Schema.Struct({
  id: SessionID,
  title: Schema.String,
  messageCount: Schema.Number,
  firstMessage: Schema.optional(Schema.String),
  lastMessage: Schema.optional(Schema.String),
  cost: Schema.optional(Schema.Number),
  tokensInput: Schema.optional(Schema.Number),
  tokensOutput: Schema.optional(Schema.Number),
  timeCreated: Schema.Number,
  timeUpdated: Schema.Number,
})
export type SessionSnapshot = Schema.Schema.Type<typeof SessionSnapshot>

const ExportedMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.String,
  content: Schema.String,
  time: Schema.optional(Schema.Number),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
})
type ExportedMessage = Schema.Schema.Type<typeof ExportedMessage>

const ExportedPart = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  content: Schema.Any,
  tool: Schema.optional(Schema.String),
  time: Schema.optional(Schema.Number),
})

const ExportedSession = Schema.Struct({
  version: Schema.Literal("1"),
  exportedAt: Schema.Number,
  session: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    model: Schema.optional(Schema.Any),
    cost: Schema.optional(Schema.Number),
    tokens: Schema.optional(Schema.Any),
    timeCreated: Schema.Number,
    timeUpdated: Schema.Number,
  }),
  messages: Schema.Array(ExportedMessage),
  parts: Schema.optional(Schema.Array(ExportedPart)),
})
export type ExportedSession = Schema.Schema.Type<typeof ExportedSession>

export function redactSecrets(content: string): string {
  let result = content
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, "[REDACTED]")
  }
  return result
}

function extractTextFromParts(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n")
}

export const exportSession = Effect.fn("Collab.exportSession")(function* (
  sessionID: SessionID,
  options: ExportOptions,
) {
  const db = yield* Database
  const drizzle = db.drizzle

  const [sessionRow] = yield* Effect.promise(() =>
    drizzle.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).limit(1),
  )
  if (!sessionRow) throw new Error(`Session not found: ${sessionID}`)

  const messageRows = yield* Effect.promise(() =>
    drizzle
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.session_id, sessionID))
      .orderBy(asc(MessageTable.time_created)),
  )

  const partRows = yield* Effect.promise(() =>
    drizzle
      .select()
      .from(PartTable)
      .where(eq(PartTable.session_id, sessionID))
      .orderBy(asc(PartTable.time_created)),
  )

  const partsByMessage = new Map<string, typeof partRows>()
  for (const part of partRows) {
    const arr = partsByMessage.get(part.message_id) ?? []
    arr.push(part)
    partsByMessage.set(part.message_id, arr)
  }

  const messages: ExportedMessage[] = []
  for (const msg of messageRows) {
    if (!options.includeResponses && msg.role === "assistant") continue

    const msgParts = partsByMessage.get(msg.id) ?? []
    let content = extractTextFromParts(msgParts as Array<{ type: string; text?: string }>)
    if (options.redactSecrets) content = redactSecrets(content)

    messages.push({
      id: msg.id,
      role: msg.role,
      content,
      time: options.includeTimestamps ? msg.time_created : undefined,
      agent: msg.agent ?? undefined,
      model: msg.model?.id ?? undefined,
    })
  }

  const exportedParts: Array<Schema.Schema.Type<typeof ExportedPart>> = []
  if (options.includeToolOutputs || options.includeFileChanges) {
    for (const part of partRows) {
      const typedPart = part as { type: string; tool?: string; input?: unknown; output?: unknown }
      if (typedPart.type === "tool" && options.includeToolOutputs) {
        let content: unknown = { input: typedPart.input, output: typedPart.output }
        if (options.redactSecrets && typeof content === "string") {
          content = redactSecrets(content)
        }
        exportedParts.push({
          id: part.id,
          type: part.type,
          content,
          tool: typedPart.tool,
          time: options.includeTimestamps ? part.time_created : undefined,
        })
      }
    }
  }

  const result: ExportedSession = {
    version: "1",
    exportedAt: Date.now(),
    session: {
      id: sessionRow.id,
      title: sessionRow.title,
      model: sessionRow.model,
      cost: sessionRow.cost,
      tokens: {
        input: sessionRow.tokens_input,
        output: sessionRow.tokens_output,
      },
      timeCreated: sessionRow.time_created,
      timeUpdated: sessionRow.time_updated,
    },
    messages,
    parts: exportedParts.length > 0 ? exportedParts : undefined,
  }

  return result
})

export const importSession = Effect.fn("Collab.importSession")(function* (data: ExportedSession) {
  const session = yield* Session.Service
  const created = yield* session.create({
    title: `[Imported] ${data.session.title}`,
  })
  return created
})

export const exportAsMarkdown = Effect.fn("Collab.exportAsMarkdown")(function* (
  sessionID: SessionID,
) {
  const exported = yield* exportSession(sessionID, {
    format: "markdown",
    includeResponses: true,
    includeToolOutputs: false,
    includeFileChanges: false,
    includeTimestamps: true,
    redactSecrets: true,
  })

  const lines: string[] = []
  lines.push(`# ${exported.session.title}`)
  lines.push("")
  lines.push(`*Exported from Zenkai on ${new Date(exported.exportedAt).toISOString()}*`)
  lines.push("")

  if (exported.session.cost) {
    lines.push(`**Cost:** $${exported.session.cost.toFixed(4)}`)
  }
  if (exported.session.tokens) {
    const t = exported.session.tokens as { input: number; output: number }
    lines.push(`**Tokens:** ${t.input} in / ${t.output} out`)
  }
  lines.push("")
  lines.push("---")
  lines.push("")

  for (const msg of exported.messages) {
    const role = msg.role === "user" ? "User" : "Assistant"
    if (msg.time) {
      lines.push(`### ${role} — ${new Date(msg.time).toLocaleString()}`)
    } else {
      lines.push(`### ${role}`)
    }
    lines.push("")
    lines.push(msg.content)
    lines.push("")
    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
})

export const createSessionSnapshot = Effect.fn("Collab.createSessionSnapshot")(function* (
  sessionID: SessionID,
) {
  const db = yield* Database
  const drizzle = db.drizzle

  const [sessionRow] = yield* Effect.promise(() =>
    drizzle.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).limit(1),
  )
  if (!sessionRow) throw new Error(`Session not found: ${sessionID}`)

  const messageRows = yield* Effect.promise(() =>
    drizzle
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.session_id, sessionID))
      .orderBy(asc(MessageTable.time_created)),
  )

  const partRows = yield* Effect.promise(() =>
    drizzle
      .select()
      .from(PartTable)
      .where(eq(PartTable.session_id, sessionID))
      .orderBy(asc(PartTable.time_created)),
  )

  const firstMsg = messageRows[0]
  const lastMsg = messageRows[messageRows.length - 1]

  const firstParts = firstMsg ? partRows.filter((p) => p.message_id === firstMsg.id) : []
  const lastParts = lastMsg ? partRows.filter((p) => p.message_id === lastMsg.id) : []

  const firstText = extractTextFromParts(firstParts as Array<{ type: string; text?: string }>)
  const lastText = extractTextFromParts(lastParts as Array<{ type: string; text?: string }>)

  const snapshot: SessionSnapshot = {
    id: sessionID,
    title: sessionRow.title,
    messageCount: messageRows.length,
    firstMessage: firstText.slice(0, 300) || undefined,
    lastMessage: lastText.slice(0, 300) || undefined,
    cost: sessionRow.cost || undefined,
    tokensInput: sessionRow.tokens_input || undefined,
    tokensOutput: sessionRow.tokens_output || undefined,
    timeCreated: sessionRow.time_created,
    timeUpdated: sessionRow.time_updated,
  }

  return snapshot
})

export * as SessionSerializer from "./session-serializer"
