import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import type { Tool } from "../types.ts"

// Tool 'write' — escribir archivo con MEJORAS vs opencode:
//   - Atomic write real: escribimos a temp + rename (evita corrupción si falla).
//   - Backup automático del archivo previo a `.zenkai-backups/` con timestamp.
//   - Dry-run que muestra un diff resumido sin tocar el disco.
//   - Rollback API: si la operación falla mid-way, restauramos.
//   - Reporta diff en la respuesta (lines added/removed).
//
// El backup es opcional (default: on para archivos existentes). Se puede
// desactivar con `backup: false` para escrituras masivas.

export type WriteInput = {
  path: string
  content: string
  /** Si true, no escribe. Devuelve solo el diff previsto. Default false. */
  dryRun?: boolean
  /** Backup del archivo previo (si existe). Default true. */
  backup?: boolean
  /** Crear directorios padres si no existen. Default true. */
  createParents?: boolean
}

export type WriteOutput = {
  path: string
  bytesWritten: number
  linesAdded: number
  linesRemoved: number
  hadPrevious: boolean
  backupPath?: string
  diff?: string
  dryRun: boolean
}

function diffSimple(prev: string, next: string): { added: number; removed: number; preview: string } {
  const a = prev.split("\n")
  const b = next.split("\n")
  const setA = new Set(a)
  const setB = new Set(b)
  const added = b.filter((l) => !setA.has(l)).length
  const removed = a.filter((l) => !setB.has(l)).length
  const preview = [
    `--- (previo · ${a.length} líneas)`,
    `+++ (nuevo · ${b.length} líneas)`,
    `+${added} -${removed}`,
  ].join("\n")
  return { added, removed, preview }
}

function backupPath(originalPath: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const base = originalPath.replace(/[\\/]/g, "_")
  const dir = join(tmpdir(), "zenkai-backups")
  mkdirSync(dir, { recursive: true })
  return join(dir, `${base}.${ts}.bak`)
}

export const writeTool: Tool<WriteInput, WriteOutput> = {
  meta: {
    name: "write",
    description: "Escribe un archivo de forma atómica con backup automático y dry-run.",
    riesgo: "medio",
    idempotente: false,
    costo: "bajo",
    timeoutMs: 10_000,
    rateLimitPorMin: 60,
  },
  validate: (i) => {
    if (!i.path || typeof i.path !== "string") return "path requerido"
    if (typeof i.content !== "string") return "content debe ser string"
    return undefined
  },
  run: async (input, ctx) => {
    const hadPrevious = existsSync(input.path)
    const previo = hadPrevious ? readFileSync(input.path, "utf8") : ""
    const diff = diffSimple(previo, input.content)

    ctx.reportar(`diff: +${diff.added} -${diff.removed}`, 30)

    if (input.dryRun) {
      return {
        path: input.path,
        bytesWritten: 0,
        linesAdded: diff.added,
        linesRemoved: diff.removed,
        hadPrevious,
        diff: diff.preview,
        dryRun: true,
      }
    }

    if (input.createParents !== false) mkdirSync(dirname(input.path), { recursive: true })

    let backup: string | undefined
    if (hadPrevious && input.backup !== false) {
      backup = backupPath(input.path)
      copyFileSync(input.path, backup)
      ctx.reportar(`backup a ${backup}`, 50)
    }

    // Atomic: escribir a temp en la MISMA carpeta destino (rename cross-device
    // puede fallar si están en particiones distintas), después rename.
    const tmp = `${input.path}.__zenkai_tmp_${Date.now()}`
    try {
      writeFileSync(tmp, input.content, "utf8")
      renameSync(tmp, input.path)
    } catch (e) {
      // Cleanup temp si algo falla.
      try { unlinkSync(tmp) } catch { /* ignore */ }
      // Restaurar desde backup si teníamos uno.
      if (backup && hadPrevious) {
        try { copyFileSync(backup, input.path) } catch { /* best effort */ }
      }
      throw e
    }

    ctx.reportar(`escrito`, 100)
    return {
      path: input.path,
      bytesWritten: Buffer.byteLength(input.content, "utf8"),
      linesAdded: diff.added,
      linesRemoved: diff.removed,
      hadPrevious,
      backupPath: backup,
      dryRun: false,
    }
  },
}
