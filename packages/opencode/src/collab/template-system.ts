import { Effect, Schema } from "effect"
import fs from "fs/promises"
import path from "path"
import os from "os"

const TEMPLATES_DIR = path.join(os.homedir(), ".config", "opencode", "templates")

export const TemplateID = Schema.String.pipe(Schema.brand("TemplateID"))
export type TemplateID = Schema.Schema.Type<typeof TemplateID>

const Template = Schema.Struct({
  id: TemplateID,
  name: Schema.String,
  prompt: Schema.String,
  tags: Schema.Array(Schema.String),
  variables: Schema.Array(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})
export type Template = Schema.Schema.Type<typeof Template>

const TemplatePack = Schema.Struct({
  version: Schema.Literal("1"),
  exportedAt: Schema.Number,
  templates: Schema.Array(Template),
})
export type TemplatePack = Schema.Schema.Type<typeof TemplatePack>

function templateFilePath(id: TemplateID): string {
  return path.join(TEMPLATES_DIR, `${id}.json`)
}

function extractVariables(prompt: string): string[] {
  const matches = prompt.match(/\{\{(\w+)\}\}/g) ?? []
  return [...new Set(matches.map((m) => m.slice(2, -2)))]
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(TEMPLATES_DIR, { recursive: true })
}

export const saveTemplate = Effect.fn("Collab.saveTemplate")(function* (
  name: string,
  prompt: string,
  tags: string[] = [],
) {
  yield* Effect.promise(ensureDir)

  const id = TemplateID.make(`tpl_${Date.now().toString(36)}`)
  const now = Date.now()
  const variables = extractVariables(prompt)

  const template: Template = {
    id,
    name,
    prompt,
    tags,
    variables,
    createdAt: now,
    updatedAt: now,
  }

  yield* Effect.promise(() => fs.writeFile(templateFilePath(id), JSON.stringify(template, null, 2), "utf-8"))

  return template
})

export const listTemplates = Effect.fn("Collab.listTemplates")(function* (filter?: string) {
  yield* Effect.promise(ensureDir)

  const files = yield* Effect.promise(() => fs.readdir(TEMPLATES_DIR))
  const jsonFiles = files.filter((f) => f.endsWith(".json"))

  const templates: Template[] = []
  for (const file of jsonFiles) {
    try {
      const raw = yield* Effect.promise(() => fs.readFile(path.join(TEMPLATES_DIR, file), "utf-8"))
      const template = JSON.parse(raw) as Template
      if (filter) {
        const lower = filter.toLowerCase()
        const matches =
          template.name.toLowerCase().includes(lower) ||
          template.tags.some((t) => t.toLowerCase().includes(lower))
        if (!matches) continue
      }
      templates.push(template)
    } catch {
      continue
    }
  }

  return templates.sort((a, b) => b.updatedAt - a.updatedAt)
})

export const getTemplate = Effect.fn("Collab.getTemplate")(function* (id: TemplateID) {
  const raw = yield* Effect.promise(() => fs.readFile(templateFilePath(id), "utf-8"))
  return JSON.parse(raw) as Template
})

export const deleteTemplate = Effect.fn("Collab.deleteTemplate")(function* (id: TemplateID) {
  yield* Effect.promise(() => fs.unlink(templateFilePath(id)).catch(() => {}))
})

export const applyTemplate = Effect.fn("Collab.applyTemplate")(function* (
  id: TemplateID,
  variables: Record<string, string>,
) {
  const template = yield* getTemplate(id)
  let result = template.prompt
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
})

export const updateTemplate = Effect.fn("Collab.updateTemplate")(function* (
  id: TemplateID,
  updates: Partial<Pick<Template, "name" | "prompt" | "tags">>,
) {
  const template = yield* getTemplate(id)

  if (updates.name) template.name = updates.name
  if (updates.prompt) {
    template.prompt = updates.prompt
    template.variables = extractVariables(updates.prompt)
  }
  if (updates.tags) template.tags = updates.tags
  template.updatedAt = Date.now()

  yield* Effect.promise(() => fs.writeFile(templateFilePath(id), JSON.stringify(template, null, 2), "utf-8"))

  return template
})

export const exportTemplates = Effect.fn("Collab.exportTemplates")(function* () {
  const templates = yield* listTemplates()
  const pack: TemplatePack = {
    version: "1",
    exportedAt: Date.now(),
    templates,
  }
  return JSON.stringify(pack, null, 2)
})

export const importTemplates = Effect.fn("Collab.importTemplates")(function* (data: string) {
  const pack = JSON.parse(data) as TemplatePack
  if (pack.version !== "1") throw new Error(`Unsupported template pack version: ${pack.version}`)

  yield* Effect.promise(ensureDir)

  const imported: Template[] = []
  for (const template of pack.templates) {
    const newId = TemplateID.make(`tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`)
    const newTemplate: Template = {
      ...template,
      id: newId,
      updatedAt: Date.now(),
    }
    yield* Effect.promise(() =>
      fs.writeFile(templateFilePath(newId), JSON.stringify(newTemplate, null, 2), "utf-8"),
    )
    imported.push(newTemplate)
  }

  return imported
})

export * as TemplateSystem from "./template-system"
