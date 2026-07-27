import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Git } from "@/git"
import { InstanceState } from "@/effect/instance-state"
import DESCRIPTION from "./git_tools.txt"

const ActionSchema = Schema.Literals([
  "diff",
  "log",
  "blame",
  "branch",
  "status",
  "stage",
  "commit",
])

export const Parameters = Schema.Struct({
  action: ActionSchema.annotate({
    description:
      "The git action to perform: diff, log, blame, branch, status, stage, or commit",
  }),
  file: Schema.optional(Schema.String).annotate({
    description: "File path (required for blame, optional for diff/stage)",
  }),
  ref: Schema.optional(Schema.String).annotate({
    description: "Git ref for diff (default HEAD) or branch name for branch switching",
  }),
  message: Schema.optional(Schema.String).annotate({
    description: "Commit message (required for commit action)",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Number of commits to return for log (default 20)",
  }),
  unstage: Schema.optional(Schema.Boolean).annotate({
    description: "If true, unstage the file instead of staging it",
  }),
  create: Schema.optional(Schema.Boolean).annotate({
    description: "If true, create a new branch instead of switching",
  }),
  all: Schema.optional(Schema.Boolean).annotate({
    description: "If true, stage all files or show all diffs",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

const formatTimestamp = (epoch: string) => {
  const seconds = parseInt(epoch, 10)
  if (isNaN(seconds)) return epoch
  const diff = Math.floor(Date.now() / 1000) - seconds
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export const GitTools = Tool.define(
  "git_tools",
  Effect.gen(function* () {
    const git = yield* Git.Service

    const execDiff = (params: Params, cwd: string) =>
      Effect.gen(function* () {
        const ref = params.ref ?? "HEAD"
        const hasHead = yield* git.hasHead(cwd)
        if (!hasHead) {
          const items = yield* git.status(cwd)
          return {
            title: "git diff (no HEAD)",
            metadata: { action: "diff", files: items.length },
            output: items.length === 0
              ? "No changes"
              : items.map((i) => `${i.code} ${i.file}`).join("\n"),
          }
        }
        if (params.file) {
          const patch = yield* git.patch(cwd, ref, params.file)
          return {
            title: `diff ${params.file}`,
            metadata: { action: "diff", file: params.file, truncated: patch.truncated },
            output: patch.text || "No changes",
          }
        }
        const patch = yield* git.patchAll(cwd, ref)
        const untracked = yield* git.status(cwd)
        const untrackedPatches = yield* Effect.forEach(
          untracked.filter((i) => i.code === "??"),
          (i) => git.patchUntracked(cwd, i.file).pipe(Effect.map((p) => p.text)),
        )
        const combined = [patch.text, ...untrackedPatches].filter(Boolean).join("\n")
        return {
          title: "git diff",
          metadata: { action: "diff", truncated: patch.truncated },
          output: combined || "No changes",
        }
      })

    const execLog = (params: Params, cwd: string) =>
      Effect.gen(function* () {
        const limit = params.limit ?? 20
        const result = yield* git.run(
          [
            "log",
            `--max-count=${limit}`,
            "--format=%H%x00%an%x00%ae%x00%at%x00%s",
            "--no-decorate",
          ],
          { cwd },
        )
        if (result.exitCode !== 0) {
          return {
            title: "git log",
            metadata: { action: "log", commits: 0 },
            output: "No commits found",
          }
        }
        const lines = result
          .text()
          .trim()
          .split("\n")
          .filter(Boolean)
        const entries = lines.map((line) => {
          const [hash, author, _email, timestamp, ...msgParts] = line.split("\0")
          const msg = msgParts.join("\0")
          return `${hash?.slice(0, 8)} ${formatTimestamp(timestamp ?? "")} ${author}: ${msg}`
        })
        return {
          title: "git log",
          metadata: { action: "log", commits: entries.length },
          output: entries.join("\n") || "No commits",
        }
      })

    const execBlame = (params: Params, cwd: string) =>
      Effect.gen(function* () {
        if (!params.file) {
          return yield* Effect.fail(new Error("file parameter is required for blame"))
        }
        const result = yield* git.run(
          ["blame", "--porcelain", params.file],
          { cwd },
        )
        if (result.exitCode !== 0) {
          return yield* Effect.fail(new Error(`git blame failed: ${result.stderr.toString()}`))
        }
        const raw = result.text()
        const output: string[] = []
        const blocks = raw.split(/(?=^[0-9a-f]{40} )/m).filter(Boolean)
        for (const block of blocks) {
          const lines = block.split("\n")
          const header = lines[0] ?? ""
          const match = header.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)/)
          if (!match) continue
          const hash = match[1]!.slice(0, 8)
          const lineNum = match[3]
          let author = ""
          let timestamp = ""
          let content = ""
          for (const l of lines) {
            if (l.startsWith("author ")) author = l.slice(7)
            else if (l.startsWith("author-time ")) timestamp = l.slice(12)
            else if (l.startsWith("\t")) content = l.slice(1)
          }
          output.push(`${hash} ${formatTimestamp(timestamp)} ${author.padEnd(16)} L${lineNum}: ${content}`)
        }
        return {
          title: `blame ${params.file}`,
          metadata: { action: "blame", file: params.file },
          output: output.join("\n") || "No blame data",
        }
      })

    const execBranch = (params: Params, cwd: string) =>
      Effect.gen(function* () {
        if (params.create && params.ref) {
          const result = yield* git.run(["checkout", "-b", params.ref], { cwd })
          if (result.exitCode !== 0) {
            return yield* Effect.fail(new Error(`Failed to create branch: ${result.stderr.toString()}`))
          }
          return {
            title: `branch create ${params.ref}`,
            metadata: { action: "branch", created: params.ref },
            output: `Created and switched to branch '${params.ref}'`,
          }
        }
        if (params.ref) {
          const result = yield* git.run(["checkout", params.ref], { cwd })
          if (result.exitCode !== 0) {
            return yield* Effect.fail(new Error(`Failed to switch branch: ${result.stderr.toString()}`))
          }
          return {
            title: `branch switch ${params.ref}`,
            metadata: { action: "branch", switched: params.ref },
            output: `Switched to branch '${params.ref}'`,
          }
        }
        const current = yield* git.branch(cwd)
        const result = yield* git.run(
          ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
          { cwd },
        )
        const branches = result
          .text()
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((b) => (b === current ? `* ${b}` : `  ${b}`))
        return {
          title: "git branch",
          metadata: { action: "branch", current, count: branches.length },
          output: branches.join("\n") || "No branches",
        }
      })

    const execStatus = (_params: Params, cwd: string) =>
      Effect.gen(function* () {
        const items = yield* git.status(cwd)
        if (items.length === 0) {
          return {
            title: "git status",
            metadata: { action: "status", files: 0 },
            output: "Working tree clean",
          }
        }
        const lines = items.map((i) => `${i.code.trim().padEnd(2)} ${i.file}`)
        return {
          title: "git status",
          metadata: { action: "status", files: items.length },
          output: lines.join("\n"),
        }
      })

    const execStage = (params: Params, cwd: string) =>
      Effect.gen(function* () {
        if (params.unstage) {
          const args = params.all
            ? ["reset", "HEAD", "--", "."]
            : params.file
              ? ["reset", "HEAD", "--", params.file]
              : (yield* Effect.fail(new Error("file or all parameter required for unstage")), [])
          const result = yield* git.run(args, { cwd })
          if (result.exitCode !== 0) {
            return yield* Effect.fail(new Error(`Unstage failed: ${result.stderr.toString()}`))
          }
          return {
            title: params.all ? "unstage all" : `unstage ${params.file}`,
            metadata: { action: "stage", unstaged: true },
            output: params.all ? "Unstaged all files" : `Unstaged ${params.file}`,
          }
        }
        const args = params.all
          ? ["add", "--all"]
          : params.file
            ? ["add", "--", params.file]
            : (yield* Effect.fail(new Error("file or all parameter required for stage")), [])
        const result = yield* git.run(args, { cwd })
        if (result.exitCode !== 0) {
          return yield* Effect.fail(new Error(`Stage failed: ${result.stderr.toString()}`))
        }
        return {
          title: params.all ? "stage all" : `stage ${params.file}`,
          metadata: { action: "stage", staged: true },
          output: params.all ? "Staged all files" : `Staged ${params.file}`,
        }
      })

    const execCommit = (params: Params, cwd: string) =>
      Effect.gen(function* () {
        if (!params.message) {
          return yield* Effect.fail(new Error("message parameter is required for commit"))
        }
        const result = yield* git.run(["commit", "-m", params.message], { cwd })
        if (result.exitCode !== 0) {
          return yield* Effect.fail(new Error(`Commit failed: ${result.stderr.toString()}`))
        }
        const output = result.text()
        return {
          title: "git commit",
          metadata: { action: "commit" },
          output,
        }
      })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context

          yield* ctx.ask({
            permission: params.action === "status" || params.action === "log" || params.action === "diff" || params.action === "blame"
              ? "read"
              : "write",
            patterns: [params.file ?? "*"],
            always: ["*"],
            metadata: { action: params.action },
          })

          const cwd = instance.directory

          switch (params.action) {
            case "diff":
              return yield* execDiff(params, cwd)
            case "log":
              return yield* execLog(params, cwd)
            case "blame":
              return yield* execBlame(params, cwd)
            case "branch":
              return yield* execBranch(params, cwd)
            case "status":
              return yield* execStatus(params, cwd)
            case "stage":
              return yield* execStage(params, cwd)
            case "commit":
              return yield* execCommit(params, cwd)
          }
        }).pipe(Effect.orDie),
    }
  }),
)
