import { Effect, Schema } from "effect"
import * as fs from "fs/promises"

export class RefactorError extends Schema.TaggedErrorClass<RefactorError>()("RefactorError", {
  reason: Schema.String,
}) {}

export type RefactoringType =
  | "extract-function"
  | "rename-symbol"
  | "inline-variable"
  | "convert-to-async"
  | "simplify-conditionals"

export type Refactoring = {
  type: RefactoringType
  file: string
  description: string
  startLine: number
  endLine: number
  original: string
  replacement: string
}

export type RefactoringSuggestion = {
  type: RefactoringType
  description: string
  file: string
  startLine: number
  endLine: number
  reason: string
}

function readFile(filePath: string): Effect.Effect<string, RefactorError> {
  return Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: (e) => new RefactorError({ reason: `Cannot read ${filePath}: ${e}` }),
  })
}

function writeFile(filePath: string, content: string): Effect.Effect<void, RefactorError> {
  return Effect.tryPromise({
    try: () => fs.writeFile(filePath, content, "utf-8"),
    catch: (e) => new RefactorError({ reason: `Cannot write ${filePath}: ${e}` }),
  })
}

export const extractFunction = Effect.fn("Refactor.extractFunction")(function* (
  filePath: string,
  startLine: number,
  endLine: number,
  name: string,
) {
  const content = yield* readFile(filePath)
  const lines = content.split("\n")

  if (startLine < 1 || endLine > lines.length || startLine > endLine) {
    yield* Effect.fail(new RefactorError({ reason: `Invalid line range: ${startLine}-${endLine}` }))
  }

  const extracted = lines.slice(startLine - 1, endLine)
  const indent = extracted[0].match(/^(\s*)/)?.[1] ?? ""
  const body = extracted.map((l) => {
    const stripped = l.startsWith(indent) ? l.slice(indent.length) : l
    return `  ${stripped}`
  })

  const usedVars = new Set<string>()
  const declaredVars = new Set<string>()
  const varDeclRe = /(?:const|let|var)\s+(\w+)/g
  const identRe = /\b([a-zA-Z_]\w*)\b/g

  const block = extracted.join("\n")
  let match: RegExpExecArray | null

  while ((match = varDeclRe.exec(block)) !== null) {
    declaredVars.add(match[1])
  }

  while ((match = identRe.exec(block)) !== null) {
    const id = match[1]
    if (!declaredVars.has(id) && !KEYWORDS.has(id)) {
      usedVars.add(id)
    }
  }

  const params = [...usedVars]

  const hasReturn = /\breturn\b/.test(block)
  const isAsync = /\bawait\b/.test(block)

  const fnDef = [
    `${isAsync ? "async " : ""}function ${name}(${params.join(", ")}) {`,
    ...body,
    `}`,
  ].join("\n")

  const callExpr = `${indent}${isAsync ? "await " : ""}${name}(${params.join(", ")})`

  const newLines = [
    ...lines.slice(0, startLine - 1),
    callExpr,
    ...lines.slice(endLine),
  ]

  const insertionPoint = findInsertionPoint(newLines)
  newLines.splice(insertionPoint, 0, "", fnDef, "")

  const result = newLines.join("\n")
  yield* writeFile(filePath, result)

  return {
    type: "extract-function" as RefactoringType,
    file: filePath,
    description: `Extracted lines ${startLine}-${endLine} into function ${name}`,
    startLine,
    endLine,
    original: extracted.join("\n"),
    replacement: callExpr.trimStart(),
  } satisfies Refactoring
})

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
  "return", "throw", "try", "catch", "finally", "new", "delete", "typeof",
  "instanceof", "void", "in", "of", "const", "let", "var", "function",
  "class", "extends", "import", "export", "default", "from", "as",
  "async", "await", "yield", "true", "false", "null", "undefined",
  "this", "super", "console", "Math", "JSON", "Object", "Array",
  "String", "Number", "Boolean", "Date", "Error", "Promise", "Map", "Set",
])

function findInsertionPoint(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trimStart()
    if (trimmed.startsWith("export") || trimmed.startsWith("module.exports")) {
      return i
    }
  }
  return lines.length
}

export const renameSymbol = Effect.fn("Refactor.renameSymbol")(function* (
  filePath: string,
  oldName: string,
  newName: string,
) {
  const content = yield* readFile(filePath)

  if (KEYWORDS.has(newName)) {
    yield* Effect.fail(new RefactorError({ reason: `${newName} is a reserved keyword` }))
  }

  const wordBoundary = new RegExp(`\\b${escapeRegex(oldName)}\\b`, "g")

  const lines = content.split("\n")
  let count = 0
  const renamedLines: string[] = []
  const affectedLines: number[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (isInStringOrComment(line, oldName)) {
      renamedLines.push(line)
      continue
    }

    const replaced = line.replace(wordBoundary, () => {
      count++
      affectedLines.push(i + 1)
      return newName
    })
    renamedLines.push(replaced)
  }

  if (count === 0) {
    yield* Effect.fail(new RefactorError({ reason: `Symbol "${oldName}" not found in ${filePath}` }))
  }

  const result = renamedLines.join("\n")
  yield* writeFile(filePath, result)

  return {
    type: "rename-symbol" as RefactoringType,
    file: filePath,
    description: `Renamed "${oldName}" to "${newName}" (${count} occurrences)`,
    startLine: affectedLines[0] ?? 0,
    endLine: affectedLines[affectedLines.length - 1] ?? 0,
    original: oldName,
    replacement: newName,
  } satisfies Refactoring
})

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isInStringOrComment(line: string, symbol: string): boolean {
  const trimmed = line.trimStart()
  if (trimmed.startsWith("//")) return true
  if (trimmed.startsWith("*")) return true

  const idx = line.indexOf(symbol)
  if (idx < 0) return false

  let inSingle = false
  let inDouble = false
  let inTemplate = false
  for (let i = 0; i < idx; i++) {
    const ch = line[i]
    const prev = i > 0 ? line[i - 1] : ""
    if (prev === "\\") continue
    if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle
    if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble
    if (ch === "`" && !inSingle && !inDouble) inTemplate = !inTemplate
  }

  return inSingle || inDouble || inTemplate
}

export const inlineVariable = Effect.fn("Refactor.inlineVariable")(function* (
  filePath: string,
  line: number,
) {
  const content = yield* readFile(filePath)
  const lines = content.split("\n")

  if (line < 1 || line > lines.length) {
    yield* Effect.fail(new RefactorError({ reason: `Line ${line} out of range` }))
  }

  const targetLine = lines[line - 1]
  const declMatch = targetLine.match(/(?:const|let|var)\s+(\w+)\s*=\s*(.+?)\s*;?\s*$/)

  if (!declMatch) {
    yield* Effect.fail(new RefactorError({ reason: `Line ${line} is not a variable declaration` }))
  }

  const varName = declMatch![1]
  const varValue = declMatch![2]
  const wordBoundary = new RegExp(`\\b${escapeRegex(varName)}\\b`, "g")

  let useCount = 0
  const newLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    if (i === line - 1) continue

    if (wordBoundary.test(lines[i]) && !isInStringOrComment(lines[i], varName)) {
      const needsParens = /[+\-*/%&|^~!<>=?:]/.test(lines[i].charAt(lines[i].indexOf(varName) - 1)) &&
        !/^[\w"'`(\[{]/.test(varValue)
      const replacement = needsParens ? `(${varValue})` : varValue
      newLines.push(lines[i].replace(wordBoundary, replacement))
      useCount++
    } else {
      newLines.push(lines[i])
    }
  }

  if (useCount === 0) {
    yield* Effect.fail(new RefactorError({ reason: `Variable "${varName}" is never used after declaration` }))
  }

  const result = newLines.join("\n")
  yield* writeFile(filePath, result)

  return {
    type: "inline-variable" as RefactoringType,
    file: filePath,
    description: `Inlined variable "${varName}" (${useCount} replacements)`,
    startLine: line,
    endLine: line,
    original: targetLine.trim(),
    replacement: `${varName} → ${varValue}`,
  } satisfies Refactoring
})

export const convertToAsync = Effect.fn("Refactor.convertToAsync")(function* (
  filePath: string,
  functionName: string,
) {
  const content = yield* readFile(filePath)
  const lines = content.split("\n")
  let found = false
  let fnLine = -1

  const patterns = [
    new RegExp(`^(\\s*)(export\\s+)?function\\s+${escapeRegex(functionName)}\\s*\\(`),
    new RegExp(`^(\\s*)(export\\s+)?(?:const|let)\\s+${escapeRegex(functionName)}\\s*=\\s*\\(`),
    new RegExp(`^(\\s*)(export\\s+)?(?:const|let)\\s+${escapeRegex(functionName)}\\s*=\\s*function\\s*\\(`),
  ]

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i])) {
        if (lines[i].includes("async")) {
          yield* Effect.fail(new RefactorError({ reason: `${functionName} is already async` }))
        }
        found = true
        fnLine = i

        if (pattern === patterns[0]) {
          lines[i] = lines[i].replace(
            /^(\s*)(export\s+)?function\s+/,
            (_, indent, exp) => `${indent}${exp ?? ""}async function `,
          )
        } else {
          lines[i] = lines[i].replace(
            /=\s*\(/,
            "= async (",
          ).replace(
            /=\s*function\s*\(/,
            "= async function(",
          )
        }

        let braceCount = 0
        let started = false
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") { braceCount++; started = true }
            if (ch === "}") braceCount--
          }

          if (j > i) {
            lines[j] = lines[j].replace(
              /\b(\w+)\s*\.\s*then\s*\(\s*(?:\(?\s*(\w+)\s*\)?\s*=>|function\s*\(\s*(\w+)\s*\))\s*\{?\s*/g,
              (_, promiseExpr) => `const result = await ${promiseExpr}\n`,
            )
          }

          if (started && braceCount <= 0) break
        }

        break
      }
    }
    if (found) break
  }

  if (!found) {
    yield* Effect.fail(new RefactorError({ reason: `Function "${functionName}" not found` }))
  }

  const retType = content.match(
    new RegExp(`${escapeRegex(functionName)}[^)]*\\)\\s*:\\s*([^{]+)\\{`),
  )
  if (retType && !retType[1].includes("Promise")) {
    const oldType = retType[1].trim()
    const newType = `Promise<${oldType}>`
    const idx = content.indexOf(oldType)
    if (idx >= 0) {
      lines[fnLine] = lines[fnLine].replace(oldType, newType)
    }
  }

  const result = lines.join("\n")
  yield* writeFile(filePath, result)

  return {
    type: "convert-to-async" as RefactoringType,
    file: filePath,
    description: `Converted ${functionName} to async`,
    startLine: fnLine + 1,
    endLine: fnLine + 1,
    original: `function ${functionName}`,
    replacement: `async function ${functionName}`,
  } satisfies Refactoring
})

export const simplifyConditionals = Effect.fn("Refactor.simplifyConditionals")(function* (
  filePath: string,
) {
  const content = yield* readFile(filePath)
  let result = content
  let changes = 0

  const negatedIfElse = /if\s*\(\s*!(.+?)\s*\)\s*\{([^}]*)\}\s*else\s*\{([^}]*)\}/g
  result = result.replace(negatedIfElse, (_, cond, falseBranch, trueBranch) => {
    changes++
    return `if (${cond}) {${trueBranch}} else {${falseBranch}}`
  })

  const redundantBool = /if\s*\((.+?)\)\s*\{\s*return\s+true\s*;?\s*\}\s*(?:else\s*\{)?\s*return\s+false\s*;?\s*\}?/g
  result = result.replace(redundantBool, (_, cond) => {
    changes++
    return `return ${cond}`
  })

  const nullishCheck = /(\w+)\s*!==?\s*null\s*&&\s*\1\s*!==?\s*undefined/g
  result = result.replace(nullishCheck, (_, name) => {
    changes++
    return `${name} != null`
  })

  const ternaryTrue = /(.+?)\s*\?\s*true\s*:\s*false/g
  result = result.replace(ternaryTrue, (_, expr) => {
    changes++
    return `Boolean(${expr})`
  })

  const ternaryFalse = /(.+?)\s*\?\s*false\s*:\s*true/g
  result = result.replace(ternaryFalse, (_, expr) => {
    changes++
    return `!${expr}`
  })

  if (changes > 0) {
    yield* writeFile(filePath, result)
  }

  return {
    type: "simplify-conditionals" as RefactoringType,
    file: filePath,
    description: `Simplified ${changes} conditional patterns`,
    startLine: 1,
    endLine: result.split("\n").length,
    original: `${changes} patterns`,
    replacement: "simplified",
  } satisfies Refactoring
})

export const suggestRefactorings = Effect.fn("Refactor.suggestRefactorings")(function* (
  filePath: string,
) {
  const content = yield* readFile(filePath)
  const lines = content.split("\n")
  const suggestions: RefactoringSuggestion[] = []

  const fnRe = /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)/
  let currentFn: { name: string; start: number; indent: string } | null = null
  let braceCount = 0
  let fnStarted = false

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(fnRe)
    if (match) {
      if (currentFn && fnStarted) {
        const length = i - currentFn.start
        if (length > 40) {
          suggestions.push({
            type: "extract-function",
            description: `Function "${currentFn.name}" is ${length} lines — consider extracting`,
            file: filePath,
            startLine: currentFn.start + 1,
            endLine: i,
            reason: "Long functions are harder to test and understand",
          })
        }
      }
      currentFn = { name: match[4], start: i, indent: match[1] }
      braceCount = 0
      fnStarted = false
    }

    for (const ch of lines[i]) {
      if (ch === "{") { braceCount++; fnStarted = true }
      if (ch === "}") braceCount--
    }

    if (currentFn && fnStarted && braceCount <= 0) {
      const length = i - currentFn.start + 1
      if (length > 40) {
        suggestions.push({
          type: "extract-function",
          description: `Function "${currentFn.name}" is ${length} lines — consider extracting`,
          file: filePath,
          startLine: currentFn.start + 1,
          endLine: i + 1,
          reason: "Long functions are harder to test and understand",
        })
      }
      currentFn = null
      fnStarted = false
    }

    if (/if\s*\(.*\)\s*\{/.test(lines[i])) {
      let depth = 0
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        if (/\bif\b/.test(lines[j])) depth++
      }
      if (depth >= 3) {
        suggestions.push({
          type: "simplify-conditionals",
          description: "Deeply nested conditionals",
          file: filePath,
          startLine: i + 1,
          endLine: i + 1,
          reason: "Extract conditions into guard clauses or named booleans",
        })
      }
    }

    if (/\.then\s*\(/.test(lines[i]) && !/\.catch\b/.test(content.slice(content.indexOf(lines[i])))) {
      suggestions.push({
        type: "convert-to-async",
        description: "Promise chain could use async/await",
        file: filePath,
        startLine: i + 1,
        endLine: i + 1,
        reason: "async/await is more readable than .then() chains",
      })
    }

    const varMatch = lines[i].match(/(?:const|let)\s+(\w+)\s*=\s*(.+?);?\s*$/)
    if (varMatch) {
      const varName = varMatch[1]
      let usages = 0
      for (let j = i + 1; j < lines.length; j++) {
        if (new RegExp(`\\b${escapeRegex(varName)}\\b`).test(lines[j])) {
          usages++
        }
      }
      if (usages === 1 && varMatch[2].length < 40) {
        suggestions.push({
          type: "inline-variable",
          description: `Variable "${varName}" used only once — consider inlining`,
          file: filePath,
          startLine: i + 1,
          endLine: i + 1,
          reason: "Single-use variables can obscure data flow",
        })
      }
    }
  }

  return {
    filePath,
    suggestions,
  }
})

export const applyRefactoring = Effect.fn("Refactor.applyRefactoring")(function* (
  filePath: string,
  refactoring: RefactoringSuggestion,
) {
  switch (refactoring.type) {
    case "simplify-conditionals":
      return yield* simplifyConditionals(filePath)
    case "extract-function": {
      const name = `extracted_${refactoring.startLine}`
      return yield* extractFunction(filePath, refactoring.startLine, refactoring.endLine, name)
    }
    case "inline-variable":
      return yield* inlineVariable(filePath, refactoring.startLine)
    case "convert-to-async": {
      const content = yield* readFile(filePath)
      const line = content.split("\n")[refactoring.startLine - 1]
      const fnMatch = line?.match(/(?:function\s+|(?:const|let)\s+)(\w+)/)
      if (!fnMatch) {
        yield* Effect.fail(new RefactorError({ reason: "Cannot determine function name" }))
      }
      return yield* convertToAsync(filePath, fnMatch![1])
    }
    case "rename-symbol":
      yield* Effect.fail(new RefactorError({ reason: "Rename requires oldName and newName — use renameSymbol directly" }))
      return undefined as never
  }
})
