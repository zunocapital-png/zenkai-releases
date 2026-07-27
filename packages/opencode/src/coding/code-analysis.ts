import { Effect, Schema } from "effect"
import * as fs from "fs/promises"
import * as path from "path"

export class AnalysisError extends Schema.TaggedErrorClass<AnalysisError>()("AnalysisError", {
  reason: Schema.String,
}) {}

export type Language = "typescript" | "javascript" | "python" | "go" | "rust" | "java"

export type FunctionInfo = {
  name: string
  line: number
  endLine: number
  params: string[]
  returnType: string
  isAsync: boolean
  isExported: boolean
  complexity: number
}

export type ClassInfo = {
  name: string
  line: number
  methods: string[]
  properties: string[]
  isExported: boolean
  superClass?: string
}

export type ImportInfo = {
  source: string
  specifiers: string[]
  isDefault: boolean
  isNamespace: boolean
  line: number
}

export type ExportInfo = {
  name: string
  type: "function" | "class" | "variable" | "type" | "default" | "re-export"
  line: number
}

export type FileAnalysis = {
  filePath: string
  language: Language
  lines: number
  functions: FunctionInfo[]
  classes: ClassInfo[]
  imports: ImportInfo[]
  exports: ExportInfo[]
  dependencies: string[]
  complexity: number
}

export type SecurityIssue = {
  type: string
  severity: "critical" | "high" | "medium" | "low"
  file: string
  line: number
  message: string
  suggestion: string
}

export type PerformanceHint = {
  type: string
  file: string
  line: number
  message: string
  suggestion: string
}

export type DependencyNode = {
  file: string
  imports: string[]
  importedBy: string[]
}

export type QualityScore = {
  file: string
  score: number
  breakdown: {
    complexity: number
    naming: number
    structure: number
    size: number
    documentation: number
  }
}

function readFile(filePath: string): Effect.Effect<string, AnalysisError> {
  return Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: (e) => new AnalysisError({ reason: `Cannot read ${filePath}: ${e}` }),
  })
}

function languageFromPath(filePath: string): Language {
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
  }
  return map[ext] ?? "typescript"
}

function calculateComplexity(body: string): number {
  let complexity = 1
  const keywords = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bwhile\b/g,
    /\bfor\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\b\?\?/g,
    /\?\./g,
    /&&/g,
    /\|\|/g,
    /\?\s*[^:]+\s*:/g,
  ]
  for (const kw of keywords) {
    const matches = body.match(kw)
    if (matches) complexity += matches.length
  }
  return complexity
}

function extractTSFunctions(content: string): FunctionInfo[] {
  const functions: FunctionInfo[] = []
  const lines = content.split("\n")

  const patterns = [
    /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/,
    /^(export\s+)?(?:const|let)\s+(\w+)\s*=\s*(async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/,
  ]

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    for (const pattern of patterns) {
      const match = trimmed.match(pattern)
      if (match) {
        const isFirst = pattern === patterns[0]
        const name = isFirst ? match[3] : match[2]
        const params = (isFirst ? match[4] : match[4]) || ""
        const retType = (isFirst ? match[5] : match[5]) || "void"
        const isAsync = isFirst ? !!match[2] : !!match[3]
        const isExported = !!match[1]

        let endLine = i + 1
        let braceCount = 0
        let started = false
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") {
              braceCount++
              started = true
            }
            if (ch === "}") braceCount--
          }
          if (started && braceCount <= 0) {
            endLine = j + 1
            break
          }
        }

        const body = lines.slice(i, endLine).join("\n")

        functions.push({
          name,
          line: i + 1,
          endLine,
          params: params ? params.split(",").map((p) => p.trim()) : [],
          returnType: retType.trim(),
          isAsync,
          isExported,
          complexity: calculateComplexity(body),
        })
        break
      }
    }
  }

  return functions
}

function extractTSClasses(content: string): ClassInfo[] {
  const classes: ClassInfo[] = []
  const lines = content.split("\n")
  const classRe = /^(export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*(?:implements\s+\w+)?\s*\{/

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trimStart().match(classRe)
    if (match) {
      const methods: string[] = []
      const properties: string[] = []
      let braceCount = 0
      let started = false

      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === "{") {
            braceCount++
            started = true
          }
          if (ch === "}") braceCount--
        }
        const methodMatch = lines[j].trimStart().match(/^(?:async\s+)?(\w+)\s*\(/)
        if (methodMatch && j !== i) methods.push(methodMatch[1])
        const propMatch = lines[j].trimStart().match(/^(?:readonly\s+)?(\w+)\s*[?]?:\s*/)
        if (propMatch) properties.push(propMatch[1])
        if (started && braceCount <= 0) break
      }

      classes.push({
        name: match[2],
        line: i + 1,
        methods,
        properties,
        isExported: !!match[1],
        superClass: match[3],
      })
    }
  }

  return classes
}

function extractTSImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = []
  const lines = content.split("\n")

  const namedRe = /^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/
  const defaultRe = /^import\s+(\w+)\s+from\s+["']([^"']+)["']/
  const namespaceRe = /^import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']/
  const sideEffectRe = /^import\s+["']([^"']+)["']/

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    let match: RegExpMatchArray | null

    match = trimmed.match(namespaceRe)
    if (match) {
      imports.push({
        source: match[2],
        specifiers: [match[1]],
        isDefault: false,
        isNamespace: true,
        line: i + 1,
      })
      continue
    }

    match = trimmed.match(namedRe)
    if (match) {
      imports.push({
        source: match[2],
        specifiers: match[1].split(",").map((s) => s.trim()).filter(Boolean),
        isDefault: false,
        isNamespace: false,
        line: i + 1,
      })
      continue
    }

    match = trimmed.match(defaultRe)
    if (match) {
      imports.push({
        source: match[2],
        specifiers: [match[1]],
        isDefault: true,
        isNamespace: false,
        line: i + 1,
      })
      continue
    }

    match = trimmed.match(sideEffectRe)
    if (match) {
      imports.push({
        source: match[1],
        specifiers: [],
        isDefault: false,
        isNamespace: false,
        line: i + 1,
      })
    }
  }

  return imports
}

function extractTSExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = []
  const lines = content.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()

    if (/^export\s+default\s+/.test(trimmed)) {
      exports.push({ name: "default", type: "default", line: i + 1 })
      continue
    }

    const fnMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)/)
    if (fnMatch) {
      exports.push({ name: fnMatch[1], type: "function", line: i + 1 })
      continue
    }

    const classMatch = trimmed.match(/^export\s+class\s+(\w+)/)
    if (classMatch) {
      exports.push({ name: classMatch[1], type: "class", line: i + 1 })
      continue
    }

    const typeMatch = trimmed.match(/^export\s+(?:type|interface)\s+(\w+)/)
    if (typeMatch) {
      exports.push({ name: typeMatch[1], type: "type", line: i + 1 })
      continue
    }

    const varMatch = trimmed.match(/^export\s+(?:const|let|var)\s+(\w+)/)
    if (varMatch) {
      exports.push({ name: varMatch[1], type: "variable", line: i + 1 })
      continue
    }

    if (/^export\s+\*/.test(trimmed) || /^export\s+\{/.test(trimmed)) {
      exports.push({ name: trimmed, type: "re-export", line: i + 1 })
    }
  }

  return exports
}

export const analyzeFile = Effect.fn("Analysis.analyzeFile")(function* (filePath: string) {
  const content = yield* readFile(filePath)
  const language = languageFromPath(filePath)
  const lines = content.split("\n").length

  let functions: FunctionInfo[] = []
  let classes: ClassInfo[] = []
  let imports: ImportInfo[] = []
  let exports: ExportInfo[] = []

  if (language === "typescript" || language === "javascript") {
    functions = extractTSFunctions(content)
    classes = extractTSClasses(content)
    imports = extractTSImports(content)
    exports = extractTSExports(content)
  }

  const dependencies = imports
    .filter((i) => !i.source.startsWith(".") && !i.source.startsWith("@/"))
    .map((i) => i.source)
  const totalComplexity = functions.reduce((sum, f) => sum + f.complexity, 0)

  return {
    filePath,
    language,
    lines,
    functions,
    classes,
    imports,
    exports,
    dependencies,
    complexity: totalComplexity,
  } satisfies FileAnalysis
})

async function walkDir(dir: string, extensions: Set<string>): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
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

export const findDeadCode = Effect.fn("Analysis.findDeadCode")(function* (projectPath: string) {
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])
  const files = yield* Effect.tryPromise({
    try: () => walkDir(projectPath, extensions),
    catch: (e) => new AnalysisError({ reason: `Failed to scan directory: ${e}` }),
  })

  const allExports = new Map<string, { file: string; name: string; line: number }>()
  const allImports = new Set<string>()

  for (const file of files) {
    const content = yield* readFile(file)
    const fileImports = extractTSImports(content)
    const fileExports = extractTSExports(content)

    for (const exp of fileExports) {
      if (exp.type !== "re-export" && exp.type !== "default") {
        allExports.set(`${file}:${exp.name}`, { file, name: exp.name, line: exp.line })
      }
    }

    for (const imp of fileImports) {
      for (const spec of imp.specifiers) {
        allImports.add(spec.replace(/\s+as\s+\w+/, "").trim())
      }
    }
  }

  const unused: Array<{ file: string; name: string; line: number }> = []
  for (const [, exp] of allExports) {
    if (!allImports.has(exp.name)) {
      unused.push(exp)
    }
  }

  return {
    projectPath,
    filesScanned: files.length,
    totalExports: allExports.size,
    unusedExports: unused,
  }
})

export const dependencyGraph = Effect.fn("Analysis.dependencyGraph")(function* (projectPath: string) {
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])
  const files = yield* Effect.tryPromise({
    try: () => walkDir(projectPath, extensions),
    catch: (e) => new AnalysisError({ reason: `Failed to scan directory: ${e}` }),
  })

  const graph = new Map<string, DependencyNode>()

  for (const file of files) {
    const relative = path.relative(projectPath, file)
    graph.set(relative, { file: relative, imports: [], importedBy: [] })
  }

  for (const file of files) {
    const content = yield* readFile(file)
    const imports = extractTSImports(content)
    const relative = path.relative(projectPath, file)
    const node = graph.get(relative)!

    for (const imp of imports) {
      if (imp.source.startsWith(".")) {
        const resolved = path.normalize(path.join(path.dirname(relative), imp.source))
        for (const ext of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"]) {
          const candidate = resolved + ext
          const target = graph.get(candidate)
          if (target) {
            node.imports.push(candidate)
            target.importedBy.push(relative)
            break
          }
        }
      }
    }
  }

  return {
    projectPath,
    nodes: [...graph.values()],
    totalFiles: files.length,
    totalEdges: [...graph.values()].reduce((sum, n) => sum + n.imports.length, 0),
  }
})

const SECURITY_PATTERNS: Array<{
  pattern: RegExp
  type: string
  severity: SecurityIssue["severity"]
  message: string
  suggestion: string
}> = [
  {
    pattern: /eval\s*\(/,
    type: "code-injection",
    severity: "critical",
    message: "Use of eval() can lead to code injection",
    suggestion: "Use JSON.parse() for data or Function constructor for controlled execution",
  },
  {
    pattern: /innerHTML\s*=/,
    type: "xss",
    severity: "high",
    message: "Direct innerHTML assignment can lead to XSS",
    suggestion: "Use textContent or a sanitization library like DOMPurify",
  },
  {
    pattern: /document\.write\s*\(/,
    type: "xss",
    severity: "high",
    message: "document.write can lead to XSS vulnerabilities",
    suggestion: "Use DOM manipulation methods instead",
  },
  {
    pattern: /(?:password|secret|api_key|apikey|token|private_key)\s*[=:]\s*["'`][^"'`]+["'`]/i,
    type: "hardcoded-secret",
    severity: "critical",
    message: "Potential hardcoded secret or credential",
    suggestion: "Use environment variables or a secrets manager",
  },
  {
    pattern: /Math\.random\s*\(\)/,
    type: "insecure-random",
    severity: "medium",
    message: "Math.random() is not cryptographically secure",
    suggestion: "Use crypto.randomUUID() or crypto.getRandomValues()",
  },
  {
    pattern: /createHash\s*\(\s*["']md5["']\s*\)/,
    type: "weak-crypto",
    severity: "high",
    message: "MD5 is cryptographically broken",
    suggestion: "Use SHA-256 or better",
  },
  {
    pattern: /createHash\s*\(\s*["']sha1["']\s*\)/,
    type: "weak-crypto",
    severity: "medium",
    message: "SHA-1 is deprecated for security purposes",
    suggestion: "Use SHA-256 or better",
  },
  {
    pattern: /\$\{.*\}\s*(?:WHERE|AND|OR|INSERT|UPDATE|DELETE|SELECT)/i,
    type: "sql-injection",
    severity: "critical",
    message: "Potential SQL injection via template literal",
    suggestion: "Use parameterized queries or an ORM",
  },
  {
    pattern: /exec\s*\(\s*[`"'].*\$\{/,
    type: "command-injection",
    severity: "critical",
    message: "Potential command injection via string interpolation in exec()",
    suggestion: "Use execFile() with argument arrays instead",
  },
  {
    pattern: /rejectUnauthorized\s*:\s*false/,
    type: "tls-bypass",
    severity: "high",
    message: "TLS certificate verification disabled",
    suggestion: "Enable certificate verification in production",
  },
  {
    pattern: /cors\(\s*\)/,
    type: "cors-wildcard",
    severity: "medium",
    message: "CORS configured with no restrictions",
    suggestion: "Specify allowed origins explicitly",
  },
]

export const securityScan = Effect.fn("Analysis.securityScan")(function* (filePath: string) {
  const content = yield* readFile(filePath)
  const lines = content.split("\n")
  const issues: SecurityIssue[] = []

  for (let i = 0; i < lines.length; i++) {
    for (const check of SECURITY_PATTERNS) {
      if (check.pattern.test(lines[i])) {
        issues.push({
          type: check.type,
          severity: check.severity,
          file: filePath,
          line: i + 1,
          message: check.message,
          suggestion: check.suggestion,
        })
      }
    }
  }

  return {
    filePath,
    issues,
    critical: issues.filter((i) => i.severity === "critical").length,
    high: issues.filter((i) => i.severity === "high").length,
    medium: issues.filter((i) => i.severity === "medium").length,
    low: issues.filter((i) => i.severity === "low").length,
  }
})

const PERFORMANCE_PATTERNS: Array<{
  pattern: RegExp
  type: string
  message: string
  suggestion: string
}> = [
  {
    pattern: /\.forEach\s*\(/,
    type: "loop-optimization",
    message: "forEach cannot be broken out of early",
    suggestion: "Use for...of for early termination or reduce for accumulation",
  },
  {
    pattern: /JSON\.parse\(JSON\.stringify\(/,
    type: "deep-clone",
    message: "JSON roundtrip for cloning is slow and loses non-JSON types",
    suggestion: "Use structuredClone() or a targeted spread",
  },
  {
    pattern: /new Array\(\d{4,}\)/,
    type: "large-allocation",
    message: "Large array pre-allocation",
    suggestion: "Consider using a generator or streaming approach",
  },
  {
    pattern: /await\s+\w+\s*\n\s*await\s+\w+/,
    type: "sequential-await",
    message: "Sequential awaits that may be parallelizable",
    suggestion: "Use Promise.all() if these operations are independent",
  },
  {
    pattern: /\.filter\(.*\)\.map\(/,
    type: "chained-iteration",
    message: "filter().map() iterates the array twice",
    suggestion: "Use reduce() or flatMap() for a single pass",
  },
  {
    pattern: /new RegExp\(/,
    type: "regexp-in-loop",
    message: "RegExp construction inside potential hot path",
    suggestion: "Hoist regex to module scope if pattern is static",
  },
  {
    pattern: /Array\.from\(\{.*length.*\}\)/,
    type: "array-from-length",
    message: "Array.from with length can be slow for large arrays",
    suggestion: "Use a simple for loop for better performance",
  },
]

export const performanceHints = Effect.fn("Analysis.performanceHints")(function* (filePath: string) {
  const content = yield* readFile(filePath)
  const lines = content.split("\n")
  const hints: PerformanceHint[] = []

  for (let i = 0; i < lines.length; i++) {
    for (const check of PERFORMANCE_PATTERNS) {
      if (check.pattern.test(lines[i])) {
        hints.push({
          type: check.type,
          file: filePath,
          line: i + 1,
          message: check.message,
          suggestion: check.suggestion,
        })
      }
    }
  }

  return { filePath, hints }
})

export const codeQualityScore = Effect.fn("Analysis.codeQualityScore")(function* (filePath: string) {
  const content = yield* readFile(filePath)
  const language = languageFromPath(filePath)
  const lines = content.split("\n")
  const lineCount = lines.length

  let functions: FunctionInfo[] = []
  if (language === "typescript" || language === "javascript") {
    functions = extractTSFunctions(content)
  }

  const avgComplexity = functions.length > 0
    ? functions.reduce((s, f) => s + f.complexity, 0) / functions.length
    : 1
  const complexityScore = Math.max(0, 100 - avgComplexity * 8)

  const identifiers = content.match(/\b[a-zA-Z_]\w*\b/g) || []
  const shortNames = identifiers.filter((id) => id.length <= 2 && !["i", "j", "k", "x", "y", "id", "ok", "fn"].includes(id))
  const namingRatio = identifiers.length > 0 ? 1 - shortNames.length / identifiers.length : 1
  const namingScore = Math.round(namingRatio * 100)

  const maxFnLength = functions.length > 0
    ? Math.max(...functions.map((f) => f.endLine - f.line + 1))
    : 0
  const structureScore = maxFnLength > 100 ? 40 : maxFnLength > 50 ? 70 : 100

  const sizeScore = lineCount > 500 ? 40 : lineCount > 300 ? 60 : lineCount > 200 ? 80 : 100

  const docLines = lines.filter((l) => l.trimStart().startsWith("//") || l.trimStart().startsWith("*") || l.trimStart().startsWith("/**")).length
  const docRatio = lineCount > 0 ? docLines / lineCount : 0
  const documentationScore = docRatio > 0.15 ? 100 : docRatio > 0.05 ? 70 : docRatio > 0.01 ? 50 : 30

  const score = Math.round(
    complexityScore * 0.3 +
    namingScore * 0.2 +
    structureScore * 0.2 +
    sizeScore * 0.15 +
    documentationScore * 0.15,
  )

  return {
    file: filePath,
    score: Math.min(100, Math.max(0, score)),
    breakdown: {
      complexity: Math.round(complexityScore),
      naming: namingScore,
      structure: structureScore,
      size: sizeScore,
      documentation: documentationScore,
    },
  } satisfies QualityScore
})
