import { Effect, Schema } from "effect"
import * as fs from "fs/promises"
import { execFile } from "child_process"

export class AutoFixError extends Schema.TaggedErrorClass<AutoFixError>()("AutoFixError", {
  reason: Schema.String,
}) {}

export type Language = "typescript" | "javascript" | "python" | "rust" | "go" | "java" | "c" | "cpp"

export type ErrorInfo = {
  language: Language
  type: string
  file: string
  line: number
  column: number
  message: string
  raw: string
}

export type FixResult = {
  fixed: boolean
  attempts: number
  errors: ErrorInfo[]
  finalOutput: string
}

type ExecResult = {
  stdout: string
  stderr: string
  exitCode: number
}

function exec(command: string, args: string[], cwd?: string): Effect.Effect<ExecResult, AutoFixError> {
  return Effect.tryPromise({
    try: () =>
      new Promise<ExecResult>((resolve) => {
        execFile(command, args, { cwd, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          resolve({
            stdout: stdout?.toString() ?? "",
            stderr: stderr?.toString() ?? "",
            exitCode: error ? (error as any).code ?? 1 : 0,
          })
        })
      }),
    catch: (e) => new AutoFixError({ reason: `Failed to execute ${command}: ${e}` }),
  })
}

const TS_ERROR_RE = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/
const ESLINT_ERROR_RE = /^\s*(\d+):(\d+)\s+error\s+(.+?)\s+(\S+)$/
const PYTHON_ERROR_RE = /File "(.+?)", line (\d+)/
const PYTHON_MSG_RE = /^(\w+Error): (.+)$/
const RUST_ERROR_RE = /error\[E(\d+)\]: (.+)\n\s*--> (.+?):(\d+):(\d+)/
const GO_ERROR_RE = /^(.+?):(\d+):(\d+): (.+)$/
const JAVA_ERROR_RE = /^(.+?):(\d+): error: (.+)$/
const C_ERROR_RE = /^(.+?):(\d+):(\d+): (?:error|fatal error): (.+)$/

function parseTypescriptErrors(stderr: string): ErrorInfo[] {
  const errors: ErrorInfo[] = []
  for (const line of stderr.split("\n")) {
    const match = line.match(TS_ERROR_RE)
    if (match) {
      errors.push({
        language: "typescript",
        type: match[4],
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[5],
        raw: line,
      })
    }
  }
  return errors
}

function parseJavascriptErrors(stderr: string): ErrorInfo[] {
  const errors: ErrorInfo[] = []
  for (const line of stderr.split("\n")) {
    const match = line.match(ESLINT_ERROR_RE)
    if (match) {
      errors.push({
        language: "javascript",
        type: match[4],
        file: "",
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
        message: match[3],
        raw: line,
      })
    }
  }
  return errors
}

function parsePythonErrors(stderr: string): ErrorInfo[] {
  const errors: ErrorInfo[] = []
  const lines = stderr.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const fileMatch = lines[i].match(PYTHON_ERROR_RE)
    if (fileMatch) {
      const msgLine = lines.findLast((l) => PYTHON_MSG_RE.test(l))
      const msgMatch = msgLine?.match(PYTHON_MSG_RE)
      errors.push({
        language: "python",
        type: msgMatch?.[1] ?? "Error",
        file: fileMatch[1],
        line: parseInt(fileMatch[2], 10),
        column: 0,
        message: msgMatch?.[2] ?? lines[i + 1]?.trim() ?? "",
        raw: lines.slice(i, i + 3).join("\n"),
      })
    }
  }
  return errors
}

function parseRustErrors(stderr: string): ErrorInfo[] {
  const errors: ErrorInfo[] = []
  const matches = stderr.matchAll(new RegExp(RUST_ERROR_RE.source, "gm"))
  for (const match of matches) {
    errors.push({
      language: "rust",
      type: `E${match[1]}`,
      file: match[3],
      line: parseInt(match[4], 10),
      column: parseInt(match[5], 10),
      message: match[2],
      raw: match[0],
    })
  }
  return errors
}

function parseGoErrors(stderr: string): ErrorInfo[] {
  const errors: ErrorInfo[] = []
  for (const line of stderr.split("\n")) {
    const match = line.match(GO_ERROR_RE)
    if (match) {
      errors.push({
        language: "go",
        type: "CompileError",
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[4],
        raw: line,
      })
    }
  }
  return errors
}

function parseJavaErrors(stderr: string): ErrorInfo[] {
  const errors: ErrorInfo[] = []
  for (const line of stderr.split("\n")) {
    const match = line.match(JAVA_ERROR_RE)
    if (match) {
      errors.push({
        language: "java",
        type: "CompileError",
        file: match[1],
        line: parseInt(match[2], 10),
        column: 0,
        message: match[3],
        raw: line,
      })
    }
  }
  return errors
}

function parseCErrors(stderr: string): ErrorInfo[] {
  const errors: ErrorInfo[] = []
  for (const line of stderr.split("\n")) {
    const match = line.match(C_ERROR_RE)
    if (match) {
      errors.push({
        language: "c",
        type: "CompileError",
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[4],
        raw: line,
      })
    }
  }
  return errors
}

export function parseError(stderr: string, language: Language): ErrorInfo[] {
  switch (language) {
    case "typescript":
      return parseTypescriptErrors(stderr)
    case "javascript":
      return parseJavascriptErrors(stderr)
    case "python":
      return parsePythonErrors(stderr)
    case "rust":
      return parseRustErrors(stderr)
    case "go":
      return parseGoErrors(stderr)
    case "java":
      return parseJavaErrors(stderr)
    case "c":
    case "cpp":
      return parseCErrors(stderr)
  }
}

export function generateFixPrompt(error: ErrorInfo, codeContext: string): string {
  return [
    `Fix the following ${error.language} error:`,
    ``,
    `Error: ${error.type} - ${error.message}`,
    `File: ${error.file}`,
    `Line: ${error.line}, Column: ${error.column}`,
    ``,
    `Code context:`,
    "```",
    codeContext,
    "```",
    ``,
    `Provide ONLY the corrected code for the affected region. No explanations.`,
  ].join("\n")
}

function getCodeContext(content: string, line: number, radius: number): string {
  const lines = content.split("\n")
  const start = Math.max(0, line - radius - 1)
  const end = Math.min(lines.length, line + radius)
  return lines
    .slice(start, end)
    .map((l, i) => `${start + i + 1} | ${l}`)
    .join("\n")
}

export const applyFix = Effect.fn("AutoFix.applyFix")(function* (
  filePath: string,
  fix: string,
) {
  yield* Effect.tryPromise({
    try: () => fs.writeFile(filePath, fix, "utf-8"),
    catch: (e) => new AutoFixError({ reason: `Failed to write fix to ${filePath}: ${e}` }),
  })
})

function detectLanguage(filePath: string): Language {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, Language> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
  }
  return map[ext] ?? "typescript"
}

function delay(ms: number): Effect.Effect<void> {
  return Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
}

export const runAutoFix = Effect.fn("AutoFix.runAutoFix")(function* (
  filePath: string,
  command: string,
  maxRetries: number = 5,
) {
  const parts = command.split(" ")
  const cmd = parts[0]
  const args = parts.slice(1)
  const language = detectLanguage(filePath)
  const allErrors: ErrorInfo[] = []
  let lastOutput = ""

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = yield* exec(cmd, args)
    lastOutput = result.stdout + result.stderr

    if (result.exitCode === 0) {
      return {
        fixed: true,
        attempts: attempt + 1,
        errors: allErrors,
        finalOutput: lastOutput,
      } satisfies FixResult
    }

    const errors = parseError(result.stderr || result.stdout, language)
    allErrors.push(...errors)

    if (errors.length === 0) {
      return {
        fixed: false,
        attempts: attempt + 1,
        errors: allErrors,
        finalOutput: lastOutput,
      } satisfies FixResult
    }

    const fileContent = yield* Effect.tryPromise({
      try: () => fs.readFile(filePath, "utf-8"),
      catch: (e) => new AutoFixError({ reason: `Cannot read ${filePath}: ${e}` }),
    })

    const firstError = errors[0]
    const context = getCodeContext(fileContent, firstError.line, 10)
    const _prompt = generateFixPrompt(firstError, context)

    if (attempt < maxRetries - 1) {
      const backoff = Math.min(1000 * Math.pow(2, attempt), 16_000)
      yield* delay(backoff)
    }
  }

  return {
    fixed: false,
    attempts: maxRetries,
    errors: allErrors,
    finalOutput: lastOutput,
  } satisfies FixResult
})
