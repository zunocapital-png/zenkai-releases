import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

// Skill Store distribuido: registry local + remote sync + rating por usuario.
// Un "skill" es un paquete auto-contenido: nombre, descripción, prompt,
// opcionalmente tools que activa. Se instala local (JSON en userData) o se
// baja de un registry remoto compartido con la comunidad.
//
// Diferencia vs PluginRegistry (que es para MCPs / tools):
//   - Skills son PROMPT TEMPLATES + config, no procesos separados.
//   - Tienen tags, ratings (locales), y downloadCount cuando vienen de nube.
//   - Tienen contenido inline: el prompt en sí es parte del skill.

export type SkillDef = {
  id: string // ej. "code-reviewer"
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
  /** El prompt maestro del skill — se inyecta como system prompt. */
  prompt: string
  /** Tools que el skill "necesita" (los nombres tal como se registran). */
  toolsRequeridas?: string[]
  /** Tags para búsqueda. */
  tags?: string[]
  /** Icon opcional (emoji o data-uri). */
  icon?: string
  /** Rating local del usuario (1-5) — solo local, no sube al registry remoto. */
  ratingLocal?: number
  /** Downloads/ratings del registry — solo llegan de remote sync. */
  downloadCount?: number
  ratingPromedioRemoto?: number
  /** Sha256 del contenido — detecta manipulación. */
  checksum?: string
  origin?: "builtin" | "user" | "remote"
  installedAt?: number
}

export type SkillStoreSnapshot = { version: 1; skills: SkillDef[] }

export type SkillStoreOptions = { path: string }

export class SkillStore {
  private path: string
  private state: SkillStoreSnapshot

  constructor(opts: SkillStoreOptions) {
    this.path = opts.path
    if (!existsSync(dirname(this.path))) mkdirSync(dirname(this.path), { recursive: true })
    this.state = this.cargar()
  }

  private cargar(): SkillStoreSnapshot {
    if (!existsSync(this.path)) return { version: 1, skills: [] }
    try {
      const p = JSON.parse(readFileSync(this.path, "utf8")) as SkillStoreSnapshot
      if (p?.version === 1 && Array.isArray(p.skills)) return p
    } catch { /* corrupt */ }
    return { version: 1, skills: [] }
  }
  private guardar() { writeFileSync(this.path, JSON.stringify(this.state, null, 2), "utf8") }

  listar(): SkillDef[] { return [...this.state.skills] }
  buscar(id: string): SkillDef | undefined { return this.state.skills.find((s) => s.id === id) }

  /** Búsqueda por texto (nombre + descripción + tags). Devuelve ordenado por rating. */
  buscarPorTexto(query: string): SkillDef[] {
    const q = query.toLowerCase().trim()
    if (!q) return this.listar()
    return this.state.skills
      .filter((s) => {
        const blob = [s.name, s.description, ...(s.tags ?? [])].join(" ").toLowerCase()
        return blob.includes(q)
      })
      .sort((a, b) => scoreSkill(b) - scoreSkill(a))
  }

  /** Filtro por tag exacto. */
  porTag(tag: string): SkillDef[] {
    return this.state.skills.filter((s) => s.tags?.includes(tag))
  }

  instalar(input: Omit<SkillDef, "checksum" | "installedAt">): SkillDef {
    const s: SkillDef = {
      ...input,
      origin: input.origin ?? "user",
      installedAt: Date.now(),
      checksum: calcularChecksumSkill(input),
    }
    const idx = this.state.skills.findIndex((x) => x.id === s.id)
    if (idx >= 0) this.state.skills[idx] = s
    else this.state.skills.push(s)
    this.guardar()
    return s
  }

  quitar(id: string): boolean {
    const antes = this.state.skills.length
    this.state.skills = this.state.skills.filter((s) => s.id !== id)
    if (this.state.skills.length === antes) return false
    this.guardar()
    return true
  }

  /** Rating local — 1-5 estrellas. NO sube al remote. */
  ratear(id: string, rating: number): boolean {
    const s = this.buscar(id)
    if (!s) return false
    s.ratingLocal = Math.max(1, Math.min(5, Math.round(rating)))
    // El checksum cambia porque cambió el skill — lo recalculamos.
    s.checksum = calcularChecksumSkill(s)
    this.guardar()
    return true
  }

  verificar(id: string): { ok: boolean; motivo?: string } {
    const s = this.buscar(id)
    if (!s) return { ok: false, motivo: "no existe" }
    const recalc = calcularChecksumSkill(s)
    if (recalc !== s.checksum) return { ok: false, motivo: "checksum no coincide" }
    return { ok: true }
  }

  async sincronizarRemoto(url: string, fetchFn: typeof fetch = fetch): Promise<{
    agregados: number
    actualizados: number
  }> {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as SkillStoreSnapshot
    if (data?.version !== 1 || !Array.isArray(data.skills)) throw new Error("shape inválido")
    let agregados = 0, actualizados = 0
    for (const r of data.skills) {
      const existing = this.buscar(r.id)
      if (existing && existing.origin !== "remote") continue
      if (!existing) {
        this.instalar({ ...r, origin: "remote" })
        agregados++
      } else if (existing.version !== r.version) {
        // Preservamos rating local al actualizar.
        const ratingPrev = existing.ratingLocal
        this.instalar({ ...r, origin: "remote", ratingLocal: ratingPrev })
        actualizados++
      }
    }
    return { agregados, actualizados }
  }
}

export function calcularChecksumSkill(s: Omit<SkillDef, "checksum" | "installedAt">): string {
  const payload = JSON.stringify({
    id: s.id,
    name: s.name,
    version: s.version,
    prompt: s.prompt,
    toolsRequeridas: s.toolsRequeridas ?? [],
    tags: s.tags ?? [],
    ratingLocal: s.ratingLocal ?? 0,
  })
  return createHash("sha256").update(payload).digest("hex")
}

/** Score compuesto para ordenar búsquedas: rating remoto + downloads + rating local. */
function scoreSkill(s: SkillDef): number {
  const rr = s.ratingPromedioRemoto ?? 3
  const rl = s.ratingLocal ?? 0
  const dl = Math.log10(1 + (s.downloadCount ?? 0))
  return rr * 2 + rl * 3 + dl
}
