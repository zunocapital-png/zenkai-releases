import { Effect, Schema, Stream } from "effect"
import * as Tool from "./tool"
import DESCRIPTION from "./coding_tools.txt"
import { InstanceState } from "@/effect/instance-state"
import { Shell } from "@opencode-ai/core/shell"
import { Config } from "@/config/config"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import {
  executeAndAnalyze,
  type SupportedLanguage,
} from "@/sandbox/code-interpreter"
import path from "path"
import fs from "fs/promises"

const ActionSchema = Schema.Literals([
  "run_code",
  "analyze_code",
  "generate_tests",
  "scaffold_project",
  "refactor",
  "auto_fix",
])

export const Parameters = Schema.Struct({
  action: ActionSchema.annotate({
    description:
      "The coding action: run_code, analyze_code, generate_tests, scaffold_project, refactor, or auto_fix",
  }),
  code: Schema.optional(Schema.String).annotate({
    description: "Source code to execute (for run_code) or code snippet to analyze/refactor",
  }),
  language: Schema.optional(Schema.String).annotate({
    description:
      "Programming language: javascript, typescript, python, bash (for run_code), or target language for scaffold",
  }),
  filePath: Schema.optional(Schema.String).annotate({
    description: "Absolute path to the file to analyze, generate tests for, or refactor",
  }),
  command: Schema.optional(Schema.String).annotate({
    description: "Shell command to run in auto_fix loop (e.g. npm run build, cargo check)",
  }),
  operation: Schema.optional(Schema.String).annotate({
    description:
      "Refactoring operation: extract-function, rename-symbol, inline-variable, extract-interface",
  }),
  template: Schema.optional(Schema.String).annotate({
    description:
      "Project template for scaffold: node-typescript, python-package, react-app, nextjs-app, go-module, rust-crate",
  }),
  name: Schema.optional(Schema.String).annotate({
    description: "Project or symbol name for scaffold_project or refactor operations",
  }),
  timeout: Schema.optional(Schema.Number).annotate({
    description: "Timeout in milliseconds for run_code or auto_fix (default 30000)",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

type Metadata = {
  action: string
  [key: string]: unknown
}

const SUPPORTED_LANGUAGES = new Set(["javascript", "typescript", "python", "bash"])

const TEMPLATES: Record<string, { files: Record<string, string> }> = {
  "node-typescript": {
    files: {
      "package.json": JSON.stringify(
        {
          name: "",
          version: "0.1.0",
          type: "module",
          scripts: {
            build: "tsc",
            dev: "tsx watch src/index.ts",
            start: "node dist/index.js",
            test: "vitest",
            lint: "eslint src/",
            typecheck: "tsc --noEmit",
          },
          devDependencies: {
            typescript: "^5.0.0",
            tsx: "^4.0.0",
            vitest: "^2.0.0",
            eslint: "^9.0.0",
          },
        },
        null,
        2,
      ),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ES2022",
            moduleResolution: "bundler",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "dist",
            rootDir: "src",
            declaration: true,
          },
          include: ["src"],
        },
        null,
        2,
      ),
      "src/index.ts": "",
      ".gitignore": "node_modules/\ndist/\n.env\n",
    },
  },
  "python-package": {
    files: {
      "pyproject.toml": [
        "[build-system]",
        'requires = ["setuptools>=68.0", "setuptools-scm>=8.0"]',
        'build-backend = "setuptools.build_meta"',
        "",
        "[project]",
        'name = ""',
        'version = "0.1.0"',
        'requires-python = ">=3.11"',
        "",
        "[tool.pytest.ini_options]",
        'testpaths = ["tests"]',
        "",
        "[tool.ruff]",
        "line-length = 88",
        'target-version = "py311"',
      ].join("\n"),
      "src/__init__.py": "",
      "tests/__init__.py": "",
      "tests/test_main.py": "",
      ".gitignore": "__pycache__/\n*.pyc\ndist/\n.venv/\n*.egg-info/\n",
    },
  },
  "react-app": {
    files: {
      "package.json": JSON.stringify(
        {
          name: "",
          version: "0.1.0",
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc && vite build",
            preview: "vite preview",
            lint: "eslint src/",
            typecheck: "tsc --noEmit",
          },
          dependencies: {
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
          devDependencies: {
            typescript: "^5.0.0",
            vite: "^6.0.0",
            "@vitejs/plugin-react": "^4.0.0",
            eslint: "^9.0.0",
          },
        },
        null,
        2,
      ),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ES2022",
            moduleResolution: "bundler",
            strict: true,
            jsx: "react-jsx",
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "dist",
          },
          include: ["src"],
        },
        null,
        2,
      ),
      "index.html": [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '  <meta charset="UTF-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        "  <title></title>",
        "</head>",
        "<body>",
        '  <div id="root"></div>',
        '  <script type="module" src="/src/main.tsx"></script>',
        "</body>",
        "</html>",
      ].join("\n"),
      "src/main.tsx": [
        'import { createRoot } from "react-dom/client"',
        'import { App } from "./App"',
        "",
        'createRoot(document.getElementById("root")!).render(<App />)',
      ].join("\n"),
      "src/App.tsx": [
        "export function App() {",
        '  return <div>Hello</div>',
        "}",
      ].join("\n"),
      ".gitignore": "node_modules/\ndist/\n.env\n",
    },
  },
  "nextjs-app": {
    files: {
      "package.json": JSON.stringify(
        {
          name: "",
          version: "0.1.0",
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            lint: "next lint",
          },
          dependencies: {
            next: "^15.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
          devDependencies: {
            typescript: "^5.0.0",
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
          },
        },
        null,
        2,
      ),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./src/*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2,
      ),
      "app/layout.tsx": [
        "export const metadata = { title: '', description: '' }",
        "",
        "export default function RootLayout({ children }: { children: React.ReactNode }) {",
        "  return (",
        '    <html lang="en">',
        "      <body>{children}</body>",
        "    </html>",
        "  )",
        "}",
      ].join("\n"),
      "app/page.tsx": [
        "export default function Home() {",
        "  return <main>Hello</main>",
        "}",
      ].join("\n"),
      ".gitignore": "node_modules/\n.next/\n.env*.local\n",
    },
  },
  "go-module": {
    files: {
      "go.mod": "",
      "main.go": [
        "package main",
        "",
        'import "fmt"',
        "",
        "func main() {",
        '\tfmt.Println("Hello")',
        "}",
      ].join("\n"),
      "main_test.go": [
        "package main",
        "",
        'import "testing"',
        "",
        "func TestMain(t *testing.T) {",
        "}",
      ].join("\n"),
      ".gitignore": "bin/\n*.exe\n",
    },
  },
  "rust-crate": {
    files: {
      "Cargo.toml": [
        "[package]",
        'name = ""',
        'version = "0.1.0"',
        'edition = "2021"',
        "",
        "[dependencies]",
      ].join("\n"),
      "src/main.rs": [
        "fn main() {",
        '    println!("Hello");',
        "}",
      ].join("\n"),
      ".gitignore": "target/\n",
    },
  },
}

function makeCommand(shell: string, command: string, cwd: string) {
  if (process.platform === "win32" && Shell.ps(shell)) {
    return ChildProcess.make(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      cwd,
      stdin: "ignore",
      detached: false,
    })
  }
  return ChildProcess.make(command, [], {
    shell,
    cwd,
    stdin: "ignore",
    detached: process.platform !== "win32",
  })
}

export const CodingTools = Tool.define(
  "coding_tools",
  Effect.gen(function* () {
    const config = yield* Config.Service
    const spawner = yield* ChildProcessSpawner

    const runCommand = Effect.fn("CodingTools.runCommand")(function* (
      shell: string,
      command: string,
      cwd: string,
      timeout: number,
    ) {
      let output = ""

      const code: number | null = yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(makeCommand(shell, command, cwd))

          yield* Effect.forkScoped(
            Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
              Effect.sync(() => {
                output += chunk
              }),
            ),
          )

          const exit = yield* Effect.raceAll([
            handle.exitCode.pipe(Effect.map((c) => ({ kind: "exit" as const, code: c }))),
            Effect.sleep(`${timeout} millis`).pipe(
              Effect.map(() => ({ kind: "timeout" as const, code: null as number | null })),
            ),
          ])

          if (exit.kind === "timeout") {
            yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
          }

          return exit.code
        }),
      ).pipe(Effect.orDie)

      return { output, exitCode: code }
    })

    const execRunCode = (params: Params) =>
      Effect.gen(function* () {
        if (!params.code) {
          return yield* Effect.fail(new Error("code parameter is required for run_code"))
        }
        const lang = (params.language ?? "javascript").toLowerCase() as SupportedLanguage
        if (!SUPPORTED_LANGUAGES.has(lang)) {
          return yield* Effect.fail(
            new Error(`Unsupported language: ${lang}. Supported: ${[...SUPPORTED_LANGUAGES].join(", ")}`),
          )
        }
        const result = yield* Effect.promise(() =>
          executeAndAnalyze(params.code!, lang, {
            timeout: params.timeout ?? 30_000,
          }),
        )
        const out = [
          `Exit code: ${result.execution.exitCode ?? "timeout"}`,
          `Duration: ${result.execution.duration}ms`,
          result.execution.stdout ? `\nSTDOUT:\n${result.execution.stdout}` : "",
          result.execution.stderr ? `\nSTDERR:\n${result.execution.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n")

        return {
          title: `run ${lang}`,
          metadata: {
            action: "run_code",
            success: result.success,
            exitCode: result.execution.exitCode,
            truncated: result.execution.truncated,
          } satisfies Metadata,
          output: out,
        }
      })

    const execAnalyzeCode = (params: Params) =>
      Effect.gen(function* () {
        if (!params.filePath) {
          return yield* Effect.fail(new Error("filePath parameter is required for analyze_code"))
        }
        const content = yield* Effect.promise(() => fs.readFile(params.filePath!, "utf-8"))
        const lines = content.split("\n")
        const ext = params.filePath!.split(".").pop() ?? ""
        const issues: string[] = []

        if (ext === "ts" || ext === "tsx") {
          lines.forEach((line, i) => {
            if (/:\s*any\b/.test(line) && !/\/\//.test(line.split(":any")[0] ?? ""))
              issues.push(`L${i + 1}: uses 'any' type`)
            if (/as\s+any\b/.test(line))
              issues.push(`L${i + 1}: type assertion to 'any'`)
          })
        }

        lines.forEach((line, i) => {
          if (/(?:password|secret|api_key|apikey|token)\s*[:=]\s*["'`][^"'`]+["'`]/i.test(line))
            issues.push(`L${i + 1}: possible hardcoded secret`)
          if (/eval\s*\(/.test(line))
            issues.push(`L${i + 1}: uses eval()`)
          if (/innerHTML\s*=/.test(line))
            issues.push(`L${i + 1}: direct innerHTML assignment — XSS risk`)
          if (/\bconsole\.(log|debug|info)\b/.test(line))
            issues.push(`L${i + 1}: console output left in code`)
          if (line.length > 200)
            issues.push(`L${i + 1}: line exceeds 200 characters`)
        })

        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content))
          issues.push("Empty catch block found")

        const todoCount = (content.match(/\bTODO\b/gi) || []).length
        if (todoCount > 0) issues.push(`${todoCount} TODO comment(s) found`)

        const out = [
          `File: ${params.filePath}`,
          `Lines: ${lines.length}`,
          `Extension: .${ext}`,
          "",
          issues.length > 0
            ? `Issues found (${issues.length}):\n${issues.map((i) => `  - ${i}`).join("\n")}`
            : "No issues detected.",
        ].join("\n")

        return {
          title: `analyze ${params.filePath!.split(/[/\\]/).pop()}`,
          metadata: { action: "analyze_code", success: issues.length === 0 } satisfies Metadata,
          output: out,
        }
      })

    const execGenerateTests = (params: Params) =>
      Effect.gen(function* () {
        if (!params.filePath) {
          return yield* Effect.fail(new Error("filePath parameter is required for generate_tests"))
        }
        const content = yield* Effect.promise(() => fs.readFile(params.filePath!, "utf-8"))
        const ext = params.filePath!.split(".").pop() ?? ""
        const fileName = params.filePath!.split(/[/\\]/).pop() ?? ""
        const baseName = fileName.replace(/\.[^.]+$/, "")

        const symbols: string[] = []
        const lines = content.split("\n")

        for (const line of lines) {
          const exportFn = line.match(/export\s+(?:async\s+)?function\s+(\w+)/)
          if (exportFn) symbols.push(exportFn[1]!)
          const exportConst = line.match(/export\s+const\s+(\w+)\s*=/)
          if (exportConst) symbols.push(exportConst[1]!)
          const exportClass = line.match(/export\s+(?:default\s+)?class\s+(\w+)/)
          if (exportClass) symbols.push(exportClass[1]!)
        }

        if (ext === "py") {
          for (const line of lines) {
            const pyFn = line.match(/^def\s+(\w+)\s*\(/)
            if (pyFn && !pyFn[1]!.startsWith("_")) symbols.push(pyFn[1]!)
            const pyClass = line.match(/^class\s+(\w+)/)
            if (pyClass) symbols.push(pyClass[1]!)
          }
        }

        if (ext === "go") {
          for (const line of lines) {
            const goFn = line.match(/^func\s+(\w+)\s*\(/)
            if (goFn && /^[A-Z]/.test(goFn[1]!)) symbols.push(goFn[1]!)
          }
        }

        if (ext === "rs") {
          for (const line of lines) {
            const rsFn = line.match(/pub\s+(?:async\s+)?fn\s+(\w+)/)
            if (rsFn) symbols.push(rsFn[1]!)
          }
        }

        if (ext === "java") {
          for (const line of lines) {
            const javaMethod = line.match(/public\s+(?:static\s+)?\w+\s+(\w+)\s*\(/)
            if (javaMethod) symbols.push(javaMethod[1]!)
          }
        }

        const testExt = ext === "py" ? "py" : ext === "go" ? "go" : ext === "rs" ? "rs" : ext
        const testFile =
          ext === "py"
            ? `test_${baseName}.py`
            : ext === "go"
              ? `${baseName}_test.go`
              : ext === "rs"
                ? `${baseName}_test.rs`
                : `${baseName}.test.${testExt}`

        const out = [
          `File: ${params.filePath}`,
          `Language: ${ext}`,
          `Exported symbols found: ${symbols.length}`,
          "",
          symbols.length > 0
            ? `Symbols to test:\n${symbols.map((s) => `  - ${s}`).join("\n")}`
            : "No exported symbols found.",
          "",
          `Suggested test file: ${testFile}`,
          "",
          "Use this information to write tests following the project's existing test patterns.",
          "Search for existing test files to match the framework, assertion style, and file structure.",
        ].join("\n")

        return {
          title: `test targets ${fileName}`,
          metadata: { action: "generate_tests", success: true } satisfies Metadata,
          output: out,
        }
      })

    const execScaffold = (params: Params, cwd: string) =>
      Effect.gen(function* () {
        const templateName = params.template ?? "node-typescript"
        const projectName = params.name ?? "my-project"
        const tmpl = TEMPLATES[templateName]
        if (!tmpl) {
          return yield* Effect.fail(
            new Error(`Unknown template: ${templateName}. Available: ${Object.keys(TEMPLATES).join(", ")}`),
          )
        }

        const projectDir = path.join(cwd, projectName)
        yield* Effect.promise(() => fs.mkdir(projectDir, { recursive: true }))

        const created: string[] = []
        for (const [filePath, content] of Object.entries(tmpl.files)) {
          const fullPath = path.join(projectDir, filePath)
          yield* Effect.promise(() => fs.mkdir(path.dirname(fullPath), { recursive: true }))

          let fileContent = content
          if (filePath === "package.json") {
            fileContent = content.replace(/"name":\s*""/, `"name": "${projectName}"`)
          }
          if (filePath === "Cargo.toml") {
            fileContent = content.replace(/^name = ""$/m, `name = "${projectName}"`)
          }
          if (filePath === "pyproject.toml") {
            fileContent = content.replace(/^name = ""$/m, `name = "${projectName}"`)
          }
          if (filePath === "go.mod") {
            fileContent = `module ${projectName}\n\ngo 1.22\n`
          }

          yield* Effect.promise(() => fs.writeFile(fullPath, fileContent, "utf-8"))
          created.push(filePath)
        }

        return {
          title: `scaffold ${templateName}`,
          metadata: { action: "scaffold_project", success: true } satisfies Metadata,
          output: `Created ${templateName} project at ${projectDir}\n\nFiles:\n${created.map((f) => `  ${f}`).join("\n")}`,
        }
      })

    const execRefactor = (params: Params) =>
      Effect.gen(function* () {
        if (!params.filePath) {
          return yield* Effect.fail(new Error("filePath parameter is required for refactor"))
        }
        if (!params.operation) {
          return yield* Effect.fail(new Error("operation parameter is required for refactor"))
        }

        const content = yield* Effect.promise(() => fs.readFile(params.filePath!, "utf-8"))
        const lines = content.split("\n")
        const fileName = params.filePath!.split(/[/\\]/).pop() ?? ""

        const ops: Record<string, string> = {
          "extract-function": [
            `File: ${params.filePath} (${lines.length} lines)`,
            "",
            "To extract a function:",
            "1. Identify the code block to extract",
            "2. Determine inputs (variables read) and outputs (variables modified)",
            "3. Create a new function with inputs as parameters",
            "4. Replace the original block with a function call",
            "5. Update imports if the function moves to another file",
          ].join("\n"),
          "rename-symbol": [
            `File: ${params.filePath} (${lines.length} lines)`,
            "",
            params.name
              ? `Symbol to rename: ${params.name}`
              : "Provide the 'name' parameter with format 'oldName:newName'",
            "",
            "To rename safely:",
            "1. Find ALL references to the symbol using grep",
            "2. Check for string references and dynamic access patterns",
            "3. Rename in all files that reference the symbol",
            "4. Run typecheck/build to verify no references were missed",
          ].join("\n"),
          "inline-variable": [
            `File: ${params.filePath} (${lines.length} lines)`,
            "",
            "To inline a variable:",
            "1. Find the variable declaration and its value",
            "2. Find all usages of the variable",
            "3. Replace each usage with the value expression",
            "4. Remove the declaration",
            "5. Verify the inlined expression has no side effects that change with multiple evaluation",
          ].join("\n"),
          "extract-interface": [
            `File: ${params.filePath} (${lines.length} lines)`,
            "",
            "To extract an interface:",
            "1. Identify the class or object shape to extract from",
            "2. List public methods and properties",
            "3. Create an interface with those signatures",
            "4. Make the class implement the interface",
            "5. Update consumers to depend on the interface instead of the concrete class",
          ].join("\n"),
        }

        const out = ops[params.operation!]
        if (!out) {
          return yield* Effect.fail(
            new Error(`Unknown operation: ${params.operation}. Available: ${Object.keys(ops).join(", ")}`),
          )
        }

        return {
          title: `refactor ${params.operation} ${fileName}`,
          metadata: { action: "refactor", success: true } satisfies Metadata,
          output: out,
        }
      })

    const execAutoFix = (params: Params, cwd: string) =>
      Effect.gen(function* () {
        if (!params.command) {
          return yield* Effect.fail(new Error("command parameter is required for auto_fix"))
        }
        const cfg = yield* config.get()
        const shell = Shell.acceptable(cfg.shell)
        const timeout = params.timeout ?? 60_000
        const maxAttempts = 5
        const results: string[] = []

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const { output: cmdOutput, exitCode } = yield* runCommand(
            shell,
            params.command!,
            cwd,
            timeout,
          )

          results.push(`--- Attempt ${attempt} (exit ${exitCode ?? "timeout"}) ---\n${cmdOutput}`)

          if (exitCode === 0) {
            return {
              title: `auto_fix (${attempt} attempt${attempt > 1 ? "s" : ""})`,
              metadata: {
                action: "auto_fix",
                success: true,
                exitCode,
                iterations: attempt,
              } satisfies Metadata,
              output: [
                `Command succeeded on attempt ${attempt}/${maxAttempts}.`,
                `Command: ${params.command}`,
                "",
                ...results,
              ].join("\n"),
            }
          }

          if (attempt < maxAttempts) {
            results.push(`\nFailed. Analyze the error output above and fix the issue before attempt ${attempt + 1}.\n`)
          }
        }

        return {
          title: `auto_fix (failed after ${maxAttempts} attempts)`,
          metadata: {
            action: "auto_fix",
            success: false,
            exitCode: 1,
            iterations: maxAttempts,
          } satisfies Metadata,
          output: [
            `Command failed after ${maxAttempts} attempts.`,
            `Command: ${params.command}`,
            "",
            ...results,
            "",
            "All attempts exhausted. Review the errors above and try a different approach.",
          ].join("\n"),
        }
      })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context

          const permission =
            params.action === "analyze_code" || params.action === "generate_tests"
              ? "read"
              : params.action === "run_code"
                ? "bash"
                : "write"

          yield* ctx.ask({
            permission,
            patterns: [params.filePath ?? params.command ?? "*"],
            always: ["*"],
            metadata: { action: params.action },
          })

          const cwd = instance.directory

          switch (params.action) {
            case "run_code":
              return yield* execRunCode(params)
            case "analyze_code":
              return yield* execAnalyzeCode(params)
            case "generate_tests":
              return yield* execGenerateTests(params)
            case "scaffold_project":
              return yield* execScaffold(params, cwd)
            case "refactor":
              return yield* execRefactor(params)
            case "auto_fix":
              return yield* execAutoFix(params, cwd)
          }
        }).pipe(Effect.orDie),
    }
  }),
)
