import { Effect, Schema } from "effect"
import * as fs from "fs/promises"
import * as path from "path"
import { execFile } from "child_process"

export class TestError extends Schema.TaggedErrorClass<TestError>()("TestError", {
  reason: Schema.String,
}) {}

export type TestFramework = "jest" | "vitest" | "pytest" | "go-test" | "cargo-test" | "junit"

export type TestResult = {
  passed: number
  failed: number
  skipped: number
  total: number
  duration: number
  failures: TestFailure[]
  output: string
}

export type TestFailure = {
  name: string
  message: string
  file?: string
  line?: number
}

export type CoverageEntry = {
  file: string
  statements: number
  branches: number
  functions: number
  lines: number
}

export type CoverageReport = {
  entries: CoverageEntry[]
  totalStatements: number
  totalBranches: number
  totalFunctions: number
  totalLines: number
}

export type FunctionSignature = {
  name: string
  params: string[]
  returnType: string
  line: number
  isAsync: boolean
  isExported: boolean
}

export type TestSuggestion = {
  functionName: string
  testType: "unit" | "integration" | "edge-case" | "error-case"
  description: string
}

type ExecResult = {
  stdout: string
  stderr: string
  exitCode: number
}

function exec(command: string, args: string[], cwd?: string): Effect.Effect<ExecResult, TestError> {
  return Effect.tryPromise({
    try: () =>
      new Promise<ExecResult>((resolve) => {
        execFile(command, args, { cwd, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          resolve({
            stdout: stdout?.toString() ?? "",
            stderr: stderr?.toString() ?? "",
            exitCode: error ? (error as any).code ?? 1 : 0,
          })
        })
      }),
    catch: (e) => new TestError({ reason: `Failed to execute ${command}: ${e}` }),
  })
}

function fileExists(filePath: string): Effect.Effect<boolean> {
  return Effect.tryPromise({
    try: () => fs.access(filePath).then(() => true),
    catch: () => false,
  })
}

function readFile(filePath: string): Effect.Effect<string, TestError> {
  return Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: (e) => new TestError({ reason: `Cannot read ${filePath}: ${e}` }),
  })
}

export const detectTestFramework = Effect.fn("AutoTest.detectTestFramework")(function* (
  projectPath: string,
) {
  const hasPkgJson = yield* fileExists(path.join(projectPath, "package.json"))
  if (hasPkgJson) {
    const content = yield* readFile(path.join(projectPath, "package.json"))
    try {
      const pkg = JSON.parse(content)
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps["vitest"]) return "vitest" as TestFramework
      if (allDeps["jest"]) return "jest" as TestFramework
    } catch {
      // malformed
    }
  }

  const hasCargoToml = yield* fileExists(path.join(projectPath, "Cargo.toml"))
  if (hasCargoToml) return "cargo-test" as TestFramework

  const hasGoMod = yield* fileExists(path.join(projectPath, "go.mod"))
  if (hasGoMod) return "go-test" as TestFramework

  const hasPytest = yield* fileExists(path.join(projectPath, "pytest.ini"))
  const hasPytestCfg = yield* fileExists(path.join(projectPath, "pyproject.toml"))
  const hasSetupPy = yield* fileExists(path.join(projectPath, "setup.py"))
  if (hasPytest || hasPytestCfg || hasSetupPy) return "pytest" as TestFramework

  const hasPomXml = yield* fileExists(path.join(projectPath, "pom.xml"))
  const hasBuildGradle = yield* fileExists(path.join(projectPath, "build.gradle"))
  if (hasPomXml || hasBuildGradle) return "junit" as TestFramework

  return "vitest" as TestFramework
})

function extractFunctions(content: string, language: string): FunctionSignature[] {
  const functions: FunctionSignature[] = []
  const lines = content.split("\n")

  if (language === "typescript" || language === "javascript") {
    const fnPatterns = [
      /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/,
      /^(export\s+)?(?:const|let)\s+(\w+)\s*=\s*(async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/,
      /^(export\s+)?(?:const|let)\s+(\w+)\s*=\s*(async\s+)?function\s*\(([^)]*)\)/,
    ]

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart()
      for (const pattern of fnPatterns) {
        const match = trimmed.match(pattern)
        if (match) {
          if (pattern === fnPatterns[0]) {
            functions.push({
              name: match[3],
              params: match[4] ? match[4].split(",").map((p) => p.trim()) : [],
              returnType: match[5]?.trim() ?? "void",
              line: i + 1,
              isAsync: !!match[2],
              isExported: !!match[1],
            })
          } else {
            functions.push({
              name: match[2],
              params: match[4] ? match[4].split(",").map((p) => p.trim()) : [],
              returnType: match[5]?.trim() ?? "void",
              line: i + 1,
              isAsync: !!match[3],
              isExported: !!match[1],
            })
          }
          break
        }
      }
    }
  }

  if (language === "python") {
    const pyFnRe = /^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\S+))?\s*:/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pyFnRe)
      if (match) {
        functions.push({
          name: match[2],
          params: match[3] ? match[3].split(",").map((p) => p.trim()) : [],
          returnType: match[4] ?? "None",
          line: i + 1,
          isAsync: !!match[1],
          isExported: !match[2].startsWith("_"),
        })
      }
    }
  }

  if (language === "go") {
    const goFnRe = /^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*(?:\(([^)]+)\)|(\S+)))?\s*\{/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(goFnRe)
      if (match) {
        functions.push({
          name: match[1],
          params: match[2] ? match[2].split(",").map((p) => p.trim()) : [],
          returnType: match[3] ?? match[4] ?? "",
          line: i + 1,
          isAsync: false,
          isExported: /^[A-Z]/.test(match[1]),
        })
      }
    }
  }

  return functions
}

function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
  }
  return map[ext] ?? "typescript"
}

export const generateTests = Effect.fn("AutoTest.generateTests")(function* (
  filePath: string,
  framework?: TestFramework,
) {
  const content = yield* readFile(filePath)
  const language = languageFromPath(filePath)
  const functions = extractFunctions(content, language)
  const basename = path.basename(filePath, path.extname(filePath))

  const resolvedFramework = framework ?? (language === "python" ? "pytest" : "vitest")

  const testCases: string[] = []

  if (resolvedFramework === "vitest" || resolvedFramework === "jest") {
    const importPath = `./${basename}`
    const exportedFns = functions.filter((f) => f.isExported)
    const fnNames = exportedFns.map((f) => f.name)

    if (fnNames.length > 0) {
      testCases.push(`import { ${fnNames.join(", ")} } from "${importPath}"`)
      testCases.push(`import { describe, it, expect } from "${resolvedFramework === "vitest" ? "vitest" : "@jest/globals"}"`)
      testCases.push("")

      for (const fn of exportedFns) {
        testCases.push(`describe("${fn.name}", () => {`)
        testCases.push(`  it("should return expected result", ${fn.isAsync ? "async " : ""}() => {`)
        testCases.push(`    const result = ${fn.isAsync ? "await " : ""}${fn.name}()`)
        testCases.push(`    expect(result).toBeDefined()`)
        testCases.push(`  })`)
        testCases.push("")
        testCases.push(`  it("should handle edge cases", ${fn.isAsync ? "async " : ""}() => {`)
        testCases.push(`    // TODO: add edge case tests`)
        testCases.push(`  })`)
        testCases.push("")
        testCases.push(`  it("should handle errors", ${fn.isAsync ? "async " : ""}() => {`)
        if (fn.isAsync) {
          testCases.push(`    await expect(${fn.name}()).rejects.toThrow()`)
        } else {
          testCases.push(`    expect(() => ${fn.name}()).toThrow()`)
        }
        testCases.push(`  })`)
        testCases.push(`})`)
        testCases.push("")
      }
    }
  }

  if (resolvedFramework === "pytest") {
    const exportedFns = functions.filter((f) => f.isExported)

    testCases.push(`import pytest`)
    testCases.push(`from ${basename} import ${exportedFns.map((f) => f.name).join(", ")}`)
    testCases.push("")

    for (const fn of exportedFns) {
      const prefix = fn.isAsync ? "async " : ""
      const awaitPrefix = fn.isAsync ? "await " : ""

      testCases.push(`${prefix}def test_${fn.name}_returns_expected():`)
      testCases.push(`    result = ${awaitPrefix}${fn.name}()`)
      testCases.push(`    assert result is not None`)
      testCases.push("")

      testCases.push(`${prefix}def test_${fn.name}_edge_cases():`)
      testCases.push(`    # TODO: add edge case tests`)
      testCases.push(`    pass`)
      testCases.push("")

      testCases.push(`${prefix}def test_${fn.name}_error_handling():`)
      testCases.push(`    with pytest.raises(Exception):`)
      testCases.push(`        ${awaitPrefix}${fn.name}()`)
      testCases.push("")
    }
  }

  if (resolvedFramework === "go-test") {
    const exportedFns = functions.filter((f) => f.isExported)

    testCases.push(`package ${basename}_test`)
    testCases.push("")
    testCases.push(`import (`)
    testCases.push(`\t"testing"`)
    testCases.push(`)`)
    testCases.push("")

    for (const fn of exportedFns) {
      testCases.push(`func Test${fn.name}(t *testing.T) {`)
      testCases.push(`\tt.Run("returns expected result", func(t *testing.T) {`)
      testCases.push(`\t\t// TODO: call ${fn.name} and assert result`)
      testCases.push(`\t})`)
      testCases.push("")
      testCases.push(`\tt.Run("handles edge cases", func(t *testing.T) {`)
      testCases.push(`\t\t// TODO: add edge case tests`)
      testCases.push(`\t})`)
      testCases.push(`}`)
      testCases.push("")
    }
  }

  return {
    filePath,
    framework: resolvedFramework,
    testContent: testCases.join("\n"),
    functionsAnalyzed: functions.length,
    testsGenerated: functions.filter((f) => f.isExported).length * 3,
  }
})

function parseVitestOutput(output: string): TestResult {
  const passedMatch = output.match(/(\d+)\s+passed/)
  const failedMatch = output.match(/(\d+)\s+failed/)
  const skippedMatch = output.match(/(\d+)\s+skipped/)
  const durationMatch = output.match(/Duration\s+([\d.]+)/)

  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0
  const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0

  const failures: TestFailure[] = []
  const failBlockRe = /FAIL\s+(.+?)\n([\s\S]*?)(?=\n\s*(?:FAIL|Tests|$))/g
  let match: RegExpExecArray | null
  while ((match = failBlockRe.exec(output)) !== null) {
    failures.push({ name: match[1].trim(), message: match[2].trim() })
  }

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    duration: durationMatch ? parseFloat(durationMatch[1]) : 0,
    failures,
    output,
  }
}

function parsePytestOutput(output: string): TestResult {
  const summaryMatch = output.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+skipped)?/)
  const passed = summaryMatch ? parseInt(summaryMatch[1], 10) : 0
  const failed = summaryMatch?.[2] ? parseInt(summaryMatch[2], 10) : 0
  const skipped = summaryMatch?.[3] ? parseInt(summaryMatch[3], 10) : 0
  const durationMatch = output.match(/in ([\d.]+)s/)

  const failures: TestFailure[] = []
  const failRe = /FAILED (.+?) - (.+)/g
  let m: RegExpExecArray | null
  while ((m = failRe.exec(output)) !== null) {
    failures.push({ name: m[1], message: m[2] })
  }

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    duration: durationMatch ? parseFloat(durationMatch[1]) : 0,
    failures,
    output,
  }
}

function parseGoTestOutput(output: string): TestResult {
  const passRe = /--- PASS/g
  const failRe = /--- FAIL/g
  const skipRe = /--- SKIP/g
  const passed = (output.match(passRe) || []).length
  const failed = (output.match(failRe) || []).length
  const skipped = (output.match(skipRe) || []).length
  const durationMatch = output.match(/([\d.]+)s/)

  const failures: TestFailure[] = []
  const failBlockRe = /--- FAIL: (\S+)\s+\(([\d.]+)s\)\n([\s\S]*?)(?=---|\n\n|$)/g
  let m: RegExpExecArray | null
  while ((m = failBlockRe.exec(output)) !== null) {
    failures.push({ name: m[1], message: m[3].trim() })
  }

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    duration: durationMatch ? parseFloat(durationMatch[1]) : 0,
    failures,
    output,
  }
}

export const runTests = Effect.fn("AutoTest.runTests")(function* (
  testPath: string,
  framework: TestFramework,
) {
  let result: ExecResult

  switch (framework) {
    case "vitest":
      result = yield* exec("npx", ["vitest", "run", testPath, "--reporter=verbose"])
      return parseVitestOutput(result.stdout + result.stderr)
    case "jest":
      result = yield* exec("npx", ["jest", testPath, "--verbose"])
      return parseVitestOutput(result.stdout + result.stderr)
    case "pytest":
      result = yield* exec("python", ["-m", "pytest", testPath, "-v"])
      return parsePytestOutput(result.stdout + result.stderr)
    case "go-test":
      result = yield* exec("go", ["test", "-v", testPath])
      return parseGoTestOutput(result.stdout + result.stderr)
    case "cargo-test":
      result = yield* exec("cargo", ["test", "--", testPath])
      return parseGoTestOutput(result.stdout + result.stderr)
    case "junit":
      result = yield* exec("mvn", ["test", `-Dtest=${testPath}`])
      return parseVitestOutput(result.stdout + result.stderr)
  }
})

export const coverageReport = Effect.fn("AutoTest.coverageReport")(function* (
  projectPath: string,
) {
  const framework = yield* detectTestFramework(projectPath)
  let result: ExecResult

  switch (framework) {
    case "vitest":
      result = yield* exec("npx", ["vitest", "run", "--coverage", "--reporter=json"], projectPath)
      break
    case "jest":
      result = yield* exec("npx", ["jest", "--coverage", "--coverageReporters=json-summary"], projectPath)
      break
    case "pytest":
      result = yield* exec("python", ["-m", "pytest", "--cov", "--cov-report=json"], projectPath)
      break
    default:
      return {
        entries: [],
        totalStatements: 0,
        totalBranches: 0,
        totalFunctions: 0,
        totalLines: 0,
      } satisfies CoverageReport
  }

  const output = result.stdout + result.stderr

  try {
    const jsonStart = output.indexOf("{")
    if (jsonStart >= 0) {
      const data = JSON.parse(output.slice(jsonStart))
      const entries: CoverageEntry[] = []

      if (data.total) {
        return {
          entries,
          totalStatements: data.total.statements?.pct ?? 0,
          totalBranches: data.total.branches?.pct ?? 0,
          totalFunctions: data.total.functions?.pct ?? 0,
          totalLines: data.total.lines?.pct ?? 0,
        } satisfies CoverageReport
      }
    }
  } catch {
    // parse failure
  }

  return {
    entries: [],
    totalStatements: 0,
    totalBranches: 0,
    totalFunctions: 0,
    totalLines: 0,
  } satisfies CoverageReport
})

export const suggestMissingTests = Effect.fn("AutoTest.suggestMissingTests")(function* (
  filePath: string,
  existingTests?: string,
) {
  const content = yield* readFile(filePath)
  const language = languageFromPath(filePath)
  const functions = extractFunctions(content, language)
  const suggestions: TestSuggestion[] = []

  const testedFunctions = new Set<string>()
  if (existingTests) {
    for (const fn of functions) {
      if (existingTests.includes(fn.name)) {
        testedFunctions.add(fn.name)
      }
    }
  }

  for (const fn of functions) {
    if (!fn.isExported) continue

    if (!testedFunctions.has(fn.name)) {
      suggestions.push({
        functionName: fn.name,
        testType: "unit",
        description: `Missing unit test for ${fn.name}`,
      })
    }

    if (fn.params.length > 0) {
      suggestions.push({
        functionName: fn.name,
        testType: "edge-case",
        description: `Test ${fn.name} with empty/null/undefined parameters`,
      })
    }

    if (fn.isAsync) {
      suggestions.push({
        functionName: fn.name,
        testType: "error-case",
        description: `Test ${fn.name} rejection/error handling`,
      })
    }

    const fnBody = content.slice(
      content.indexOf(fn.name),
      content.indexOf(fn.name) + 500,
    )
    if (fnBody.includes("fetch") || fnBody.includes("request") || fnBody.includes("db") || fnBody.includes("query")) {
      suggestions.push({
        functionName: fn.name,
        testType: "integration",
        description: `Integration test for ${fn.name} with external dependencies`,
      })
    }
  }

  return {
    filePath,
    totalFunctions: functions.length,
    exportedFunctions: functions.filter((f) => f.isExported).length,
    testedFunctions: testedFunctions.size,
    suggestions,
  }
})
