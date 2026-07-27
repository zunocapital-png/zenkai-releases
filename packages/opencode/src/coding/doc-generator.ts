import { Effect, Schema } from "effect"
import * as fs from "fs/promises"
import * as path from "path"
import { execFile } from "child_process"

export class DocError extends Schema.TaggedErrorClass<DocError>()("DocError", {
  reason: Schema.String,
}) {}

export type DocFormat = "markdown" | "jsdoc" | "python-docstring"

export type FunctionDoc = {
  name: string
  description: string
  params: Array<{ name: string; type: string; description: string }>
  returns: { type: string; description: string }
  throws?: string[]
  examples?: string[]
}

export type ApiEndpoint = {
  method: string
  path: string
  handler: string
  params?: string[]
  queryParams?: string[]
  bodyType?: string
  responseType?: string
  line: number
}

export type ChangelogEntry = {
  hash: string
  date: string
  author: string
  message: string
  type: "feat" | "fix" | "refactor" | "docs" | "chore" | "test" | "perf" | "breaking"
}

export type TypeDocEntry = {
  name: string
  kind: "type" | "interface" | "enum" | "class"
  line: number
  properties: Array<{ name: string; type: string; optional: boolean }>
  description: string
}

type ExecResult = {
  stdout: string
  stderr: string
  exitCode: number
}

function readFile(filePath: string): Effect.Effect<string, DocError> {
  return Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: (e) => new DocError({ reason: `Cannot read ${filePath}: ${e}` }),
  })
}

function exec(command: string, args: string[], cwd?: string): Effect.Effect<ExecResult, DocError> {
  return Effect.tryPromise({
    try: () =>
      new Promise<ExecResult>((resolve) => {
        execFile(command, args, { cwd, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
          resolve({
            stdout: stdout?.toString() ?? "",
            stderr: stderr?.toString() ?? "",
            exitCode: error ? (error as any).code ?? 1 : 0,
          })
        })
      }),
    catch: (e) => new DocError({ reason: `Failed to execute ${command}: ${e}` }),
  })
}

function extractFunctionInfo(content: string, functionName: string): {
  signature: string
  body: string
  line: number
} | null {
  const lines = content.split("\n")
  const patterns = [
    new RegExp(`^(\\s*)(export\\s+)?(async\\s+)?function\\s+${escapeRegex(functionName)}\\s*\\(([^)]*)\\)(?:\\s*:\\s*([^{]+))?\\s*\\{`),
    new RegExp(`^(\\s*)(export\\s+)?(?:const|let)\\s+${escapeRegex(functionName)}\\s*=\\s*(async\\s+)?\\(([^)]*)\\)(?:\\s*:\\s*([^=]+))?\\s*=>`),
  ]

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i].trimStart())) {
        let endLine = i
        let braceCount = 0
        let started = false
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") { braceCount++; started = true }
            if (ch === "}") braceCount--
          }
          if (started && braceCount <= 0) {
            endLine = j
            break
          }
        }
        return {
          signature: lines[i].trim(),
          body: lines.slice(i, endLine + 1).join("\n"),
          line: i + 1,
        }
      }
    }
  }
  return null
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseParams(signature: string): Array<{ name: string; type: string }> {
  const paramsMatch = signature.match(/\(([^)]*)\)/)
  if (!paramsMatch || !paramsMatch[1].trim()) return []

  return paramsMatch[1].split(",").map((p) => {
    const trimmed = p.trim()
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx >= 0) {
      return {
        name: trimmed.slice(0, colonIdx).replace(/[?]$/, "").trim(),
        type: trimmed.slice(colonIdx + 1).trim(),
      }
    }
    return { name: trimmed, type: "unknown" }
  })
}

function parseReturnType(signature: string, body: string): string {
  const retMatch = signature.match(/\)\s*:\s*(.+?)\s*[{=]/)
  if (retMatch) return retMatch[1].trim()

  if (body.includes("return ")) return "unknown"
  return "void"
}

function detectThrows(body: string): string[] {
  const throws: string[] = []
  const throwRe = /throw\s+new\s+(\w+)/g
  let match: RegExpExecArray | null
  while ((match = throwRe.exec(body)) !== null) {
    if (!throws.includes(match[1])) throws.push(match[1])
  }
  return throws
}

function inferDescription(name: string, body: string): string {
  const words = name.replace(/([A-Z])/g, " $1").toLowerCase().trim().split(/\s+/)

  if (words[0] === "get") return `Retrieves ${words.slice(1).join(" ")}`
  if (words[0] === "set") return `Sets ${words.slice(1).join(" ")}`
  if (words[0] === "is" || words[0] === "has" || words[0] === "can") {
    return `Checks if ${words.slice(1).join(" ")}`
  }
  if (words[0] === "create" || words[0] === "make" || words[0] === "build") {
    return `Creates ${words.slice(1).join(" ")}`
  }
  if (words[0] === "delete" || words[0] === "remove") {
    return `Removes ${words.slice(1).join(" ")}`
  }
  if (words[0] === "update") return `Updates ${words.slice(1).join(" ")}`
  if (words[0] === "find" || words[0] === "search") return `Finds ${words.slice(1).join(" ")}`
  if (words[0] === "parse") return `Parses ${words.slice(1).join(" ")}`
  if (words[0] === "validate") return `Validates ${words.slice(1).join(" ")}`
  if (words[0] === "format") return `Formats ${words.slice(1).join(" ")}`
  if (words[0] === "convert") return `Converts ${words.slice(1).join(" ")}`
  if (words[0] === "handle") return `Handles ${words.slice(1).join(" ")}`
  if (words[0] === "init" || words[0] === "initialize") return `Initializes ${words.slice(1).join(" ")}`
  if (words[0] === "load") return `Loads ${words.slice(1).join(" ")}`
  if (words[0] === "save") return `Saves ${words.slice(1).join(" ")}`
  if (words[0] === "send") return `Sends ${words.slice(1).join(" ")}`
  if (words[0] === "render") return `Renders ${words.slice(1).join(" ")}`

  return `${words.join(" ")}`
}

export const generateDocstring = Effect.fn("Doc.generateDocstring")(function* (
  filePath: string,
  functionName: string,
) {
  const content = yield* readFile(filePath)
  const info = extractFunctionInfo(content, functionName)

  if (!info) {
    yield* Effect.fail(new DocError({ reason: `Function "${functionName}" not found in ${filePath}` }))
    return undefined as never
  }

  const params = parseParams(info.signature)
  const returnType = parseReturnType(info.signature, info.body)
  const throws = detectThrows(info.body)
  const description = inferDescription(functionName, info.body)

  const language = filePath.endsWith(".py") ? "python" : "typescript"

  const doc: FunctionDoc = {
    name: functionName,
    description,
    params: params.map((p) => ({
      name: p.name,
      type: p.type,
      description: `The ${p.name.replace(/([A-Z])/g, " $1").toLowerCase().trim()}`,
    })),
    returns: {
      type: returnType,
      description: `The ${returnType === "void" ? "function returns nothing" : returnType.toLowerCase()}`,
    },
    throws: throws.length > 0 ? throws : undefined,
  }

  let output: string

  if (language === "python") {
    const lines = [`"""${description}`, ""]
    if (doc.params.length > 0) {
      lines.push("Args:")
      for (const p of doc.params) {
        lines.push(`    ${p.name} (${p.type}): ${p.description}`)
      }
      lines.push("")
    }
    if (returnType !== "void" && returnType !== "None") {
      lines.push("Returns:")
      lines.push(`    ${doc.returns.type}: ${doc.returns.description}`)
      lines.push("")
    }
    if (throws && throws.length > 0) {
      lines.push("Raises:")
      for (const t of throws) {
        lines.push(`    ${t}: If operation fails`)
      }
      lines.push("")
    }
    lines.push('"""')
    output = lines.join("\n")
  } else {
    const lines = [`/**`, ` * ${description}`, ` *`]
    for (const p of doc.params) {
      lines.push(` * @param ${p.name} - ${p.description}`)
    }
    if (returnType !== "void") {
      lines.push(` * @returns ${doc.returns.description}`)
    }
    if (throws) {
      for (const t of throws) {
        lines.push(` * @throws {${t}} If operation fails`)
      }
    }
    lines.push(` */`)
    output = lines.join("\n")
  }

  return { doc, output, line: info.line }
})

async function walkDir(dir: string, extensions: Set<string>): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "__pycache__") {
      continue
    }
    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath, extensions)))
    } else if (extensions.has(path.extname(entry.name))) {
      results.push(fullPath)
    }
  }
  return results
}

export const generateReadme = Effect.fn("Doc.generateReadme")(function* (projectPath: string) {
  const hasPkg = yield* Effect.tryPromise({
    try: () => fs.access(path.join(projectPath, "package.json")).then(() => true),
    catch: () => false,
  })

  let projectName = path.basename(projectPath)
  let description = ""
  let scripts: Record<string, string> = {}
  let deps: string[] = []
  let devDeps: string[] = []

  if (hasPkg) {
    const content = yield* readFile(path.join(projectPath, "package.json"))
    try {
      const pkg = JSON.parse(content)
      projectName = pkg.name || projectName
      description = pkg.description || ""
      scripts = pkg.scripts || {}
      deps = Object.keys(pkg.dependencies || {})
      devDeps = Object.keys(pkg.devDependencies || {})
    } catch {
      // malformed
    }
  }

  const hasPyReqs = yield* Effect.tryPromise({
    try: () => fs.access(path.join(projectPath, "requirements.txt")).then(() => true),
    catch: () => false,
  })

  const hasCargo = yield* Effect.tryPromise({
    try: () => fs.access(path.join(projectPath, "Cargo.toml")).then(() => true),
    catch: () => false,
  })

  const hasGoMod = yield* Effect.tryPromise({
    try: () => fs.access(path.join(projectPath, "go.mod")).then(() => true),
    catch: () => false,
  })

  const sections: string[] = []

  sections.push(`# ${projectName}`)
  sections.push("")
  if (description) {
    sections.push(description)
    sections.push("")
  }

  sections.push("## Getting Started")
  sections.push("")
  sections.push("### Prerequisites")
  sections.push("")
  if (hasPkg) sections.push("- Node.js >= 18")
  if (hasPyReqs) sections.push("- Python >= 3.10")
  if (hasCargo) sections.push("- Rust (latest stable)")
  if (hasGoMod) sections.push("- Go >= 1.22")
  sections.push("")

  sections.push("### Installation")
  sections.push("")
  sections.push("```bash")
  if (hasPkg) {
    sections.push("npm install")
  } else if (hasPyReqs) {
    sections.push("pip install -r requirements.txt")
  } else if (hasCargo) {
    sections.push("cargo build")
  } else if (hasGoMod) {
    sections.push("go mod download")
  }
  sections.push("```")
  sections.push("")

  if (Object.keys(scripts).length > 0) {
    sections.push("### Scripts")
    sections.push("")
    sections.push("| Command | Description |")
    sections.push("| --- | --- |")
    for (const [name, cmd] of Object.entries(scripts)) {
      sections.push(`| \`npm run ${name}\` | \`${cmd}\` |`)
    }
    sections.push("")
  }

  if (deps.length > 0) {
    sections.push("## Dependencies")
    sections.push("")
    for (const dep of deps) {
      sections.push(`- \`${dep}\``)
    }
    sections.push("")
  }

  sections.push("## Project Structure")
  sections.push("")
  sections.push("```")

  const topLevel = yield* Effect.tryPromise({
    try: () => fs.readdir(projectPath, { withFileTypes: true }),
    catch: () => [] as any[],
  })

  for (const entry of topLevel) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue
    const prefix = entry.isDirectory() ? "📁" : "📄"
    sections.push(`${prefix} ${entry.name}`)
  }
  sections.push("```")
  sections.push("")

  sections.push("## License")
  sections.push("")
  sections.push("MIT")
  sections.push("")

  return { content: sections.join("\n"), projectName }
})

export const generateApiDocs = Effect.fn("Doc.generateApiDocs")(function* (projectPath: string) {
  const extensions = new Set([".ts", ".js", ".py"])
  const files = yield* Effect.tryPromise({
    try: () => walkDir(projectPath, extensions),
    catch: (e) => new DocError({ reason: `Failed to scan project: ${e}` }),
  })

  const routeFiles = files.filter((f) => {
    const name = path.basename(f).toLowerCase()
    return name.includes("route") || name.includes("router") || name.includes("controller") ||
      name.includes("api") || name.includes("endpoint") || name.includes("view")
  })

  const endpoints: ApiEndpoint[] = []

  for (const file of routeFiles) {
    const content = yield* readFile(file)
    const lines = content.split("\n")

    const expressPatterns = [
      /\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]\s*,/i,
      /router\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/i,
    ]

    const nextjsPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/

    const fastapiPattern = /@(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of expressPatterns) {
        const match = lines[i].match(pattern)
        if (match) {
          endpoints.push({
            method: match[1].toUpperCase(),
            path: match[2],
            handler: file,
            line: i + 1,
          })
        }
      }

      const nextMatch = lines[i].match(nextjsPattern)
      if (nextMatch) {
        const relativePath = path.relative(projectPath, file)
        const routePath = "/" + relativePath
          .replace(/\\/g, "/")
          .replace(/^app\//, "")
          .replace(/\/route\.(ts|js)$/, "")
          .replace(/\[([^\]]+)\]/g, ":$1")
        endpoints.push({
          method: nextMatch[1],
          path: routePath,
          handler: file,
          line: i + 1,
        })
      }

      const fastapiMatch = lines[i].match(fastapiPattern)
      if (fastapiMatch) {
        endpoints.push({
          method: fastapiMatch[1].toUpperCase(),
          path: fastapiMatch[2],
          handler: file,
          line: i + 1,
        })
      }
    }
  }

  const sections: string[] = []
  sections.push("# API Documentation")
  sections.push("")
  sections.push(`Generated from ${routeFiles.length} route files.`)
  sections.push("")
  sections.push("## Endpoints")
  sections.push("")
  sections.push("| Method | Path | Handler | Line |")
  sections.push("| --- | --- | --- | --- |")

  for (const ep of endpoints) {
    const relHandler = path.relative(projectPath, ep.handler)
    sections.push(`| \`${ep.method}\` | \`${ep.path}\` | \`${relHandler}\` | ${ep.line} |`)
  }

  sections.push("")

  for (const ep of endpoints) {
    sections.push(`### ${ep.method} ${ep.path}`)
    sections.push("")
    sections.push(`**Handler:** \`${path.relative(projectPath, ep.handler)}:${ep.line}\``)
    sections.push("")
    sections.push("---")
    sections.push("")
  }

  return {
    content: sections.join("\n"),
    endpointCount: endpoints.length,
    routeFiles: routeFiles.length,
    endpoints,
  }
})

function categorizeCommit(message: string): ChangelogEntry["type"] {
  const lower = message.toLowerCase()
  if (lower.startsWith("feat") || lower.startsWith("add") || lower.startsWith("new")) return "feat"
  if (lower.startsWith("fix") || lower.startsWith("bug") || lower.startsWith("patch")) return "fix"
  if (lower.startsWith("refactor") || lower.startsWith("restructure")) return "refactor"
  if (lower.startsWith("doc") || lower.startsWith("readme")) return "docs"
  if (lower.startsWith("test")) return "test"
  if (lower.startsWith("perf") || lower.startsWith("optim")) return "perf"
  if (lower.includes("breaking") || lower.includes("BREAKING")) return "breaking"
  return "chore"
}

export const generateChangelog = Effect.fn("Doc.generateChangelog")(function* (
  projectPath: string,
  fromCommit: string,
  toCommit: string,
) {
  const result = yield* exec(
    "git",
    ["log", `${fromCommit}..${toCommit}`, "--pretty=format:%H|%aI|%an|%s"],
    projectPath,
  )

  if (result.exitCode !== 0) {
    yield* Effect.fail(new DocError({ reason: `Git log failed: ${result.stderr}` }))
  }

  const entries: ChangelogEntry[] = result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, date, author, ...messageParts] = line.split("|")
      const message = messageParts.join("|")
      return {
        hash: hash.slice(0, 7),
        date: date.split("T")[0],
        author,
        message,
        type: categorizeCommit(message),
      }
    })

  const grouped: Record<ChangelogEntry["type"], ChangelogEntry[]> = {
    breaking: [],
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    docs: [],
    test: [],
    chore: [],
  }

  for (const entry of entries) {
    grouped[entry.type].push(entry)
  }

  const sections: string[] = []
  sections.push(`# Changelog`)
  sections.push("")
  sections.push(`## ${fromCommit.slice(0, 7)}..${toCommit.slice(0, 7)}`)
  sections.push("")

  const labels: Record<string, string> = {
    breaking: "Breaking Changes",
    feat: "Features",
    fix: "Bug Fixes",
    perf: "Performance",
    refactor: "Refactoring",
    docs: "Documentation",
    test: "Tests",
    chore: "Chores",
  }

  for (const [type, label] of Object.entries(labels)) {
    const group = grouped[type as ChangelogEntry["type"]]
    if (group.length === 0) continue
    sections.push(`### ${label}`)
    sections.push("")
    for (const entry of group) {
      sections.push(`- ${entry.message} (\`${entry.hash}\`) — ${entry.author}, ${entry.date}`)
    }
    sections.push("")
  }

  return {
    content: sections.join("\n"),
    totalCommits: entries.length,
    entries,
  }
})

export const generateTypeDoc = Effect.fn("Doc.generateTypeDoc")(function* (filePath: string) {
  const content = yield* readFile(filePath)
  const lines = content.split("\n")
  const entries: TypeDocEntry[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()

    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)\s*=\s*\{/)
    if (typeMatch) {
      const properties: TypeDocEntry["properties"] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimStart().startsWith("}")) break
        const propMatch = lines[j].trimStart().match(/^(\w+)(\?)?:\s*(.+?)\s*;?\s*$/)
        if (propMatch) {
          properties.push({
            name: propMatch[1],
            type: propMatch[3],
            optional: !!propMatch[2],
          })
        }
      }
      entries.push({
        name: typeMatch[1],
        kind: "type",
        line: i + 1,
        properties,
        description: `Type ${typeMatch[1]}`,
      })
      continue
    }

    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/)
    if (interfaceMatch) {
      const properties: TypeDocEntry["properties"] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimStart().startsWith("}")) break
        const propMatch = lines[j].trimStart().match(/^(\w+)(\?)?:\s*(.+?)\s*;?\s*$/)
        if (propMatch) {
          properties.push({
            name: propMatch[1],
            type: propMatch[3],
            optional: !!propMatch[2],
          })
        }
      }
      entries.push({
        name: interfaceMatch[1],
        kind: "interface",
        line: i + 1,
        properties,
        description: `Interface ${interfaceMatch[1]}`,
      })
      continue
    }

    const enumMatch = trimmed.match(/^(?:export\s+)?enum\s+(\w+)/)
    if (enumMatch) {
      const properties: TypeDocEntry["properties"] = []
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimStart().startsWith("}")) break
        const memberMatch = lines[j].trimStart().match(/^(\w+)\s*(?:=\s*(.+?))?\s*,?\s*$/)
        if (memberMatch) {
          properties.push({
            name: memberMatch[1],
            type: memberMatch[2] ?? "auto",
            optional: false,
          })
        }
      }
      entries.push({
        name: enumMatch[1],
        kind: "enum",
        line: i + 1,
        properties,
        description: `Enum ${enumMatch[1]}`,
      })
    }
  }

  const sections: string[] = []
  sections.push(`# Type Documentation`)
  sections.push("")
  sections.push(`File: \`${path.basename(filePath)}\``)
  sections.push("")

  for (const entry of entries) {
    sections.push(`## ${entry.kind} ${entry.name}`)
    sections.push("")
    sections.push(`*Line ${entry.line}*`)
    sections.push("")

    if (entry.properties.length > 0) {
      sections.push("| Property | Type | Required |")
      sections.push("| --- | --- | --- |")
      for (const prop of entry.properties) {
        sections.push(`| \`${prop.name}\` | \`${prop.type}\` | ${prop.optional ? "No" : "Yes"} |`)
      }
      sections.push("")
    }
  }

  return {
    content: sections.join("\n"),
    entries,
    typeCount: entries.length,
  }
})
