import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SkillStore } from "../src/skills/store"

function tmpStore() {
  const dir = mkdtempSync(join(tmpdir(), "zenkai-skills-"))
  return { path: join(dir, "skills.json"), dir }
}

describe("SkillStore · largo plazo #14", () => {
  test("instalar + listar + buscar", () => {
    const { path, dir } = tmpStore()
    try {
      const s = new SkillStore({ path })
      s.instalar({
        id: "code-reviewer",
        name: "Code Reviewer",
        version: "1.0.0",
        description: "Revisa código en busca de bugs",
        prompt: "Sos un revisor senior. Encontrá bugs.",
        tags: ["code", "review"],
      })
      expect(s.listar().length).toBe(1)
      expect(s.buscar("code-reviewer")?.name).toBe("Code Reviewer")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("buscarPorTexto matchea nombre/desc/tags", () => {
    const { path, dir } = tmpStore()
    try {
      const s = new SkillStore({ path })
      s.instalar({ id: "s1", name: "Docs Writer", version: "1", description: "escribe docs", prompt: "p", tags: ["writing"] })
      s.instalar({ id: "s2", name: "Bug Finder", version: "1", description: "busca bugs", prompt: "p", tags: ["debug"] })
      s.instalar({ id: "s3", name: "Refactorer", version: "1", description: "mejora código", prompt: "p", tags: ["writing"] })
      const r1 = s.buscarPorTexto("writing")
      expect(r1.length).toBe(2)
      const r2 = s.buscarPorTexto("bugs")
      expect(r2.length).toBe(1)
      expect(r2[0]!.id).toBe("s2")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("porTag filtra exacto", () => {
    const { path, dir } = tmpStore()
    try {
      const s = new SkillStore({ path })
      s.instalar({ id: "s1", name: "n", version: "1", description: "d", prompt: "p", tags: ["writing", "seo"] })
      s.instalar({ id: "s2", name: "n", version: "1", description: "d", prompt: "p", tags: ["debug"] })
      expect(s.porTag("writing").length).toBe(1)
      expect(s.porTag("noexiste").length).toBe(0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("ratear clampa a 1-5 y actualiza checksum", () => {
    const { path, dir } = tmpStore()
    try {
      const s = new SkillStore({ path })
      s.instalar({ id: "s1", name: "n", version: "1", description: "d", prompt: "p" })
      s.ratear("s1", 10)
      expect(s.buscar("s1")?.ratingLocal).toBe(5)
      s.ratear("s1", -2)
      expect(s.buscar("s1")?.ratingLocal).toBe(1)
      expect(s.verificar("s1").ok).toBe(true) // checksum recalculado, sigue OK
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("sincronizarRemoto preserva rating local al actualizar version", async () => {
    const { path, dir } = tmpStore()
    try {
      const s = new SkillStore({ path })
      s.instalar({ id: "rs", name: "R", version: "1", description: "d", prompt: "p1", origin: "remote" })
      s.ratear("rs", 4)
      expect(s.buscar("rs")?.ratingLocal).toBe(4)
      const fakeFetch = (async () =>
        new Response(
          JSON.stringify({
            version: 1,
            skills: [{ id: "rs", name: "R", version: "2", description: "d", prompt: "p2" }],
          }),
          { status: 200 },
        )) as unknown as typeof fetch
      const r = await s.sincronizarRemoto("http://fake", fakeFetch)
      expect(r.actualizados).toBe(1)
      // Rating local preservado tras update.
      expect(s.buscar("rs")?.ratingLocal).toBe(4)
      expect(s.buscar("rs")?.version).toBe("2")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("sincronizar no pisa skills del usuario", async () => {
    const { path, dir } = tmpStore()
    try {
      const s = new SkillStore({ path })
      s.instalar({ id: "mio", name: "M", version: "1", description: "d", prompt: "p", origin: "user" })
      const fakeFetch = (async () =>
        new Response(
          JSON.stringify({
            version: 1,
            skills: [{ id: "mio", name: "M-remote", version: "9", description: "d", prompt: "otro" }],
          }),
          { status: 200 },
        )) as unknown as typeof fetch
      await s.sincronizarRemoto("http://fake", fakeFetch)
      expect(s.buscar("mio")?.name).toBe("M") // NO pisado
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("scoreSkill: rating y downloads ordenan búsquedas", () => {
    const { path, dir } = tmpStore()
    try {
      const s = new SkillStore({ path })
      s.instalar({ id: "hi", name: "high", version: "1", description: "code", prompt: "p", ratingPromedioRemoto: 5, downloadCount: 10000 })
      s.instalar({ id: "lo", name: "low", version: "1", description: "code", prompt: "p", ratingPromedioRemoto: 2, downloadCount: 10 })
      const r = s.buscarPorTexto("code")
      expect(r[0]!.id).toBe("hi")
      expect(r[1]!.id).toBe("lo")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test("persistencia disk", () => {
    const { path, dir } = tmpStore()
    try {
      const s1 = new SkillStore({ path })
      s1.instalar({ id: "s1", name: "n", version: "1", description: "d", prompt: "p" })
      const s2 = new SkillStore({ path })
      expect(s2.buscar("s1")).toBeDefined()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
