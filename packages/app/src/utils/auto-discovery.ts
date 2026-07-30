// Auto Discovery de MCPs (idea Tomo XIII). Detecta al arrancar qué servicios
// están instalados en el equipo (Docker, PostgreSQL, Git, Ollama) y devuelve
// sugerencias de qué MCPs prender. NO enciende automático — sugiere.
export type ServicioDetectado = {
  id: string
  nombre: string
  detectado: boolean
  mcpSugerido: string
  puerto?: number
}

async function pingHttp(url: string, ms = 800): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
    return r.ok
  } catch {
    return false
  }
}

// Descubre servicios locales que corren en puertos conocidos. Es rápido y no
// invasivo (solo pings HTTP + intenta abrir sockets). No requiere binarios.
export async function descubrirServicios(): Promise<ServicioDetectado[]> {
  const checks: Array<{ id: string; nombre: string; mcp: string; puerto?: number; check: () => Promise<boolean> }> = [
    { id: "ollama", nombre: "Ollama", mcp: "ollama (nativo)", puerto: 11434, check: () => pingHttp("http://localhost:11434/api/tags") },
    { id: "docker", nombre: "Docker", mcp: "docker", puerto: 2375, check: () => pingHttp("http://localhost:2375/version") },
    { id: "postgres", nombre: "PostgreSQL", mcp: "postgres", puerto: 5432, check: () => pingHttp("http://localhost:5432") },
    { id: "redis", nombre: "Redis", mcp: "redis", puerto: 6379, check: () => pingHttp("http://localhost:6379") },
    { id: "mongo", nombre: "MongoDB", mcp: "mongodb", puerto: 27017, check: () => pingHttp("http://localhost:27017") },
    { id: "elastic", nombre: "Elasticsearch", mcp: "elasticsearch", puerto: 9200, check: () => pingHttp("http://localhost:9200") },
    { id: "lmstudio", nombre: "LM Studio", mcp: "lm-studio", puerto: 1234, check: () => pingHttp("http://localhost:1234/v1/models") },
    { id: "jupyter", nombre: "Jupyter", mcp: "jupyter", puerto: 8888, check: () => pingHttp("http://localhost:8888") },
  ]
  const results: ServicioDetectado[] = []
  await Promise.all(
    checks.map(async (c) => {
      const detectado = await c.check().catch(() => false)
      results.push({ id: c.id, nombre: c.nombre, detectado, mcpSugerido: c.mcp, puerto: c.puerto })
    }),
  )
  return results.sort((a, b) => Number(b.detectado) - Number(a.detectado))
}
