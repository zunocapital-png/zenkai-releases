import fs from "fs/promises"
import path from "path"
import os from "os"
import { spawn } from "child_process"

export type SupportedLanguage = "javascript" | "typescript" | "python" | "bash"

export interface ExecutionOptions {
  timeout?: number
  maxOutputSize?: number
  workingDir?: string
  env?: Record<string, string>
}

export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number | null
  duration: number
  truncated: boolean
  language: SupportedLanguage
}

export interface AnalysisResult {
  execution: ExecutionResult
  success: boolean
  summary: string
  outputLines: number
  errorLines: number
}

const LANGUAGE_CONFIG: Record<SupportedLanguage, { command: string; args: string[]; extension: string }> = {
  javascript: { command: "bun", args: ["run"], extension: ".js" },
  typescript: { command: "bun", args: ["run"], extension: ".ts" },
  python: { command: "python3", args: [], extension: ".py" },
  bash: { command: "bash", args: [], extension: ".sh" },
}

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_MAX_OUTPUT = 102_400

function truncateOutput(output: string, maxSize: number): { text: string; truncated: boolean } {
  if (output.length <= maxSize) {
    return { text: output, truncated: false }
  }
  return { text: output.slice(0, maxSize), truncated: true }
}

export async function executeCode(
  code: string,
  language: SupportedLanguage,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const maxOutputSize = options.maxOutputSize ?? DEFAULT_MAX_OUTPUT
  const config = LANGUAGE_CONFIG[language]

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zenkai-sandbox-"))
  const workingDir = options.workingDir ?? tmpDir
  const filePath = path.join(tmpDir, `script${config.extension}`)

  try {
    await fs.writeFile(filePath, code, "utf-8")

    const args = [...config.args, filePath]
    const start = Date.now()

    const result = await new Promise<ExecutionResult>((resolve) => {
      let stdout = ""
      let stderr = ""
      let killed = false

      const proc = spawn(config.command, args, {
        cwd: workingDir,
        env: { ...process.env, ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
      })

      const timer = setTimeout(() => {
        killed = true
        proc.kill("SIGKILL")
      }, timeout)

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on("close", (exitCode) => {
        clearTimeout(timer)
        const duration = Date.now() - start

        const outResult = truncateOutput(stdout, maxOutputSize)
        const errResult = truncateOutput(stderr, maxOutputSize)

        resolve({
          stdout: outResult.text,
          stderr: errResult.text,
          exitCode: killed ? null : (exitCode ?? 1),
          duration,
          truncated: outResult.truncated || errResult.truncated,
          language,
        })
      })

      proc.on("error", (err) => {
        clearTimeout(timer)
        const duration = Date.now() - start
        resolve({
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          duration,
          truncated: false,
          language,
        })
      })
    })

    return result
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function executeAndAnalyze(
  code: string,
  language: SupportedLanguage,
  options: ExecutionOptions = {},
): Promise<AnalysisResult> {
  const execution = await executeCode(code, language, options)

  const success = execution.exitCode === 0
  const outputLines = execution.stdout ? execution.stdout.split("\n").length : 0
  const errorLines = execution.stderr ? execution.stderr.split("\n").length : 0

  let summary: string
  if (execution.exitCode === null) {
    summary = `Execution timed out after ${execution.duration}ms`
  } else if (success) {
    summary = `Completed successfully in ${execution.duration}ms (${outputLines} lines of output)`
  } else {
    summary = `Failed with exit code ${execution.exitCode} in ${execution.duration}ms`
    if (execution.stderr) {
      const firstError = execution.stderr.split("\n")[0]
      summary += `: ${firstError}`
    }
  }

  return {
    execution,
    success,
    summary,
    outputLines,
    errorLines,
  }
}

export * as CodeInterpreter from "./code-interpreter"
