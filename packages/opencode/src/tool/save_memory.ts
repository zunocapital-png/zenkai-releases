import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./save_memory.txt"
import { saveMemory, type MemoryType } from "@/memory/memory-store"

const MemoryTypeSchema = Schema.Literals(["user", "project", "feedback", "fact"])

export const Parameters = Schema.Struct({
  type: MemoryTypeSchema.annotate({
    description:
      'The type of memory: "user" for preferences, "project" for project context, "feedback" for corrections, "fact" for learned facts',
  }),
  content: Schema.String.annotate({
    description: "The content to remember",
  }),
  tags: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Optional tags for organizing and retrieving the memory later",
  }),
})

type Metadata = {
  memoryId: string
  type: string
}

export const SaveMemoryTool = Tool.define<typeof Parameters, Metadata, never>(
  "save_memory",
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
            permission: "save_memory",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          const memory = yield* Effect.promise(() =>
            saveMemory(
              params.type as MemoryType,
              params.content,
              params.tags ?? [],
            ),
          )

          return {
            title: `Saved ${params.type} memory`,
            output: `Memory saved successfully.\nID: ${memory.id}\nType: ${memory.type}\nContent: ${memory.content}\nTags: ${memory.tags.join(", ") || "(none)"}`,
            metadata: {
              memoryId: memory.id,
              type: memory.type,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
