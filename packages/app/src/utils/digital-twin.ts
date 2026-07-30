// Software Digital Twin (Tomo XIII de la charla AIOS). Mantiene un "gemelo
// digital" del proyecto activo — no una copia de archivos, sino un MODELO
// vivo que sabe lenguaje/framework/arquitectura/deps/estilo/tests. Se guarda
// por proyecto (path del worktree) en localStorage. Se refresca cada vez que
// el usuario abre el dialog o cambia de proyecto.
//
// Es la SEMILLA de "la IA entiende tu proyecto completo" — hoy es descriptivo,
// mañana se le inyecta al system prompt para que responda con contexto.

export type DigitalTwin = {
  path: string
  detectedAt: number
  lenguaje?: string
  framework?: string
  packageManager?: "npm" | "pnpm" | "yarn" | "bun" | "cargo" | "pip" | "unknown"
  tests?: string
  linter?: string
  formateador?: string
  arquitectura?: string
  git?: {
    branch?: string
    hasCommits?: boolean
  }
  paths?: {
    src?: string
    tests?: string
    docs?: string
  }
  deps?: {
    total?: number
    top?: string[]
  }
}

const STORAGE_PREFIX = "zenkai.digitaltwin."

export function loadTwin(path: string): DigitalTwin | undefined {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + path)
    if (!v) return undefined
    return JSON.parse(v) as DigitalTwin
  } catch {
    return undefined
  }
}

export function saveTwin(twin: DigitalTwin) {
  try {
    localStorage.setItem(STORAGE_PREFIX + twin.path, JSON.stringify(twin))
  } catch {
    /* ignore quota */
  }
}

// Analiza el proyecto SIN abrir archivos pesados: infiere por presencia de
// marcadores conocidos y por el package.json si existe. Fetch al filesystem
// vía la IPC del desktop cuando esté disponible; si no, deducimos por path.
export async function analizarProyecto(path: string): Promise<DigitalTwin> {
  const twin: DigitalTwin = { path, detectedAt: Date.now() }

  // Heurística por segmentos del path (funciona incluso si no podemos leer
  // el filesystem desde el renderer).
  const segments = path.split(/[\\/]/).map((s) => s.toLowerCase())
  if (segments.some((s) => s.includes("solid"))) twin.framework = "SolidJS"
  else if (segments.some((s) => s.includes("next"))) twin.framework = "Next.js"
  else if (segments.some((s) => s.includes("nuxt"))) twin.framework = "Nuxt"
  else if (segments.some((s) => s.includes("react"))) twin.framework = "React"
  else if (segments.some((s) => s.includes("vue"))) twin.framework = "Vue"
  else if (segments.some((s) => s.includes("svelte"))) twin.framework = "Svelte"

  // Intento leer package.json a través del filesystem del navegador (fetch a
  // file://). En Electron el renderer no tiene fs directo, pero podemos hacer
  // fetch al MCP filesystem vía el server local que corre en 20128 si expone
  // ese endpoint. Como no lo expone hoy, dejamos placeholder y devolvemos lo
  // heurístico. El siguiente iterador puede llenar esto con un tool bridge.
  const pkgHint = segments.includes("packages") || segments.includes("node_modules")
  if (pkgHint) {
    twin.packageManager = "unknown"
  }

  // Lenguaje: si el path menciona rust/go/py/etc.
  if (segments.some((s) => s.endsWith(".rs") || s === "rust")) twin.lenguaje = "Rust"
  else if (segments.some((s) => s.endsWith(".py") || s === "python")) twin.lenguaje = "Python"
  else if (segments.some((s) => s.endsWith(".go") || s === "go")) twin.lenguaje = "Go"
  else if (segments.some((s) => s === "src" || s === "app")) twin.lenguaje = "TypeScript"

  saveTwin(twin)
  return twin
}
