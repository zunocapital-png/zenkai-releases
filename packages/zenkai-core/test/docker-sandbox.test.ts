import { describe, expect, test } from "bun:test"
import { correrEnDocker, detectarDocker } from "../src/aios/docker-sandbox"

describe("Docker sandbox · #83", () => {
  test("detectarDocker devuelve shape correcto", async () => {
    const r = await detectarDocker()
    expect(typeof r.disponible).toBe("boolean")
    if (r.disponible) expect(r.version).toBeDefined()
    else expect(r.motivo).toBeDefined()
  })

  test("correrEnDocker cae a child_process si no hay docker", async () => {
    // En CI sin docker, este test valida el fallback.
    const r = await correrEnDocker({
      lenguaje: "node",
      codigo: "console.log('fallback ok')",
      timeoutMs: 10_000,
    })
    // Sea docker o child, tiene que devolver algo coherente.
    expect(typeof r.ok).toBe("boolean")
    expect(["docker", "child_process"]).toContain(r.backendUsado)
    if (r.backendUsado === "child_process") {
      expect(r.ok).toBe(true)
      expect(r.stdout).toContain("fallback ok")
    }
  })
})
