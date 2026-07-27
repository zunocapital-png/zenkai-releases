export type StackFrame = {
  file: string
  line: number
  column?: number
  function: string
  code?: string
}

export type ParsedStack = {
  message: string
  frames: StackFrame[]
}

export type ErrorClass =
  | "syntax"
  | "runtime"
  | "type"
  | "reference"
  | "network"
  | "permission"
  | "memory"
  | "timeout"
  | "assertion"
  | "import"
  | "unknown"

const NODE_FRAME = /^\s+at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/
const PYTHON_FRAME = /^\s+File "(.+?)", line (\d+)(?:, in (.+))?$/
const GO_FRAME = /^\s+(.+?):(\d+)\s+(?:\+0x[0-9a-f]+)?$/
const RUST_FRAME = /^\s+(\d+):\s+(?:0x[0-9a-f]+\s+-\s+)?(.+?)(?::(\d+):(\d+))?$/
const JAVA_FRAME = /^\s+at\s+(.+?)(?:\((.+?):(\d+)\)|\((.+?)\))$/

function parseNodeStack(lines: string[]): StackFrame[] {
  const frames: StackFrame[] = []
  for (const line of lines) {
    const m = NODE_FRAME.exec(line)
    if (!m) continue
    frames.push({
      file: m[2],
      line: parseInt(m[3], 10),
      column: parseInt(m[4], 10),
      function: m[1] ?? "<anonymous>",
    })
  }
  return frames
}

function parsePythonStack(lines: string[]): StackFrame[] {
  const frames: StackFrame[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = PYTHON_FRAME.exec(lines[i])
    if (!m) continue
    const frame: StackFrame = {
      file: m[1],
      line: parseInt(m[2], 10),
      function: m[3] ?? "<module>",
    }
    if (i + 1 < lines.length && !PYTHON_FRAME.test(lines[i + 1]) && lines[i + 1].trim()) {
      frame.code = lines[i + 1].trim()
      i++
    }
    frames.push(frame)
  }
  return frames
}

function parseGoStack(lines: string[]): StackFrame[] {
  const frames: StackFrame[] = []
  for (let i = 0; i < lines.length; i++) {
    const funcLine = lines[i]
    if (!funcLine || funcLine.startsWith("\t") || funcLine.startsWith(" ")) continue
    if (i + 1 >= lines.length) continue
    const m = GO_FRAME.exec(lines[i + 1])
    if (!m) continue
    frames.push({
      file: m[1],
      line: parseInt(m[2], 10),
      function: funcLine.replace(/\(.*\)$/, "").trim(),
    })
    i++
  }
  return frames
}

function parseRustStack(lines: string[]): StackFrame[] {
  const frames: StackFrame[] = []
  for (const line of lines) {
    const m = RUST_FRAME.exec(line)
    if (!m) continue
    if (!m[2]) continue
    frames.push({
      file: m[2],
      line: m[3] ? parseInt(m[3], 10) : 0,
      column: m[4] ? parseInt(m[4], 10) : undefined,
      function: m[2].split("::").pop() ?? m[2],
    })
  }
  return frames
}

function parseJavaStack(lines: string[]): StackFrame[] {
  const frames: StackFrame[] = []
  for (const line of lines) {
    const m = JAVA_FRAME.exec(line)
    if (!m) continue
    frames.push({
      file: m[2] ?? m[4] ?? "Unknown",
      line: m[3] ? parseInt(m[3], 10) : 0,
      function: m[1],
    })
  }
  return frames
}

function detectLanguage(raw: string): "node" | "python" | "go" | "rust" | "java" {
  if (/^\s+at\s+/m.test(raw) && !JAVA_FRAME.test(raw)) return "node"
  if (/File ".+?", line \d+/m.test(raw)) return "python"
  if (/goroutine \d+/m.test(raw) || /\.go:\d+/m.test(raw)) return "go"
  if (/^\s+\d+:\s+0x[0-9a-f]+/m.test(raw)) return "rust"
  if (JAVA_FRAME.test(raw)) return "java"
  return "node"
}

export function parseStackTrace(raw: string): ParsedStack {
  const lines = raw.split("\n")
  const lang = detectLanguage(raw)

  let message = ""
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^\s+(at|File|goroutine|\d+:)/.test(line)) break
    message = message ? `${message}\n${trimmed}` : trimmed
  }

  const parsers = { node: parseNodeStack, python: parsePythonStack, go: parseGoStack, rust: parseRustStack, java: parseJavaStack }
  const frames = parsers[lang](lines)

  return { message, frames }
}

const ERROR_PATTERNS: Array<[RegExp, ErrorClass]> = [
  [/SyntaxError|ParseError|unexpected token|expected.*got/i, "syntax"],
  [/TypeError|is not a function|cannot read propert|undefined is not/i, "type"],
  [/ReferenceError|is not defined|NameError|undefined variable/i, "reference"],
  [/NetworkError|ECONNREFUSED|ENOTFOUND|fetch failed|CORS|ERR_CONNECTION/i, "network"],
  [/PermissionError|EACCES|EPERM|AccessDenied|forbidden/i, "permission"],
  [/OutOfMemoryError|heap.*out.*memory|ENOMEM|MemoryError/i, "memory"],
  [/TimeoutError|ETIMEDOUT|deadline exceeded|timed out/i, "timeout"],
  [/AssertionError|assertion failed|expect.*to.*equal/i, "assertion"],
  [/ImportError|ModuleNotFoundError|Cannot find module|ERR_MODULE_NOT_FOUND/i, "import"],
  [/RuntimeError|panic|SIGSEGV|segmentation fault/i, "runtime"],
]

export function classifyError(error: string): ErrorClass {
  for (const [pattern, cls] of ERROR_PATTERNS) {
    if (pattern.test(error)) return cls
  }
  return "unknown"
}

export function extractCodeContext(file: string, line: number, contextLines = 3): { lines: Array<{ num: number; text: string; current: boolean }> } | undefined {
  void file
  void line
  void contextLines
  return undefined
}

export function formatForAI(error: string, stackTrace: ParsedStack, codeContext?: ReturnType<typeof extractCodeContext>): string {
  const parts: string[] = []

  parts.push(`Error: ${error}`)
  parts.push(`Classification: ${classifyError(error)}`)

  if (stackTrace.message && stackTrace.message !== error) {
    parts.push(`Stack message: ${stackTrace.message}`)
  }

  if (stackTrace.frames.length > 0) {
    parts.push("\nStack trace:")
    for (const frame of stackTrace.frames.slice(0, 10)) {
      let entry = `  ${frame.function} (${frame.file}:${frame.line}`
      if (frame.column !== undefined) entry += `:${frame.column}`
      entry += ")"
      if (frame.code) entry += `\n    > ${frame.code}`
      parts.push(entry)
    }
  }

  if (codeContext) {
    parts.push("\nCode context:")
    for (const line of codeContext.lines) {
      const marker = line.current ? ">" : " "
      parts.push(`  ${marker} ${line.num} | ${line.text}`)
    }
  }

  return parts.join("\n")
}
