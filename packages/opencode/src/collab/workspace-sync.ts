import { Effect, Schema } from "effect"
import fs from "fs/promises"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

const WORKSPACE_DIR = ".zenkai-workspace"
const WORKSPACE_META = "workspace.json"

export const WorkspaceID = Schema.String.pipe(Schema.brand("WorkspaceID"))
export type WorkspaceID = Schema.Schema.Type<typeof WorkspaceID>

const WorkspaceMeta = Schema.Struct({
  id: WorkspaceID,
  name: Schema.String,
  path: Schema.String,
  createdAt: Schema.Number,
  sessions: Schema.Array(
    Schema.Struct({
      filename: Schema.String,
      label: Schema.optional(Schema.String),
      addedAt: Schema.Number,
      addedBy: Schema.optional(Schema.String),
    }),
  ),
})
type WorkspaceMeta = Schema.Schema.Type<typeof WorkspaceMeta>

export const WorkspaceSessionEntry = Schema.Struct({
  filename: Schema.String,
  label: Schema.optional(Schema.String),
  addedAt: Schema.Number,
  addedBy: Schema.optional(Schema.String),
})
export type WorkspaceSessionEntry = Schema.Schema.Type<typeof WorkspaceSessionEntry>

function workspacePath(projectRoot: string): string {
  return path.join(projectRoot, WORKSPACE_DIR)
}

function metaPath(projectRoot: string): string {
  return path.join(workspacePath(projectRoot), WORKSPACE_META)
}

async function readMeta(projectRoot: string): Promise<WorkspaceMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(projectRoot), "utf-8")
    return JSON.parse(raw) as WorkspaceMeta
  } catch {
    return null
  }
}

async function writeMeta(projectRoot: string, meta: WorkspaceMeta): Promise<void> {
  const dir = workspacePath(projectRoot)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(metaPath(projectRoot), JSON.stringify(meta, null, 2), "utf-8")
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, ".git"))
    return true
  } catch {
    return false
  }
}

export const createWorkspace = Effect.fn("Collab.createWorkspace")(function* (
  name: string,
  projectRoot: string,
) {
  const id = WorkspaceID.make(`ws_${Date.now().toString(36)}`)
  const dir = workspacePath(projectRoot)

  yield* Effect.promise(() => fs.mkdir(dir, { recursive: true }))

  const meta: WorkspaceMeta = {
    id,
    name,
    path: projectRoot,
    createdAt: Date.now(),
    sessions: [],
  }

  yield* Effect.promise(() => writeMeta(projectRoot, meta))

  const gitignorePath = path.join(dir, ".gitkeep")
  yield* Effect.promise(() => fs.writeFile(gitignorePath, "", "utf-8"))

  return meta
})

export const addToWorkspace = Effect.fn("Collab.addToWorkspace")(function* (
  projectRoot: string,
  sessionFile: string,
  label?: string,
) {
  const meta = yield* Effect.promise(() => readMeta(projectRoot))
  if (!meta) throw new Error("No workspace found. Initialize with createWorkspace first.")

  const filename = path.basename(sessionFile)
  const dest = path.join(workspacePath(projectRoot), filename)

  yield* Effect.promise(() => fs.copyFile(sessionFile, dest))

  const entry: WorkspaceSessionEntry = {
    filename,
    label,
    addedAt: Date.now(),
  }

  const updated = { ...meta, sessions: [...meta.sessions, entry] }
  yield* Effect.promise(() => writeMeta(projectRoot, updated))

  return entry
})

export const listWorkspaceSessions = Effect.fn("Collab.listWorkspaceSessions")(function* (
  projectRoot: string,
) {
  const meta = yield* Effect.promise(() => readMeta(projectRoot))
  if (!meta) return []
  return meta.sessions
})

export const getWorkspace = Effect.fn("Collab.getWorkspace")(function* (projectRoot: string) {
  return yield* Effect.promise(() => readMeta(projectRoot))
})

export const syncWorkspace = Effect.fn("Collab.syncWorkspace")(function* (projectRoot: string) {
  const meta = yield* Effect.promise(() => readMeta(projectRoot))
  if (!meta) throw new Error("No workspace found.")

  const isGit = yield* Effect.promise(() => isGitRepo(projectRoot))
  if (!isGit) return { synced: false, reason: "not-a-git-repo" as const }

  const wsDir = workspacePath(projectRoot)
  const relativePath = path.relative(projectRoot, wsDir).replaceAll("\\", "/")

  yield* Effect.promise(async () => {
    await execAsync(`git add "${relativePath}"`, { cwd: projectRoot })
    try {
      await execAsync(`git commit -m "zenkai: sync shared sessions"`, { cwd: projectRoot })
    } catch {
      // nothing to commit
    }
  })

  return { synced: true, reason: "committed" as const }
})

export const removeFromWorkspace = Effect.fn("Collab.removeFromWorkspace")(function* (
  projectRoot: string,
  filename: string,
) {
  const meta = yield* Effect.promise(() => readMeta(projectRoot))
  if (!meta) throw new Error("No workspace found.")

  const filePath = path.join(workspacePath(projectRoot), filename)
  yield* Effect.promise(() => fs.unlink(filePath).catch(() => {}))

  const updated = { ...meta, sessions: meta.sessions.filter((s) => s.filename !== filename) }
  yield* Effect.promise(() => writeMeta(projectRoot, updated))
})

export * as WorkspaceSync from "./workspace-sync"
