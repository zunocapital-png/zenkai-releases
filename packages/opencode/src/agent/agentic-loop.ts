import { Effect, Context, Layer, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import type { DeepMutable } from "@opencode-ai/core/schema"

const DESTRUCTIVE_PATTERNS = [
  "rm -rf",
  "rm -r",
  "rimraf",
  "rmdir",
  "del /s",
  "git push",
  "git push --force",
  "git push -f",
  "git reset --hard",
  "git clean -fd",
  "git checkout -- .",
  "DROP TABLE",
  "DROP DATABASE",
  "TRUNCATE TABLE",
  "DELETE FROM",
  "unlink(",
  "fs.rm(",
  "fs.rmSync(",
  "fs.unlink(",
  "fs.unlinkSync(",
  "shutil.rmtree",
  "os.remove(",
  "format c:",
  "mkfs.",
  "dd if=",
  "kubectl delete",
  "docker rm",
  "docker system prune",
  "npm unpublish",
]

export type LoopStatus = "idle" | "running" | "paused" | "completed" | "failed" | "stopped"

export const StepResult = Schema.Struct({
  stepNumber: Schema.Number,
  action: Schema.String,
  tool: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Unknown),
  output: Schema.optional(Schema.Unknown),
  reasoning: Schema.String,
  durationMs: Schema.Number,
  requiresConfirmation: Schema.optional(Schema.Boolean),
  destructivePattern: Schema.optional(Schema.String),
}).annotate({ identifier: "AgenticLoopStepResult" })
export type StepResult = DeepMutable<Schema.Schema.Type<typeof StepResult>>

export const LoopState = Schema.Struct({
  currentStep: Schema.Number,
  totalSteps: Schema.Number,
  status: Schema.Literals(["idle", "running", "paused", "completed", "failed", "stopped"]),
  history: Schema.Array(StepResult),
  accumulatedContext: Schema.String,
  task: Schema.String,
  startedAt: Schema.optional(Schema.Number),
  completedAt: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
}).annotate({ identifier: "AgenticLoopState" })
export type LoopState = DeepMutable<Schema.Schema.Type<typeof LoopState>>

export interface AgenticLoopOptions {
  readonly maxSteps?: number
  readonly onProgress?: (state: LoopState) => void
  readonly onStepComplete?: (step: StepResult, state: LoopState) => void
  readonly confirmDestructive?: (action: string, pattern: string) => Promise<boolean>
  readonly planTask?: (task: string, context: string) => Promise<string>
  readonly executeAction?: (action: string, context: string) => Promise<{ tool?: string; input?: unknown; output: unknown }>
  readonly evaluateResult?: (task: string, stepResult: StepResult, context: string) => Promise<{ complete: boolean; nextAction: string; reasoning: string }>
  readonly shouldContinue?: (state: LoopState) => boolean
}

function createInitialState(task: string, maxSteps: number): LoopState {
  return {
    currentStep: 0,
    totalSteps: maxSteps,
    status: "idle",
    history: [],
    accumulatedContext: "",
    task,
    startedAt: undefined,
    completedAt: undefined,
    error: undefined,
  }
}

function detectDestructiveAction(action: string): string | undefined {
  const normalized = action.toLowerCase()
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (normalized.includes(pattern.toLowerCase())) {
      return pattern
    }
  }
  return undefined
}

function appendContext(existing: string, step: StepResult): string {
  const entry = `[Step ${step.stepNumber}] ${step.action}: ${typeof step.output === "string" ? step.output.slice(0, 500) : JSON.stringify(step.output).slice(0, 500)}`
  return existing ? `${existing}\n${entry}` : entry
}

let pauseFlag = false

export function pause(): void {
  pauseFlag = true
}

export function resume(): void {
  pauseFlag = false
}

export function isPaused(): boolean {
  return pauseFlag
}

async function waitForResume(): Promise<void> {
  while (pauseFlag) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function executeStep(
  stepNumber: number,
  action: string,
  options: AgenticLoopOptions,
  context: string,
): Promise<StepResult> {
  const startTime = Date.now()

  const destructivePattern = detectDestructiveAction(action)

  if (destructivePattern) {
    const confirm = options.confirmDestructive
    if (confirm) {
      const confirmed = await confirm(action, destructivePattern)
      if (!confirmed) {
        return {
          stepNumber,
          action,
          reasoning: `Blocked: destructive action "${destructivePattern}" was not confirmed`,
          durationMs: Date.now() - startTime,
          requiresConfirmation: true,
          destructivePattern,
        }
      }
    } else {
      return {
        stepNumber,
        action,
        reasoning: `Blocked: destructive action "${destructivePattern}" requires confirmation handler`,
        durationMs: Date.now() - startTime,
        requiresConfirmation: true,
        destructivePattern,
      }
    }
  }

  const execute = options.executeAction
  if (!execute) {
    return {
      stepNumber,
      action,
      reasoning: "No executeAction handler provided",
      durationMs: Date.now() - startTime,
    }
  }

  try {
    const result = await execute(action, context)
    return {
      stepNumber,
      action,
      tool: result.tool,
      input: result.input,
      output: result.output,
      reasoning: `Executed action successfully`,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    return {
      stepNumber,
      action,
      reasoning: `Action failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - startTime,
    }
  }
}

export async function runAgenticLoop(
  task: string,
  maxSteps?: number,
  options?: AgenticLoopOptions,
): Promise<LoopState> {
  const resolvedMaxSteps = maxSteps ?? options?.maxSteps ?? 25
  const opts = options ?? {}
  const state = createInitialState(task, resolvedMaxSteps)

  state.status = "running"
  state.startedAt = Date.now()
  opts.onProgress?.(state)

  try {
    const plan = opts.planTask
      ? await opts.planTask(task, state.accumulatedContext)
      : task

    let nextAction = plan

    for (let step = 1; step <= resolvedMaxSteps; step++) {
      if (pauseFlag) {
        state.status = "paused"
        opts.onProgress?.(state)
        await waitForResume()
        state.status = "running"
        opts.onProgress?.(state)
      }

      const shouldContinue = opts.shouldContinue
      if (shouldContinue && !shouldContinue(state)) {
        state.status = "stopped"
        state.completedAt = Date.now()
        opts.onProgress?.(state)
        return state
      }

      state.currentStep = step

      const stepResult = await executeStep(
        step,
        nextAction,
        opts,
        state.accumulatedContext,
      )

      state.history.push(stepResult)
      state.accumulatedContext = appendContext(state.accumulatedContext, stepResult)
      opts.onStepComplete?.(stepResult, state)
      opts.onProgress?.(state)

      if (stepResult.requiresConfirmation && stepResult.destructivePattern) {
        state.status = "stopped"
        state.completedAt = Date.now()
        state.error = `Stopped: unconfirmed destructive action "${stepResult.destructivePattern}"`
        opts.onProgress?.(state)
        return state
      }

      const evaluate = opts.evaluateResult
      if (evaluate) {
        const evaluation = await evaluate(task, stepResult, state.accumulatedContext)

        if (evaluation.complete) {
          state.status = "completed"
          state.completedAt = Date.now()
          opts.onProgress?.(state)
          return state
        }

        nextAction = evaluation.nextAction
      } else {
        if (step >= resolvedMaxSteps) break
        nextAction = task
      }
    }

    if (state.status === "running") {
      state.status = state.currentStep >= resolvedMaxSteps ? "completed" : "failed"
      state.completedAt = Date.now()
      opts.onProgress?.(state)
    }
  } catch (err) {
    state.status = "failed"
    state.completedAt = Date.now()
    state.error = err instanceof Error ? err.message : String(err)
    opts.onProgress?.(state)
  }

  return state
}

export function getStepSummary(state: LoopState): string {
  const lines = state.history.map(
    (s) => `Step ${s.stepNumber}: ${s.action} (${s.durationMs}ms) - ${s.reasoning}`,
  )
  return lines.join("\n")
}

export function getLastStep(state: LoopState): StepResult | undefined {
  return state.history[state.history.length - 1]
}

export function isTerminal(status: LoopStatus): boolean {
  return status === "completed" || status === "failed" || status === "stopped"
}

export interface Interface {
  readonly run: (
    task: string,
    maxSteps?: number,
    options?: AgenticLoopOptions,
  ) => Effect.Effect<LoopState>
  readonly pause: () => Effect.Effect<void>
  readonly resume: () => Effect.Effect<void>
  readonly isPaused: () => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/AgenticLoop") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    return Service.of({
      run: Effect.fn("AgenticLoop.run")(function* (
        task: string,
        maxSteps?: number,
        options?: AgenticLoopOptions,
      ) {
        return yield* Effect.promise(() => runAgenticLoop(task, maxSteps, options))
      }),
      pause: Effect.fn("AgenticLoop.pause")(function* () {
        pause()
      }),
      resume: Effect.fn("AgenticLoop.resume")(function* () {
        resume()
      }),
      isPaused: Effect.fn("AgenticLoop.isPaused")(function* () {
        return isPaused()
      }),
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [],
})

export * as AgenticLoop from "./agentic-loop"
