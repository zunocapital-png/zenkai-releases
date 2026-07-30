// Zenkai CLI — paridad terminal con Ollama y Claude Code.
//
// Uso:
//   zenkai                          → chat interactivo (como `claude`)
//   zenkai pull <model>             → descargar GGUF (como `ollama pull`)
//   zenkai list                     → listar modelos instalados
//   zenkai rm <id>                  → borrar modelo
//   zenkai models                   → catálogo recomendado
//   zenkai hw                       → snapshot RAM/CPU/GPU
//   zenkai diagnostico              → recomienda modelos para tu HW
//   zenkai health                   → estado del router
//   zenkai serve [--port N]         → arranca solo el server (headless)
//   zenkai chat "prompt"            → one-shot completion
//   zenkai smoke                    → corre suite auto de checks
//   zenkai import <file>            → importar bundle Zenkai
//   zenkai export <file>            → exportar sesiones/skills a bundle
//   zenkai help                     → muestra ayuda

const BASE = process.env.ZENKAI_URL ?? "http://localhost:20128"

type ExitCode = 0 | 1 | 2

async function main(): Promise<ExitCode> {
  const args = process.argv.slice(2)
  const cmd = args[0]

  // Sin comando o `help` → chat interactivo o help según flag.
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp()
    return 0
  }

  try {
    switch (cmd) {
      case "pull":   return await cmdPull(args.slice(1))
      case "list":   return await cmdList()
      case "rm":     return await cmdRm(args.slice(1))
      case "models": return await cmdModels()
      case "hw":     return await cmdHw()
      case "diagnostico":
      case "diag":   return await cmdDiag()
      case "health": return await cmdHealth()
      case "serve":  return await cmdServe(args.slice(1))
      case "chat":   return await cmdChat(args.slice(1))
      case "smoke":  return await cmdSmoke()
      case "import": return await cmdImport(args.slice(1))
      case "export": return await cmdExport(args.slice(1))
      case "version": return cmdVersion()
      default:
        console.error(`comando desconocido: ${cmd}`)
        console.error(`corré 'zenkai help' para ver los disponibles`)
        return 1
    }
  } catch (e) {
    console.error(`error: ${(e as Error).message}`)
    const msg = String((e as Error).message).toLowerCase()
    if (msg.includes("econnrefused") || msg.includes("fetch failed") || msg.includes("unable to connect") || msg.includes("connection refused")) {
      console.error(``)
      console.error(`  → el router de Zenkai no está corriendo en ${BASE}`)
      console.error(`  → abrí la app desktop, o corré 'zenkai serve' primero`)
    }
    return 1
  }
}

function printHelp(): void {
  console.log(`Zenkai · CLI

USO:
  zenkai <comando> [args]

COMANDOS PRINCIPALES:
  pull <model>          Descarga GGUF (con progreso)
  list                  Modelos instalados con tok/s
  rm <id>               Borra modelo del disco
  models                Catálogo curado (Qwen/Llama/Codestral/DeepSeek/etc)
  chat "prompt"         One-shot completion
  hw                    Snapshot RAM/CPU/GPU
  diagnostico           Recomienda modelos según tu equipo
  health                Estado del router
  smoke                 Corre suite auto (12 checks)
  serve [--port N]      Arranca solo el server (headless)
  export <file>         Exportar sesiones/skills a bundle
  import <file>         Importar bundle
  version               Versión

VARIABLES DE ENTORNO:
  ZENKAI_URL            URL del router (default http://localhost:20128)

EJEMPLOS:
  zenkai pull qwen2.5-coder-7b-q4
  zenkai chat "explicá TypeScript generics"
  zenkai diagnostico | head -20
  zenkai serve --port 20128
`)
}

// ── Comandos ──

async function cmdPull(args: string[]): Promise<ExitCode> {
  const id = args[0]
  if (!id) {
    console.error("uso: zenkai pull <model-id>")
    console.error("  corré 'zenkai models' para ver el catálogo")
    return 1
  }
  console.log(`Buscando ${id} en el catálogo...`)
  const catRes = await fetchJson<{ catalogo: Array<{ id: string; nombre: string; url: string; bytesAprox?: number }> }>("/v2/engine/models")
  const modelo = catRes.catalogo.find((m) => m.id === id || m.id.startsWith(id))
  if (!modelo) {
    console.error(`modelo '${id}' no está en el catálogo`)
    return 1
  }
  console.log(`Descargando: ${modelo.nombre}`)
  console.log(`URL: ${modelo.url}`)
  if (modelo.bytesAprox) console.log(`Tamaño: ${(modelo.bytesAprox / (1024 ** 3)).toFixed(1)} GB`)
  console.log(``)
  // Suscribimos SSE para progress + hacemos el POST.
  const abortController = new AbortController()
  const sseTask = suscribirProgress(modelo.id, abortController.signal)
  try {
    const r = await fetch(`${BASE}/v2/engine/download`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: modelo.id, url: modelo.url, nombre: modelo.nombre }),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
    const done = await r.json() as { bytes: number }
    console.log(`\n✓ descargado (${(done.bytes / (1024 ** 3)).toFixed(2)} GB)`)
    return 0
  } finally {
    abortController.abort()
    await sseTask
  }
}

async function suscribirProgress(id: string, signal: AbortSignal): Promise<void> {
  try {
    const res = await fetch(`${BASE}/v2/events`, { signal })
    if (!res.ok || !res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        try {
          const d = JSON.parse(line.slice(6)) as { tipo: string; data: { id?: string; percent?: number } }
          if (d.tipo === "engine.download.progress" && d.data.id === id && typeof d.data.percent === "number") {
            const p = d.data.percent
            const bar = "█".repeat(Math.floor(p / 3)) + "░".repeat(33 - Math.floor(p / 3))
            process.stdout.write(`\r  ${bar}  ${p.toFixed(1).padStart(5)}%`)
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore — signal abort esperado al terminar */ }
}

async function cmdList(): Promise<ExitCode> {
  const [{ instalados }, benchmarks] = await Promise.all([
    fetchJson<{ instalados: Array<{ id: string; nombre: string; bytes: number; capabilities?: string[] }> }>("/v2/engine/models"),
    fetchJson<Record<string, { tokensPorSegundo: number }>>("/v2/engine/benchmarks").catch(() => ({} as Record<string, { tokensPorSegundo: number }>)),
  ])
  if (instalados.length === 0) {
    console.log("(sin modelos instalados — corré 'zenkai pull <id>' para descargar uno)")
    return 0
  }
  console.log(`${instalados.length} modelo(s) instalado(s):\n`)
  for (const m of instalados) {
    const gb = (m.bytes / (1024 ** 3)).toFixed(1)
    const tokS = benchmarks[m.id]?.tokensPorSegundo
    const caps = m.capabilities?.join(",") ?? "-"
    const speed = tokS ? ` · ${tokS} tok/s` : ""
    console.log(`  ${m.id.padEnd(35)} ${gb.padStart(5)} GB  [${caps}]${speed}`)
    console.log(`    ${m.nombre}`)
  }
  return 0
}

async function cmdRm(args: string[]): Promise<ExitCode> {
  const id = args[0]
  if (!id) { console.error("uso: zenkai rm <model-id>"); return 1 }
  const r = await fetch(`${BASE}/v2/engine/models/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (r.status === 404) { console.error(`modelo '${id}' no existe`); return 1 }
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  console.log(`✓ borrado ${id}`)
  return 0
}

async function cmdModels(): Promise<ExitCode> {
  const { catalogo } = await fetchJson<{ catalogo: Array<{ id: string; nombre: string; bytesAprox?: number; ramMinimaMB?: number; tipo: string; potencia?: number; descripcion?: string }> }>("/v2/engine/models")
  console.log(`Catálogo Zenkai — ${catalogo.length} modelos:\n`)
  const porTipo = new Map<string, typeof catalogo>()
  for (const m of catalogo) {
    const arr = porTipo.get(m.tipo) ?? []
    arr.push(m)
    porTipo.set(m.tipo, arr)
  }
  for (const [tipo, ms] of porTipo) {
    console.log(`${tipo.toUpperCase()}:`)
    for (const m of ms) {
      const gb = m.bytesAprox ? (m.bytesAprox / (1024 ** 3)).toFixed(1) + " GB" : "?"
      const ram = m.ramMinimaMB ? Math.round(m.ramMinimaMB / 1024) + " GB min" : "?"
      const pot = m.potencia ?? "?"
      console.log(`  ${m.id.padEnd(38)} ${gb.padStart(6)} · ${ram} · ★${pot}/10`)
    }
    console.log()
  }
  return 0
}

async function cmdHw(): Promise<ExitCode> {
  const hw = await fetchJson<{ ram: { totalMB: number; libreMB: number; usadoPct: number }; cpu: { cores: number; modelo?: string }; gpu?: { nombre: string; vramTotalMB?: number; vramUsadoMB?: number; utilizacionPct?: number; tempC?: number } }>("/v2/hw")
  console.log(`RAM: ${(hw.ram.libreMB / 1024).toFixed(1)} GB libres / ${(hw.ram.totalMB / 1024).toFixed(1)} GB total (${hw.ram.usadoPct}% usado)`)
  console.log(`CPU: ${hw.cpu.cores} cores · ${hw.cpu.modelo ?? "?"}`)
  if (hw.gpu) {
    const parts = [hw.gpu.nombre]
    if (hw.gpu.vramTotalMB) parts.push(`${(hw.gpu.vramTotalMB / 1024).toFixed(1)} GB VRAM`)
    if (hw.gpu.vramUsadoMB != null) parts.push(`${(hw.gpu.vramUsadoMB / 1024).toFixed(1)} GB usada`)
    if (hw.gpu.utilizacionPct != null) parts.push(`${hw.gpu.utilizacionPct}% util`)
    if (hw.gpu.tempC != null) parts.push(`${hw.gpu.tempC}°C`)
    console.log(`GPU: ${parts.join(" · ")}`)
  } else {
    console.log(`GPU: (no detectada)`)
  }
  return 0
}

async function cmdDiag(): Promise<ExitCode> {
  const diag = await fetchJson<{
    diagnostico: { perfil: string; memoriaUtilMB: number; tieneGpu: boolean; gpuNombre?: string }
    mensaje: string
    mejorCoding?: { modelo: { id: string; nombre: string } }
    mejorGeneral?: { modelo: { id: string; nombre: string } }
    mejorReasoning?: { modelo: { id: string; nombre: string } }
    todos: Array<{ modelo: { id: string; potencia?: number }; puedeCorrer: boolean; motivo: string; velocidadEsperada: string; esOptimo: boolean }>
  }>("/v2/engine/diagnostico")
  console.log(`Perfil: ${diag.diagnostico.perfil}`)
  console.log(`${diag.mensaje}\n`)
  console.log(`RECOMENDADOS:`)
  if (diag.mejorCoding) console.log(`  💻 código:   ${diag.mejorCoding.modelo.id}  (${diag.mejorCoding.modelo.nombre})`)
  if (diag.mejorGeneral) console.log(`  🧠 general:  ${diag.mejorGeneral.modelo.id}  (${diag.mejorGeneral.modelo.nombre})`)
  if (diag.mejorReasoning) console.log(`  🎯 razona:   ${diag.mejorReasoning.modelo.id}  (${diag.mejorReasoning.modelo.nombre})`)
  console.log(`\nTODOS:`)
  for (const r of diag.todos) {
    const icon = r.esOptimo ? "★" : r.puedeCorrer ? "✓" : "✗"
    console.log(`  ${icon} ${r.modelo.id.padEnd(36)} ${r.velocidadEsperada.padEnd(12)} ${r.motivo}`)
  }
  return 0
}

async function cmdHealth(): Promise<ExitCode> {
  const h = await fetchJson<{ upstreams: Array<{ name: string; base: string; breaker: { estado: string; intentosFallidos: number }; latenciaMediaMs: number }> }>("/v1/health")
  console.log(`Router: OK  (${h.upstreams.length} upstream(s))\n`)
  for (const u of h.upstreams) {
    const estado = u.breaker.estado === "closed" ? "OK" : u.breaker.estado.toUpperCase()
    console.log(`  ${u.name.padEnd(18)} ${estado.padEnd(10)} ${u.latenciaMediaMs}ms  ${u.base}`)
    if (u.breaker.intentosFallidos > 0) console.log(`                     ${u.breaker.intentosFallidos} fallos recientes`)
  }
  return 0
}

async function cmdServe(args: string[]): Promise<ExitCode> {
  const portIdx = args.indexOf("--port")
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 20128
  console.log(`Zenkai server escuchando en http://localhost:${port}`)
  console.log(`(Este comando requiere arrancar el proceso del router desktop — no está implementado standalone aún)`)
  console.log(`Por ahora abrí la app desktop; el router arranca solo.`)
  return 2
}

async function cmdChat(args: string[]): Promise<ExitCode> {
  const prompt = args.join(" ").trim()
  if (!prompt) { console.error(`uso: zenkai chat "tu pregunta"`); return 1 }
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "auto",
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
  })
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}: ${await r.text().catch(() => "")}`)
  const reader = r.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data: ")) continue
      const payload = trimmed.slice(6)
      if (payload === "[DONE]") { process.stdout.write("\n"); return 0 }
      try {
        const d = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = d.choices?.[0]?.delta?.content
        if (delta) process.stdout.write(delta)
      } catch { /* skip */ }
    }
  }
  process.stdout.write("\n")
  return 0
}

async function cmdSmoke(): Promise<ExitCode> {
  console.log(`Corriendo smoke suite contra ${BASE}...`)
  // Import el módulo desde @zenkai/core para no reimplementar.
  const { crearSuiteZenkai, correrSmoke, reporteATexto } = await import("@zenkai/core")
  const checks = crearSuiteZenkai({ baseUrl: BASE })
  const r = await correrSmoke(checks)
  console.log(reporteATexto(r))
  return r.totalFail === 0 ? 0 : 1
}

async function cmdImport(args: string[]): Promise<ExitCode> {
  const file = args[0]
  if (!file) { console.error(`uso: zenkai import <archivo.json>`); return 1 }
  const { readFileSync } = await import("node:fs")
  const { importarBundle, esBundleZenkai } = await import("@zenkai/core")
  const data = readFileSync(file, "utf8")
  const check = esBundleZenkai(data)
  if (!check.ok) { console.error(`el archivo no parece un bundle Zenkai`); return 1 }
  let passphrase: string | undefined
  if (check.encrypted) {
    process.stdout.write("passphrase: ")
    // Bun no tiene readline pretty — hacemos algo simple bloqueante.
    for await (const line of console) { passphrase = String(line); break }
  }
  const bundle = importarBundle(data, passphrase)
  console.log(`✓ bundle válido (v${bundle.version})`)
  console.log(`  sesiones: ${bundle.sesiones?.length ?? 0}`)
  console.log(`  skills:   ${bundle.skills?.length ?? 0}`)
  console.log(`  plugins:  ${bundle.plugins?.length ?? 0}`)
  console.log(`(TODO: escribir al SessionStore / registry — hoy solo valida)`)
  return 0
}

async function cmdExport(args: string[]): Promise<ExitCode> {
  const file = args[0]
  if (!file) { console.error(`uso: zenkai export <archivo.json> [--passphrase X]`); return 1 }
  const passIdx = args.indexOf("--passphrase")
  const passphrase = passIdx >= 0 ? args[passIdx + 1] : undefined
  const { writeFileSync } = await import("node:fs")
  const { exportarBundle } = await import("@zenkai/core")
  // Placeholder — sin backend real de sesiones acá, exportamos meta mínima.
  const bundle = { sesiones: [], mensajes: {}, skills: [] }
  const exp = exportarBundle({ bundle, passphrase })
  writeFileSync(file, exp.data, "utf8")
  console.log(`✓ exportado a ${file}${exp.encrypted ? " (encriptado)" : ""}`)
  console.log(`(TODO: leer sesiones reales del SessionStore desktop — hoy exporta bundle vacío)`)
  return 0
}

function cmdVersion(): ExitCode {
  // La versión viene del package.json del CLI.
  console.log(`Zenkai CLI · 1.28.0`)
  return 0
}

// ── Helpers ──
async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(30_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${await r.text().catch(() => "")}`)
  return (await r.json()) as T
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(String(e))
  process.exit(1)
})
