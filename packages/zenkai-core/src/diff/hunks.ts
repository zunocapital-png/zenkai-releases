import { readFileSync, writeFileSync, existsSync } from "node:fs"

// Diff hunks parser + applier con confirmar/rechazar por hunk (Cursor-style).
//
// Formato soportado: unified diff estándar (`git diff` / `diff -u` / lo que
// producen los LLMs cuando les pedís cambios). Aceptamos un archivo por vez o
// un multi-file diff con secciones `--- a/... +++ b/...`.
//
// Diseño clave:
//   - Cada hunk es independiente. Podés aceptar los 2 primeros y rechazar el 3ro.
//   - Aplica en memoria primero, valida el resultado, y RECIÉN escribe al disco
//     (o devuelve el nuevo contenido sin escribir — modo dry-run).
//   - Devuelve un objeto rich con `preview` (contenido resultante), `conflicts`
//     (hunks que no matchearon), y `applied` (los que se aplicaron).

export type Hunk = {
  /** Línea 1-indexed del archivo original donde arranca el hunk. */
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  /** Líneas del hunk con prefijo (" ", "+", "-"). */
  lineas: string[]
  /** Texto original que este hunk pretende reemplazar (para validar). */
  contextoOriginal: string
  /** Texto nuevo que este hunk produce. */
  contextoNuevo: string
}

export type FileDiff = {
  pathOriginal: string
  pathNuevo: string
  hunks: Hunk[]
}

export type DiffParsed = {
  files: FileDiff[]
}

/**
 * Parsea un unified diff en memoria. Robusto a diffs "sucios" que producen
 * los LLMs (ej. sin @@ headers exactos — inferimos por contexto).
 */
export function parseDiff(raw: string): DiffParsed {
  const files: FileDiff[] = []
  const lines = raw.split(/\r?\n/)
  let current: FileDiff | undefined
  let hunk: Hunk | undefined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    // File header: `--- a/path`
    if (line.startsWith("--- ")) {
      if (current) files.push(current)
      const pathOriginal = extraerPath(line.slice(4))
      const nextLine = lines[i + 1] ?? ""
      const pathNuevo = nextLine.startsWith("+++ ") ? extraerPath(nextLine.slice(4)) : pathOriginal
      current = { pathOriginal, pathNuevo, hunks: [] }
      hunk = undefined
      if (nextLine.startsWith("+++ ")) i++
      continue
    }
    // Hunk header: `@@ -oldStart,oldCount +newStart,newCount @@`
    if (line.startsWith("@@")) {
      const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line)
      if (!m || !current) continue
      if (hunk) current.hunks.push(finalizarHunk(hunk))
      hunk = {
        oldStart: Number(m[1]),
        oldCount: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newCount: m[4] ? Number(m[4]) : 1,
        lineas: [],
        contextoOriginal: "",
        contextoNuevo: "",
      }
      continue
    }
    if (!hunk || !current) continue
    // Líneas de hunk: " " (contexto), "+" (nueva), "-" (removida).
    if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-")) {
      hunk.lineas.push(line)
    }
    // "\ No newline at end of file" — ignorable.
  }
  if (hunk && current) current.hunks.push(finalizarHunk(hunk))
  if (current) files.push(current)
  return { files }
}

function finalizarHunk(h: Hunk): Hunk {
  const original: string[] = []
  const nuevo: string[] = []
  for (const l of h.lineas) {
    const prefijo = l[0]
    const contenido = l.slice(1)
    if (prefijo === " ") { original.push(contenido); nuevo.push(contenido) }
    else if (prefijo === "-") original.push(contenido)
    else if (prefijo === "+") nuevo.push(contenido)
  }
  h.contextoOriginal = original.join("\n")
  h.contextoNuevo = nuevo.join("\n")
  return h
}

function extraerPath(raw: string): string {
  const clean = raw.trim().split("\t")[0]!
  if (clean.startsWith("a/") || clean.startsWith("b/")) return clean.slice(2)
  return clean
}

export type ApplyOptions = {
  /** Hunks que aplicar (índices dentro de files[i].hunks). Default: todos. */
  hunksSeleccionados?: Record<string, number[]>
  /** Si true, no escribe a disco — solo devuelve preview. Default false. */
  dryRun?: boolean
  /** Base directory para resolver paths relativos. */
  baseDir?: string
}

export type ApplyResultado = {
  archivos: Array<{
    path: string
    preview: string
    hunksAplicados: number
    hunksRechazados: number
    conflictos: string[]
    escrito: boolean
  }>
  ok: boolean
}

/**
 * Aplica los hunks al archivo (o los archivos si el diff es multi-file).
 * Cross-hunk safe: aplica de abajo hacia arriba para que los offsets no se corran.
 */
export function applyDiff(diff: DiffParsed, opts: ApplyOptions = {}): ApplyResultado {
  const salida: ApplyResultado["archivos"] = []
  let okTotal = true
  const { join } = require("node:path") as typeof import("node:path")

  for (const file of diff.files) {
    const absPath = opts.baseDir ? join(opts.baseDir, file.pathNuevo) : file.pathNuevo
    if (!existsSync(absPath)) {
      salida.push({
        path: file.pathNuevo,
        preview: "",
        hunksAplicados: 0,
        hunksRechazados: file.hunks.length,
        conflictos: [`archivo no existe: ${absPath}`],
        escrito: false,
      })
      okTotal = false
      continue
    }
    const contenido = readFileSync(absPath, "utf8")
    let lineas = contenido.split(/\r?\n/)
    const seleccion = opts.hunksSeleccionados?.[file.pathNuevo]
    const indices = seleccion ?? file.hunks.map((_, i) => i)
    const conflictos: string[] = []
    let aplicados = 0
    let rechazados = 0

    // Aplicar de mayor a menor para que los offsets no se corran.
    const orden = [...indices].sort((a, b) => (file.hunks[b]?.oldStart ?? 0) - (file.hunks[a]?.oldStart ?? 0))
    for (const i of orden) {
      const h = file.hunks[i]
      if (!h) continue
      const resultado = aplicarHunk(lineas, h)
      if (resultado.ok) {
        lineas = resultado.lineas
        aplicados++
      } else {
        rechazados++
        conflictos.push(`hunk ${i + 1} @@ -${h.oldStart}: ${resultado.motivo}`)
      }
    }

    // Los índices no seleccionados los contamos como rechazados también.
    if (seleccion) rechazados += file.hunks.length - seleccion.length

    const preview = lineas.join("\n")
    let escrito = false
    if (!opts.dryRun && aplicados > 0) {
      writeFileSync(absPath, preview, "utf8")
      escrito = true
    }
    salida.push({
      path: file.pathNuevo,
      preview,
      hunksAplicados: aplicados,
      hunksRechazados: rechazados,
      conflictos,
      escrito,
    })
    if (conflictos.length > 0) okTotal = false
  }
  return { archivos: salida, ok: okTotal }
}

function aplicarHunk(lineas: string[], h: Hunk): { ok: true; lineas: string[] } | { ok: false; motivo: string } {
  // Extraemos las líneas originales del hunk (contexto + removidas).
  const original: string[] = []
  const remplazo: string[] = []
  for (const l of h.lineas) {
    const p = l[0]
    const c = l.slice(1)
    if (p === " ") { original.push(c); remplazo.push(c) }
    else if (p === "-") original.push(c)
    else if (p === "+") remplazo.push(c)
  }

  // Buscamos la posición exacta del bloque original.
  // Preferimos oldStart, pero si no matchea, buscamos por contenido cercano.
  const pos = buscarBloqueEnLineas(lineas, original, h.oldStart - 1)
  if (pos < 0) return { ok: false, motivo: "contexto del hunk no encontrado en el archivo" }

  const nuevas = [...lineas.slice(0, pos), ...remplazo, ...lineas.slice(pos + original.length)]
  return { ok: true, lineas: nuevas }
}

/** Busca bloque exacto, arrancando por la línea sugerida y expandiendo la búsqueda. */
function buscarBloqueEnLineas(lineas: string[], bloque: string[], sugerido: number): number {
  if (bloque.length === 0) return sugerido
  const match = (start: number) =>
    start >= 0 && start + bloque.length <= lineas.length &&
    bloque.every((l, i) => lineas[start + i] === l)
  if (match(sugerido)) return sugerido
  // Expandir búsqueda en ambos sentidos.
  for (let delta = 1; delta < 40; delta++) {
    if (match(sugerido - delta)) return sugerido - delta
    if (match(sugerido + delta)) return sugerido + delta
  }
  return -1
}
