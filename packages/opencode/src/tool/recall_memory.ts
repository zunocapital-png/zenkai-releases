import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./recall_memory.txt"
import { searchMemories, getMemories, type MemoryType } from "@/memory/memory-store"

const MemoryTypeSchema = Schema.Literals(["user", "project", "feedback", "fact"])

export const Parameters = Schema.Struct({
  query: Schema.optional(Schema.String).annotate({
    description: "Text to search for in memory content and tags",
  }),
  type: Schema.optional(MemoryTypeSchema).annotate({
    description: "Filter by memory type",
  }),
})

type Metadata = {
  count: number
}

export const RecallMemoryTool = Tool.define<typeof Parameters, Metadata, never>(
  "recall_memory",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (
        params: Schema.Schema.Type<typeof Parameters>,
        ctx: Tool.Context<Metadata>,
      ) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "recall_memory",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          let memories = params.query
            ? yield* Effect.promise(() => searchMemories(params.query!))
            : yield* Effect.promise(() => getMemories())

          if (params.type) {
            memories = memories.filter((m) => m.type === params.type)
          }

          if (memories.length === 0) {
            return {
              title: "No memories found",
              output: "No matching memories found.",
              metadata: { count: 0 },
            }
          }

          const output = memories
            .map(
              (m) =>
                `[${m.type}] ${m.content}${m.tags.length > 0 ? ` (tags: ${m.tags.join(", ")})` : ""} — ${m.updatedAt}`,
            )
            .join("\n")

          return {
            title: `${memories.length} memories`,
            output,
            metadata: { count: memories.length },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
