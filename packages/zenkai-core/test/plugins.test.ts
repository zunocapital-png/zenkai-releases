import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PluginRegistry, calcularChecksum } from "../src/plugins/registry"

function tmpReg() {
  const dir = mkdtempSync(join(tmpdir(), "zenkai-plugins-"))
  return { path: join(dir, "reg.json"), dir }
}

describe("PluginRegistry · medio plazo #9", () => {
  test("instalar + listar + buscar", () => {
    const { path, dir } = tmpReg()
    try {
      const r = new PluginRegistry({ path })
      r.instalar({
        id: "@zenkai/web-search",
        name: "Web Search",
        version: "1.0.0",
        kind: "mcp",
        description: "Búsqueda web sin API key",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-brave-search"],
      })
      expect(r.listar().length).toBe(1)
      const found = r.buscar("@zenkai/web-search")
      expect(found?.name).toBe("Web Search")
      expect(found?.checksum).toBeDefined()
      expect(found?.installedAt).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("instalar mismo id reemplaza (upgrade)", () => {
    const { path, dir } = tmpReg()
    try {
      const r = new PluginRegistry({ path })
      r.instalar({ id: "p1", name: "P1", version: "1.0.0", kind: "mcp", description: "v1" })
      r.instalar({ id: "p1", name: "P1", version: "2.0.0", kind: "mcp", description: "v2" })
      expect(r.listar().length).toBe(1)
      expect(r.buscar("p1")?.version).toBe("2.0.0")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("quitar plugin", () => {
    const { path, dir } = tmpReg()
    try {
      const r = new PluginRegistry({ path })
      r.instalar({ id: "p1", name: "P1", version: "1.0.0", kind: "mcp", description: "x" })
      expect(r.quitar("p1")).toBe(true)
      expect(r.quitar("no-existe")).toBe(false)
      expect(r.listar().length).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("verificar detecta manipulación del checksum", () => {
    const { path, dir } = tmpReg()
    try {
      const r = new PluginRegistry({ path })
      r.instalar({ id: "p1", name: "P1", version: "1.0.0", kind: "mcp", description: "x", command: "echo" })
      expect(r.verificar("p1").ok).toBe(true)
      // Manipulamos el archivo directamente.
      const raw = JSON.parse(readFileSync(path, "utf8"))
      raw.plugins[0].command = "rm -rf /" // trojanizado
      require("node:fs").writeFileSync(path, JSON.stringify(raw))
      const r2 = new PluginRegistry({ path })
      const v = r2.verificar("p1")
      expect(v.ok).toBe(false)
      expect(v.motivo).toContain("checksum")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("persistencia entre instancias", () => {
    const { path, dir } = tmpReg()
    try {
      const r1 = new PluginRegistry({ path })
      r1.instalar({ id: "p1", name: "P1", version: "1", kind: "mcp", description: "x" })
      const r2 = new PluginRegistry({ path })
      expect(r2.buscar("p1")).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("sincronizarRemoto agrega y actualiza sin pisar user/builtin", async () => {
    const { path, dir } = tmpReg()
    try {
      const r = new PluginRegistry({ path })
      // Plugin del usuario que NO debe pisarse.
      r.instalar({ id: "user-plugin", name: "U", version: "1", kind: "mcp", description: "user", origin: "user" })
      // Fake fetch que devuelve un registry remoto.
      const fakeFetch = (async () =>
        new Response(
          JSON.stringify({
            version: 1,
            plugins: [
              { id: "remote-new", name: "R", version: "1", kind: "mcp", description: "nuevo" },
              { id: "user-plugin", name: "U2", version: "999", kind: "mcp", description: "intento pisar" },
            ],
          }),
          { status: 200 },
        )) as unknown as typeof fetch
      const result = await r.sincronizarRemoto("http://fake", fakeFetch)
      expect(result.agregados).toBe(1)
      expect(result.actualizados).toBe(0)
      // El user-plugin NO fue pisado.
      expect(r.buscar("user-plugin")?.version).toBe("1")
      // El remote-new sí quedó.
      expect(r.buscar("remote-new")?.origin).toBe("remote")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("sincronizar actualiza remote existente si cambia version", async () => {
    const { path, dir } = tmpReg()
    try {
      const r = new PluginRegistry({ path })
      r.instalar({ id: "rp", name: "R", version: "1", kind: "mcp", description: "v1", origin: "remote" })
      const fakeFetch = (async () =>
        new Response(
          JSON.stringify({
            version: 1,
            plugins: [{ id: "rp", name: "R", version: "2", kind: "mcp", description: "v2" }],
          }),
          { status: 200 },
        )) as unknown as typeof fetch
      const r2 = await r.sincronizarRemoto("http://fake", fakeFetch)
      expect(r2.actualizados).toBe(1)
      expect(r.buscar("rp")?.version).toBe("2")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("calcularChecksum es determinístico", () => {
    const a = calcularChecksum({ id: "x", name: "n", version: "1", kind: "mcp", description: "d" })
    const b = calcularChecksum({ id: "x", name: "n", version: "1", kind: "mcp", description: "d" })
    expect(a).toBe(b)
  })

  test("sincronizar rechaza HTTP no-ok", async () => {
    const { path, dir } = tmpReg()
    try {
      const r = new PluginRegistry({ path })
      const fakeFetch = (async () => new Response("error", { status: 500 })) as unknown as typeof fetch
      await expect(r.sincronizarRemoto("http://fake", fakeFetch)).rejects.toThrow(/HTTP 500/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
