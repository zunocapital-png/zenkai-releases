import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

// Plugin registry: catálogo local de plugins/MCPs que el usuario puede instalar
// o quitar. El registry es un JSON local (userData) + un fetch opcional remoto
// que trae más entries firmadas. La UI lee `listar()` y llama `instalar` / `quitar`.
//
// Diseño intencionalmente CHATO — un plugin acá es solo metadata + comando o URL
// de MCP a spawnar. No corremos código arbitrario al instalar, no descargamos
// binarios. Ese layer más peligroso queda por fuera; lo cubrimos con la firma
// digital opcional para plugins de nube que un día bajemos por el marketplace.

export type PluginKind = "mcp" | "tool" | "agent"

export type PluginEntry = {
  id: string // ej. "@zenkai/web-search"
  name: string
  version: string
  kind: PluginKind
  description: string
  author?: string
  homepage?: string
  /** Comando a ejecutar (spawn). Solo para kind="mcp". */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Sha256 del payload (metadata + comando) — el registry lo firma al agregarlo. */
  checksum?: string
  /** Origen: "builtin" preinstalado, "user" agregado a mano, "remote" del marketplace. */
  origin?: "builtin" | "user" | "remote"
  installedAt?: number
}

export type RegistryOptions = {
  /** Path al JSON local. Se crea si no existe. */
  path: string
}

export type PluginRegistrySnapshot = {
  version: 1
  plugins: PluginEntry[]
}

export class PluginRegistry {
  private path: string
  private state: PluginRegistrySnapshot

  constructor(opts: RegistryOptions) {
    this.path = opts.path
    if (!existsSync(dirname(this.path))) mkdirSync(dirname(this.path), { recursive: true })
    this.state = this.cargar()
  }

  private cargar(): PluginRegistrySnapshot {
    if (!existsSync(this.path)) return { version: 1, plugins: [] }
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as PluginRegistrySnapshot
      if (parsed?.version === 1 && Array.isArray(parsed.plugins)) return parsed
    } catch {
      /* corrupt: arrancar limpio */
    }
    return { version: 1, plugins: [] }
  }

  private guardar() {
    writeFileSync(this.path, JSON.stringify(this.state, null, 2), "utf8")
  }

  listar(): PluginEntry[] {
    return [...this.state.plugins]
  }

  buscar(id: string): PluginEntry | undefined {
    return this.state.plugins.find((p) => p.id === id)
  }

  /** Instala (o actualiza) un plugin. Recalcula checksum y timestamps. */
  instalar(entry: Omit<PluginEntry, "checksum" | "installedAt">): PluginEntry {
    const now = Date.now()
    const check = calcularChecksum(entry)
    const nuevo: PluginEntry = { ...entry, checksum: check, installedAt: now, origin: entry.origin ?? "user" }
    const idx = this.state.plugins.findIndex((p) => p.id === entry.id)
    if (idx >= 0) this.state.plugins[idx] = nuevo
    else this.state.plugins.push(nuevo)
    this.guardar()
    return nuevo
  }

  quitar(id: string): boolean {
    const before = this.state.plugins.length
    this.state.plugins = this.state.plugins.filter((p) => p.id !== id)
    if (this.state.plugins.length === before) return false
    this.guardar()
    return true
  }

  /** Verifica que checksum en disco coincide con el recalculado. Detecta manipulación. */
  verificar(id: string): { ok: boolean; motivo?: string } {
    const p = this.buscar(id)
    if (!p) return { ok: false, motivo: "no existe" }
    if (!p.checksum) return { ok: false, motivo: "sin checksum" }
    const recalc = calcularChecksum(p)
    if (recalc !== p.checksum) return { ok: false, motivo: "checksum no coincide" }
    return { ok: true }
  }

  /**
   * Sincroniza con un registry remoto (JSON con {version, plugins:[]}).
   * Sólo agrega/actualiza entries "remote" — nunca toca las "user" o "builtin".
   * Devuelve cuántos agregó/actualizó.
   */
  async sincronizarRemoto(url: string, fetchFn: typeof fetch = fetch): Promise<{ agregados: number; actualizados: number }> {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`registry remoto HTTP ${res.status}`)
    const data = (await res.json()) as PluginRegistrySnapshot
    if (data?.version !== 1 || !Array.isArray(data.plugins)) {
      throw new Error("shape del registry remoto inválido")
    }
    let agregados = 0
    let actualizados = 0
    for (const remote of data.plugins) {
      const existing = this.buscar(remote.id)
      if (existing && existing.origin !== "remote") continue // no pisar user/builtin
      if (!existing) {
        this.instalar({ ...remote, origin: "remote" })
        agregados++
      } else if (existing.version !== remote.version) {
        this.instalar({ ...remote, origin: "remote" })
        actualizados++
      }
    }
    return { agregados, actualizados }
  }
}

/** Payload determinístico + sha256 — checksum estable. */
export function calcularChecksum(p: Omit<PluginEntry, "checksum" | "installedAt">): string {
  const payload = JSON.stringify({
    id: p.id,
    name: p.name,
    version: p.version,
    kind: p.kind,
    command: p.command ?? "",
    args: p.args ?? [],
    env: p.env ?? {},
  })
  return createHash("sha256").update(payload).digest("hex")
}
