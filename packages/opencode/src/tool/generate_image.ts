import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import DESCRIPTION from "./generate_image.txt"
import path from "path"
import fs from "fs/promises"

const ModelSchema = Schema.Literals(["flux", "turbo"])

export const Parameters = Schema.Struct({
  prompt: Schema.String.annotate({
    description: "Descripcion en ingles de la imagen a generar (mejor resultado en ingles)",
  }),
  width: Schema.optional(Schema.Number).annotate({
    description: "Ancho en pixeles (default 1024, max 1536)",
  }),
  height: Schema.optional(Schema.Number).annotate({
    description: "Alto en pixeles (default 1024, max 1536)",
  }),
  model: Schema.optional(ModelSchema).annotate({
    description: "Modelo de generacion: 'flux' (calidad, default) o 'turbo' (rapido)",
  }),
  filename: Schema.optional(Schema.String).annotate({
    description: "Nombre del archivo de salida (default: imagen generada con timestamp del prompt)",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

type Metadata = {
  path?: string
  model: string
  width: number
  height: number
}

// Pollinations.ai — generacion de imagenes GRATIS, sin API key.
const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"

function clampDim(value: number | undefined, fallback: number): number {
  if (!value || value <= 0) return fallback
  return Math.min(Math.max(Math.round(value), 64), 1536)
}

function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png"
  if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp"
  return "image/jpeg"
}

function slugify(prompt: string): string {
  return (
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "imagen"
  )
}

export const GenerateImageTool = Tool.define(
  "generate_image",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context

          yield* ctx.ask({
            permission: "write",
            patterns: ["*"],
            always: ["*"],
            metadata: { prompt: params.prompt },
          })

          const width = clampDim(params.width, 1024)
          const height = clampDim(params.height, 1024)
          const model = params.model ?? "flux"

          const url =
            `${POLLINATIONS_BASE}/${encodeURIComponent(params.prompt)}` +
            `?width=${width}&height=${height}&model=${model}&nologo=true&enhance=true`

          const bytes = yield* Effect.tryPromise({
            try: async () => {
              const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
              if (!res.ok) throw new Error(`Pollinations respondio ${res.status}`)
              return new Uint8Array(await res.arrayBuffer())
            },
            catch: (e) => new Error(`No se pudo generar la imagen: ${e instanceof Error ? e.message : String(e)}`),
          })

          const mime = sniffImageMime(bytes)
          const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"
          const name = params.filename ?? `${slugify(params.prompt)}.${ext}`
          const outPath = path.isAbsolute(name) ? name : path.join(instance.directory, name)

          yield* Effect.tryPromise({
            try: () => fs.writeFile(outPath, bytes),
            catch: (e) => new Error(`No se pudo guardar la imagen: ${e instanceof Error ? e.message : String(e)}`),
          })

          const base64 = Buffer.from(bytes).toString("base64")

          return {
            title: params.prompt,
            output: `Imagen generada (${width}x${height}, ${model}) y guardada en:\n${outPath}`,
            metadata: { path: outPath, model, width, height } satisfies Metadata,
            attachments: [
              {
                type: "file" as const,
                mime,
                url: `data:${mime};base64,${base64}`,
                filename: name,
              },
            ],
          }
        }).pipe(Effect.orDie),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
