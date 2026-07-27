import fs from "fs/promises"
import path from "path"

export interface ProjectConfig {
  instructions: string[]
  tools: Record<string, unknown>
  rules: string[]
  context: Record<string, unknown>
  raw: string
}

interface ParsedSections {
  instructions: string
  tools: string
  rules: string
  context: string
}

const CONFIG_FILENAME = ".zenkai.md"

const DEFAULT_TEMPLATE = `# Zenkai Project Configuration

## Instructions

Add project-specific instructions here. These will be injected into the system prompt.

## Tools

Define tool configurations in key: value format.

## Rules

Add coding rules and conventions for this project.

## Context

Add context about the project architecture, stack, and conventions.
`

function parseSections(raw: string): ParsedSections {
  const sections: ParsedSections = {
    instructions: "",
    tools: "",
    rules: "",
    context: "",
  }

  const sectionPattern = /^## (Instructions|Tools|Rules|Context)\s*$/gim
  const matches: { name: string; index: number }[] = []
  let match: RegExpExecArray | null

  while ((match = sectionPattern.exec(raw)) !== null) {
    matches.push({ name: match[1].toLowerCase(), index: match.index })
  }

  for (let i = 0; i < matches.length; i++) {
    const start = raw.indexOf("\n", matches[i].index) + 1
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    const content = raw.slice(start, end).trim()
    const key = matches[i].name as keyof ParsedSections
    if (key in sections) {
      sections[key] = content
    }
  }

  return sections
}

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
}

function parseKeyValues(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = text.split("\n").filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"))

  for (const line of lines) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim().replace(/^-\s*/, "")
    const value = line.slice(colonIndex + 1).trim()
    try {
      result[key] = JSON.parse(value)
    } catch {
      result[key] = value
    }
  }

  return result
}

function buildConfig(raw: string): ProjectConfig {
  const sections = parseSections(raw)

  return {
    instructions: parseLines(sections.instructions),
    tools: parseKeyValues(sections.tools),
    rules: parseLines(sections.rules),
    context: parseKeyValues(sections.context),
    raw,
  }
}

export async function loadProjectConfig(projectPath: string): Promise<ProjectConfig | null> {
  const configPath = path.join(projectPath, CONFIG_FILENAME)

  try {
    const raw = await fs.readFile(configPath, "utf-8")
    return buildConfig(raw)
  } catch {
    return null
  }
}

export async function getProjectInstructions(projectPath: string): Promise<string> {
  const config = await loadProjectConfig(projectPath)
  if (!config) return ""

  const parts: string[] = []

  if (config.instructions.length > 0) {
    parts.push(config.instructions.join("\n"))
  }

  if (config.rules.length > 0) {
    parts.push("Rules:\n" + config.rules.map((r) => `- ${r}`).join("\n"))
  }

  if (Object.keys(config.context).length > 0) {
    const contextLines = Object.entries(config.context).map(([k, v]) => `- ${k}: ${v}`)
    parts.push("Context:\n" + contextLines.join("\n"))
  }

  return parts.join("\n\n")
}

export async function createDefaultConfig(projectPath: string): Promise<string> {
  const configPath = path.join(projectPath, CONFIG_FILENAME)
  await fs.writeFile(configPath, DEFAULT_TEMPLATE, "utf-8")
  return configPath
}

export function mergeConfigs(global: ProjectConfig, project: ProjectConfig): ProjectConfig {
  const mergedInstructions = [...global.instructions, ...project.instructions]
  const mergedRules = [...global.rules, ...project.rules]
  const mergedTools = { ...global.tools, ...project.tools }
  const mergedContext = { ...global.context, ...project.context }

  return {
    instructions: mergedInstructions,
    tools: mergedTools,
    rules: mergedRules,
    context: mergedContext,
    raw: global.raw + "\n\n" + project.raw,
  }
}

export async function autoDetectConfig(projectPath: string): Promise<ProjectConfig | null> {
  let current = path.resolve(projectPath)

  while (true) {
    const config = await loadProjectConfig(current)
    if (config) return config

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

export * as ProjectConfig from "./project-config"
