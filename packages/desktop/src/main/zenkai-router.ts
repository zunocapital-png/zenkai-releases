// ZENKAI Router: motor de "Auto" 100% NUESTRO (reemplaza el binario externo omniroute).
// Es un pequeño servidor OpenAI-compatible en localhost:20128 que:
//   - GET /v1/models       -> lista "auto" + los modelos locales de Ollama.
//   - POST /v1/chat/completions -> si el modelo es "auto"/"auto/*", elige el mejor
//     modelo local de Ollama disponible y hace de proxy a Ollama (que ya es
//     OpenAI-compatible en :11434/v1). El streaming se pasa tal cual (byte passthrough).
//   - GET /v2/*  (Fase 6) -> misma API pero corriendo sobre @zenkai/core.
//     Al activarse ZENKAI_USE_CORE=1 en env, /v1/* se redirige a /v2/*.
//
// Sin dependencias externas, sin npm, sin binarios de terceros: solo Node.
// Si Ollama no está o no hay modelos, responde un error claro (y el usuario igual
// puede elegir un modelo puntual en el selector).

import http from "node:http"
import net from "node:net"
import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import {
  ProviderOrchestrator,
  crearProviderOpenAICompat,
  crearZenkaiCoreServer,
  reflexionar,
  correrAutoRepair,
  ToolExecutor,
  registrarBuiltins,
  consultarParlamento,
  correrCodigo,
  EventBus,
  ZenkaiEngine,
  downloadGguf,
  MODELOS_RECOMENDADOS,
  detectarGpu,
  correrTraining,
  correrEnDocker,
  detectarDocker,
  PairingService,
  generarQrMatrizSimple,
  sintetizar,
  detectarPiper,
  VOCES_PIPER,
  inferirCapabilities,
  HwMonitor,
  benchmarkYPersistir,
  leerBenchmarks,
  resumenRecomendacion,
  bootstrapLlamaBinary,
  buscarModelosHf,
  listarGgufsDeModelo,
  importarOllamaAlRegistry,
  descubrirModelosOllama,
  ollamaEstaInstalado,
  parseZenkaiFile,
  crearModeloDesdeZenkaiFile,
  serializarZenkaiFile,
} from "@zenkai/core"
import type { LlmProposer, FixPropuesto, MiembroParlamento } from "@zenkai/core"
import { tmpdir } from "node:os"

// Bus global de eventos del motor — expuesto vía /v2/events (SSE).
const eventBus = new EventBus()

// Zenkai Engine (motor propio que reemplaza Ollama).
let engineCache: ZenkaiEngine | undefined
function getEngine(): ZenkaiEngine {
  if (engineCache) return engineCache
  const path = require("node:path") as typeof import("node:path")
  const modelsDir = process.env.ZENKAI_MODELS_DIR ?? path.join(tmpdir(), "zenkai-models")
  engineCache = new ZenkaiEngine({
    modelsDir,
    onEvent: (evt) => eventBus.emit(`engine.${evt.tipo}`, evt),
  })
  engineCache.start()
  return engineCache
}

// Pairing service singleton.
const pairing = new PairingService()

// Hardware monitor singleton — silencioso hasta que alguien se subscribe.
const hwMonitor = new HwMonitor({ intervalMs: 2000 })
// El monitor emite al event bus continuo — la UI se suscribe a /v2/events.
hwMonitor.subscribe((snap) => eventBus.emit("hw.snapshot", snap))

// ── Bridge Fase 6: @zenkai/core como motor alternativo del router ──
// Instancia perezosa del orquestador propio. Se inicializa la primera vez
// que llega un request a /v2 (o cuando ZENKAI_USE_CORE=1 y viene un /v1).
// Registra Ollama como provider local por default y expone endpoints
// OpenAI-compatible sobre esa capa.
let coreServerCache: ReturnType<typeof crearZenkaiCoreServer> | undefined
let coreOrchestratorCache: ProviderOrchestrator | undefined
function coreOrchestrator(): ProviderOrchestrator {
  if (coreOrchestratorCache) return coreOrchestratorCache
  const orchestrator = new ProviderOrchestrator({ regionPreferida: "local" })
  orchestrator.register(
    crearProviderOpenAICompat({
      name: "ollama",
      kind: "openai-compat",
      baseURL: "http://localhost:11434/v1",
      supportsTools: true,
      supportsStream: true,
      region: "local",
    }),
  )
  coreOrchestratorCache = orchestrator
  // Persistencia: cada 5s escribimos las stats del orchestrator a un archivo
  // que el renderer lee via IPC/localStorage para el widget /costos.
  setInterval(() => void persistirStatsAlDisco(orchestrator), 5000).unref()
  return orchestrator
}
function coreServer() {
  if (coreServerCache) return coreServerCache
  coreServerCache = crearZenkaiCoreServer(coreOrchestrator())
  return coreServerCache
}

// Persiste stats del ProviderOrchestrator para que /costos las lea. Usa tmpdir
// para evitar tocar userData del renderer (que corre en otro proceso).
async function persistirStatsAlDisco(orchestrator: ProviderOrchestrator) {
  try {
    const { writeFile, mkdir } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const dir = join(tmpdir(), "zenkai-core")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "provider-stats.json"), JSON.stringify(orchestrator.getStats(), null, 2), "utf8")
  } catch {
    /* best effort */
  }
}

/** Si ZENKAI_USE_CORE=1, /v1/* se redirige a /v2/* (motor propio). Toggle
 *  desde Ajustes → General escribe esta env var y reinicia el server. */
function motorPropioActivo(): boolean {
  return process.env.ZENKAI_USE_CORE === "1"
}

// Traduce IncomingMessage → Fetch API Request para @zenkai/core.
async function toWebRequest(req: http.IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    req.on("data", (c) => chunks.push(c as Buffer))
    req.on("end", () => resolve())
    req.on("error", reject)
  })
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
  const url = `http://localhost:${ZENKAI_ROUTER_PORT}${req.url ?? "/"}`
  return new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: body ? (body as unknown as BodyInit) : undefined,
  })
}

// Copia una Web Response al http.ServerResponse (soporta streaming SSE).
async function copyResponse(webRes: Response, res: http.ServerResponse) {
  res.writeHead(webRes.status, Object.fromEntries(webRes.headers))
  if (!webRes.body) {
    res.end()
    return
  }
  const reader = webRes.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
}

export const ZENKAI_ROUTER_PORT = 20128

// Almacén efímero de imágenes generadas por tools (ej. generar_imagen). La tool sube la
// imagen acá y devuelve un markdown ![](/img/<id>) compacto; el chat lo renderiza sin
// inundar el contexto con base64. Guardamos las últimas N en memoria (se pierden al cerrar).
const imgStore = new Map<string, { buf: Buffer; type: string }>()
const IMG_MAX = 40
function guardarImagen(buf: Buffer, type: string): string {
  const id = randomUUID()
  imgStore.set(id, { buf, type })
  while (imgStore.size > IMG_MAX) imgStore.delete(imgStore.keys().next().value as string)
  return id
}
const OLLAMA = "http://localhost:11434"

let server: http.Server | undefined

// Circuit breaker con 3 estados (closed / open / half-open) mejorado.
// - closed: el upstream funciona, dejamos pasar todo.
// - open: falló recientemente, saltamos por COOLDOWN_MS sin pagar timeout.
// - half-open: cooldown vencido, dejamos pasar UN request de prueba. Si va
//   bien vuelve a closed; si falla vuelve a open con backoff exponencial.
type EstadoBreaker = { hasta: number; intentosFallidos: number; enPrueba: boolean }
const breaker = new Map<string, EstadoBreaker>()
const COOLDOWN_MS = 30_000
const COOLDOWN_MAX = 5 * 60_000 // 5 min tope para no dejar caído para siempre.
// Watchdog de primer byte. Antes eran 8s, pero un modelo local recién arrancado
// (5-7 GB cargando a RAM la primera vez) TARDA 20-40s en emitir el primer token.
// Con 8s el router abortaba, disparaba el circuit breaker y devolvía 503 sin
// error visible — el usuario veía "la IA no responde". 60s es holgado sin ser
// eterno; los upstreams de nube igual responden en < 5s.
const PRIMER_BYTE_MS = 60_000

// Latencia por upstream — media móvil. Sirve para preferir el más rápido
// entre los que están disponibles y para métricas.
const latenciaMs = new Map<string, number>()
function registrarLatencia(nombre: string, ms: number) {
  const previo = latenciaMs.get(nombre) ?? ms
  // Media móvil exponencial: 30% del nuevo, 70% del histórico. Reactivo pero estable.
  latenciaMs.set(nombre, previo * 0.7 + ms * 0.3)
}

function breakerAbierto(nombre: string): boolean {
  const e = breaker.get(nombre)
  if (!e) return false
  if (Date.now() < e.hasta) return true
  // Cooldown vencido: pasamos a half-open. Un único request de prueba.
  if (!e.enPrueba) {
    e.enPrueba = true
    breaker.set(nombre, e)
  }
  return false
}
function breakerExito(nombre: string) {
  breaker.delete(nombre) // reset total
}
function breakerFallo(nombre: string) {
  const previo = breaker.get(nombre)
  const fallos = (previo?.intentosFallidos ?? 0) + 1
  // Backoff exponencial: 30s, 60s, 120s, 240s, 300s (tope 5 min).
  const backoff = Math.min(COOLDOWN_MS * Math.pow(2, fallos - 1), COOLDOWN_MAX)
  breaker.set(nombre, { hasta: Date.now() + backoff, intentosFallidos: fallos, enPrueba: false })
}

function portInUse(port: number, timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (r: boolean) => {
      socket.destroy()
      resolve(r)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => done(true))
    socket.once("timeout", () => done(false))
    socket.once("error", () => done(false))
    socket.connect(port, "127.0.0.1")
  })
}

// Modelos locales instalados, en orden de preferencia para "auto" (código primero).
// Preferencia. Ojo: modelos SIN capability "tools" (p.ej. qwen2.5vl vision-only)
// se filtran a nivel del /api/tags — nunca llegan a matchearse acá, así el auto
// nunca elige un modelo que después falle silencioso porque el agente pide tools.
const PREFERENCIA = ["qwen2.5-coder", "qwen3", "qwen2.5", "llama3.1", "deepseek", "mistral", "gemma"]

// Cache corto de tags: en "auto" resolverModelo y handleModels piden /api/tags seguido;
// un TTL de 5s evita un roundtrip HTTP extra (con su timeout) por cada request.
let tagsCache: { at: number; tags: string[] } | undefined
const TAGS_TTL_MS = 5_000

// Trae la lista de modelos locales FILTRANDO los que no tienen "tools" en sus
// capabilities. Modelos vision-only (qwen2.5vl) o solo completion no sirven al
// agente — si los elegimos, el chat responde vacío y sin error visible.
async function tagsOllama(): Promise<string[]> {
  if (tagsCache && Date.now() - tagsCache.at < TAGS_TTL_MS) return tagsCache.tags
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return tagsCache?.tags ?? []
    const data = (await res.json()) as {
      models?: Array<{ name?: string; capabilities?: string[] }>
    }
    const tags = (data.models ?? [])
      .filter((m) => Array.isArray(m?.capabilities) && m.capabilities.includes("tools"))
      .map((m) => m?.name)
      .filter((n): n is string => typeof n === "string")
    tagsCache = { at: Date.now(), tags }
    return tags
  } catch {
    return tagsCache?.tags ?? []
  }
}

// Elige el mejor modelo local según la preferencia; cae al primero que haya.
function elegirModelo(tags: string[]): string | undefined {
  for (const pref of PREFERENCIA) {
    const hit = tags.find((t) => t.startsWith(pref))
    if (hit) return hit
  }
  return tags[0]
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body)
  res.writeHead(status, { "content-type": "application/json" })
  res.end(text)
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => (data += chunk))
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

// GET /v1/health — expone métricas internas del router para el widget de
// estado global de la app: qué upstreams están arriba, latencia media,
// cuántos fallos, si el breaker está abierto.
function handleHealth(res: http.ServerResponse) {
  const ahora = Date.now()
  const ups = upstreams().map((u) => {
    const b = breaker.get(u.name)
    return {
      name: u.name,
      kind: u.kind,
      base: u.base,
      breaker: b
        ? {
            estado: ahora < b.hasta ? "open" : b.enPrueba ? "half-open" : "closed",
            reabreEn: Math.max(0, b.hasta - ahora),
            intentosFallidos: b.intentosFallidos,
          }
        : { estado: "closed", reabreEn: 0, intentosFallidos: 0 },
      latenciaMediaMs: Math.round(latenciaMs.get(u.name) ?? 0),
    }
  })
  sendJson(res, 200, { upstreams: ups, timestamp: ahora })
}

async function handleModels(res: http.ServerResponse) {
  const tags = await tagsOllama()
  const models = [
    { id: "auto", object: "model", owned_by: "zenkai" },
    ...tags.map((id) => ({ id, object: "model", owned_by: "ollama" })),
  ]
  sendJson(res, 200, { object: "list", data: models })
}

// Un "upstream" es un proveedor OpenAI-compatible al que el router puede enrutar.
type Upstream = { name: string; kind: "ollama" | "openai"; base: string; key?: string; model?: string }

// Lista ordenada para "auto": primero local (Ollama), luego los de nube que el desktop
// configure por env (ZENKAI_ROUTER_UPSTREAMS = JSON array de {name,base,key,model}).
// El router prueba en orden y salta al siguiente si uno falla o se agota (failover).
function upstreams(): Upstream[] {
  const list: Upstream[] = [{ name: "ollama", kind: "ollama", base: `${OLLAMA}/v1` }]
  try {
    const extra = JSON.parse(process.env.ZENKAI_ROUTER_UPSTREAMS ?? "[]")
    if (Array.isArray(extra)) {
      for (const u of extra) {
        if (u && typeof u.base === "string") {
          list.push({ name: String(u.name ?? u.base), kind: "openai", base: u.base, key: u.key, model: u.model })
        }
      }
    }
  } catch {
    /* env mal formado: solo local */
  }
  return list
}

// Clasifica el prompt del usuario en 3 modos: "coding" (código, refactor, bugs),
// "smart" (razonamiento profundo, análisis, planeación) o "fast" (chat corto,
// preguntas simples). Es un fallback SIMPLE cuando el usuario pidió "auto" a
// secas — sirve para elegir el mejor modelo local disponible según la tarea.
// Es una heurística chata a propósito: no queremos que la IA piense antes de
// pensar. Si falla, cae en el default de PREFERENCIA.
function clasificarPrompt(texto: string): "coding" | "smart" | "fast" {
  const t = texto.toLowerCase()
  const codigoKw = ["código", "codigo", "refactor", "función", "funcion", "bug", "typescript", "javascript", "python", "rust", "componente", "hook", "clase", "test", "async", "await", "diff", "commit", "compilar"]
  const razonKw = ["explicá", "explica", "por qué", "por que", "analiza", "analizá", "planeá", "planea", "compará", "compara", "estrategia", "arquitectura", "diseñá", "diseño de", "trade-off", "pros y contras"]
  if (codigoKw.some((k) => t.includes(k))) return "coding"
  if (razonKw.some((k) => t.includes(k))) return "smart"
  if (t.length < 60) return "fast"
  return "coding" // default: mediados largos = probablemente código
}

// Preferencia POR MODO — cuando el usuario pidió auto/coding, /smart o /fast,
// arrancamos por modelos que sabemos que son buenos en ese frente.
const PREFERENCIA_POR_MODO: Record<"coding" | "smart" | "fast" | "default", string[]> = {
  coding: ["qwen2.5-coder", "qwen3", "qwen2.5", "llama3.1", "deepseek"],
  smart: ["qwen3", "deepseek", "qwen2.5", "llama3.1"],
  fast: ["qwen3:8b", "qwen2.5:7b", "qwen2.5-coder:7b", "llama3.1"],
  default: ["qwen2.5-coder", "qwen3", "qwen2.5", "llama3.1", "deepseek", "mistral", "gemma"],
}

function elegirModeloPorModo(tags: string[], modo: "coding" | "smart" | "fast" | "default"): string | undefined {
  for (const pref of PREFERENCIA_POR_MODO[modo]) {
    const hit = tags.find((t) => t.startsWith(pref))
    if (hit) return hit
  }
  return tags[0]
}

// Modelo concreto a usar en un upstream para el pedido dado.
async function resolverModelo(u: Upstream, pedido: string, payload?: unknown): Promise<string | undefined> {
  if (pedido !== "auto" && !pedido.startsWith("auto/")) return pedido
  if (u.kind === "ollama") {
    // Si viene "auto/coding" / "auto/smart" / "auto/fast", usamos el modo explícito.
    // Si viene "auto" a secas, clasificamos el último mensaje del usuario.
    let modo: "coding" | "smart" | "fast" | "default" = "default"
    if (pedido === "auto/coding") modo = "coding"
    else if (pedido === "auto/smart") modo = "smart"
    else if (pedido === "auto/fast") modo = "fast"
    else if (pedido === "auto") {
      const ultimo = extractLastUserContent(payload)
      if (ultimo) modo = clasificarPrompt(ultimo)
    }
    return elegirModeloPorModo(await tagsOllama(), modo)
  }
  return u.model // los upstreams de nube traen su modelo fijo
}

// Extrae el último mensaje del usuario del payload OpenAI-compatible para
// clasificar la tarea. Devuelve string vacío si no encuentra.
function extractLastUserContent(payload: unknown): string {
  try {
    const p = payload as { messages?: Array<{ role?: string; content?: unknown }> }
    const msgs = p?.messages ?? []
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m?.role !== "user") continue
      if (typeof m.content === "string") return m.content
      if (Array.isArray(m.content)) {
        return m.content
          .filter((c: unknown) => (c as { type?: string })?.type === "text")
          .map((c: unknown) => (c as { text?: string })?.text ?? "")
          .join(" ")
      }
    }
  } catch {
    /* ignore */
  }
  return ""
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse) {
  let payload: any
  try {
    payload = JSON.parse(await readBody(req))
  } catch {
    return sendJson(res, 400, { error: { message: "JSON inválido" } })
  }
  const pedido = String(payload?.model ?? "auto")
  const esAuto = pedido === "auto" || pedido.startsWith("auto/")

  // "auto" recorre todos los upstreams con failover; un modelo explícito va directo a Ollama.
  const candidatos: Upstream[] = esAuto ? upstreams() : [{ name: "ollama", kind: "ollama", base: `${OLLAMA}/v1` }]

  for (const u of candidatos) {
    if (breakerAbierto(u.name)) continue // circuito abierto -> saltar sin esperar
    const modelo = await resolverModelo(u, pedido, payload)
    if (!modelo) continue // p.ej. Ollama sin modelos -> probar el siguiente upstream
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (u.key) headers["authorization"] = `Bearer ${u.key}`
    // Watchdog de PRIMER BYTE: el timeout SOLO debe matar la espera de headers, NO el
    // stream de tokens. AbortSignal.timeout aborta toda la operación (incluido el body),
    // así que usamos un AbortController propio y limpiamos el timer al llegar los headers.
    const ac = new AbortController()
    const watchdog = setTimeout(() => ac.abort(), PRIMER_BYTE_MS)
    let upstream: Response
    const t0 = Date.now()
    try {
      upstream = await fetch(`${u.base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, model: modelo }),
        signal: ac.signal,
      })
    } catch {
      clearTimeout(watchdog)
      breakerFallo(u.name)
      continue
    }
    clearTimeout(watchdog) // llegaron los headers: a partir de acá el stream puede tardar lo que sea
    if (upstream.status >= 500 || upstream.status === 429) {
      breakerFallo(u.name)
      continue
    }
    breakerExito(u.name) // respondió con headers OK -> reset del circuito
    registrarLatencia(u.name, Date.now() - t0)
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    })
    if (upstream.body) {
      const stream = Readable.fromWeb(upstream.body as any)
      // Si el upstream corta feo en mid-stream, cerramos la respuesta sin tirar
      // el proceso. Fallback graceful: no hacemos retry porque los tokens ya se
      // enviaron al cliente; el cliente ve el corte y puede reintentar.
      stream.on("error", () => {
        breakerFallo(u.name)
        if (!res.destroyed) res.end()
      })
      // Si el cliente se desconecta a mitad, abortamos el upstream para liberar Ollama.
      res.on("close", () => ac.abort())
      stream.pipe(res)
    } else res.end(await upstream.text())
    return
  }

  // Diagnóstico específico: por qué falló todo. Le decimos al usuario la causa
  // exacta en vez de un mensaje genérico que no lo ayuda a solucionar.
  const diag = await diagnosticoUpstreams()
  sendJson(res, 503, {
    error: {
      message: diag.mensaje,
      type: diag.tipo,
      sugerencia: diag.sugerencia,
    },
  })
}

// Emite el motivo real por el que no hay upstreams: (1) Ollama caído, (2) Ollama
// corriendo pero sin modelos con capability "tools", (3) todos los upstreams
// fallaron (nube incluida). Cada caso trae su sugerencia accionable.
async function diagnosticoUpstreams(): Promise<{ mensaje: string; tipo: string; sugerencia: string }> {
  // ¿Ollama vivo?
  let ollamaVivo = false
  let modelosTotales = 0
  let modelosConTools = 0
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (r.ok) {
      ollamaVivo = true
      const data = (await r.json()) as { models?: Array<{ capabilities?: string[] }> }
      modelosTotales = (data.models ?? []).length
      modelosConTools = (data.models ?? []).filter(
        (m) => Array.isArray(m?.capabilities) && m.capabilities.includes("tools"),
      ).length
    }
  } catch {
    /* Ollama caído */
  }

  if (!ollamaVivo) {
    return {
      tipo: "ollama_offline",
      mensaje: "Ollama no está corriendo. ZENKAI intenta iniciarlo automáticamente — probá de nuevo en unos segundos.",
      sugerencia: "Si no arranca, ejecutá 'ollama serve' en una terminal o revisá la sección Diagnóstico.",
    }
  }
  if (modelosTotales === 0) {
    return {
      tipo: "sin_modelos",
      mensaje: "Ollama está corriendo pero no hay ningún modelo instalado.",
      sugerencia: "Descargá 'qwen3:14b' (recomendado) o 'qwen2.5-coder:7b' desde Diagnóstico → Modelos locales.",
    }
  }
  if (modelosConTools === 0) {
    return {
      tipo: "sin_tools",
      mensaje: `Tenés ${modelosTotales} modelo(s) locales pero ninguno soporta 'tools' — el agente los necesita para funcionar.`,
      sugerencia: "Descargá 'qwen3:14b' o 'qwen2.5-coder:7b' (soportan tools). Modelos como 'qwen2.5vl' no sirven para el agente.",
    }
  }
  return {
    tipo: "todos_fallaron",
    mensaje: "Todos los proveedores (local + nube) fallaron o tardaron demasiado.",
    sugerencia: "Reintentá en un momento. Si persiste, revisá la conexión y el estado de Ollama en Diagnóstico.",
  }
}

// POST /img: recibe { data: base64, mime } y guarda la imagen; devuelve { id }.
async function handleImagePost(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { data?: string; mime?: string }
    if (!body?.data) return sendJson(res, 400, { error: { message: "falta data" } })
    const buf = Buffer.from(body.data, "base64")
    const id = guardarImagen(buf, body.mime || "image/png")
    sendJson(res, 200, { id })
  } catch {
    sendJson(res, 400, { error: { message: "JSON inválido" } })
  }
}

// GET /img/<id>: sirve la imagen guardada.
function handleImageGet(url: string, res: http.ServerResponse) {
  const id = url.slice("/img/".length).split("?")[0]!
  const img = imgStore.get(id)
  if (!img) return sendJson(res, 404, { error: { message: "imagen no encontrada" } })
  res.writeHead(200, { "content-type": img.type, "cache-control": "no-store" })
  res.end(img.buf)
}

// POST /v2/reflect — invoca el reflector real contra el orquestador propio.
async function handleReflect(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      pregunta?: string
      respuesta?: string
      modelo?: string
      contexto?: string
      mejorar?: boolean
    }
    if (!body?.pregunta || !body?.respuesta || !body?.modelo) {
      return sendJson(res, 400, { error: { message: "faltan campos: pregunta, respuesta, modelo" } })
    }
    const orch = coreOrchestrator()
    const v = await reflexionar(
      {
        pregunta: body.pregunta,
        respuesta: body.respuesta,
        modelo: body.modelo,
        contexto: body.contexto,
      },
      (r, c) => orch.chat(r, c),
      { mejorar: !!body.mejorar },
    )
    sendJson(res, 200, v)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

// POST /v2/repair — corre auto-repair contra el ToolExecutor propio.
// El proposer usa el orchestrator para pedirle al modelo un fix estructurado.
async function handleRepair(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      testCmd?: string
      modelo?: string
      cwd?: string
      maxIntentos?: number
    }
    if (!body?.testCmd || !body?.modelo) {
      return sendJson(res, 400, { error: { message: "faltan campos: testCmd, modelo" } })
    }
    const orch = coreOrchestrator()
    const ex = new ToolExecutor()
    registrarBuiltins(ex)
    const proposer: LlmProposer = async ({ testOutput, testExitCode, intentosPrevios }) => {
      const prompt = [
        "Eres un ingeniero. El siguiente test falló. Propone UN fix concreto en JSON.",
        `Comando: ${body.testCmd}`,
        `Exit code: ${testExitCode}`,
        `Intento #${intentosPrevios.length + 1}`,
        "",
        "Salida del test (últimos 3000 chars):",
        testOutput.slice(-3000),
        "",
        'Responde SOLO JSON: {"hipotesis":"...", "fix":{"tipo":"bash","cmd":"..."}} o {"fix":{"tipo":"escribir","path":"...","contenido":"..."}} o {"fix":{"tipo":"manual","nota":"..."}}',
      ].join("\n")
      try {
        const resp = await orch.chat({
          model: body.modelo!,
          messages: [{ id: "u", role: "user", parts: [{ type: "text", text: prompt }], createdAt: 0 }],
          temperature: 0.2,
          cacheable: false,
        })
        const parsed = extraerJsonBalanceado(resp.content)
        if (!parsed?.fix) return undefined
        return { hipotesis: String(parsed.hipotesis ?? "sin hipótesis"), fix: parsed.fix as FixPropuesto }
      } catch {
        return undefined
      }
    }
    const r = await correrAutoRepair(
      { testCmd: body.testCmd, cwd: body.cwd, maxIntentos: body.maxIntentos },
      ex,
      proposer,
    )
    sendJson(res, 200, r)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

// POST /v2/parliament — consulta a N modelos y devuelve el resultado del voto.
async function handleParliament(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      pregunta?: string
      contexto?: string
      miembros?: MiembroParlamento[]
    }
    if (!body?.pregunta || !Array.isArray(body?.miembros) || body.miembros.length === 0) {
      return sendJson(res, 400, { error: { message: "faltan campos: pregunta, miembros[]" } })
    }
    const orch = coreOrchestrator()
    const r = await consultarParlamento({
      pregunta: body.pregunta,
      contexto: body.contexto,
      miembros: body.miembros,
      chat: (rq, c) => orch.chat(rq, c),
    })
    eventBus.emit("parliament.decided", { decision: r.decision, quorum: r.quorum })
    sendJson(res, 200, r)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

// POST /v2/sandbox — corre código en child_process aislado y devuelve stdout/stderr.
async function handleSandbox(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      lenguaje?: "node" | "python" | "bash"
      codigo?: string
      timeoutMs?: number
      env?: Record<string, string>
    }
    if (!body?.lenguaje || !body?.codigo) {
      return sendJson(res, 400, { error: { message: "faltan campos: lenguaje, codigo" } })
    }
    const r = await correrCodigo({
      lenguaje: body.lenguaje,
      codigo: body.codigo,
      timeoutMs: body.timeoutMs,
      env: body.env,
    })
    eventBus.emit("sandbox.run", { lenguaje: body.lenguaje, ok: r.ok, duracionMs: r.duracionMs })
    sendJson(res, 200, r)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

// GET /v2/events — stream SSE del event bus. Cliente escucha cambios en vivo.
function handleEventsStream(res: http.ServerResponse) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    "connection": "keep-alive",
  })
  res.write(`: connected\n\n`)
  const unsub = eventBus.on("*", (e) => {
    try {
      res.write(`event: ${e.tipo}\n`)
      res.write(`data: ${JSON.stringify({ tipo: e.tipo, data: e.data, ts: e.ts })}\n\n`)
    } catch {
      /* si el write falla, el close handler limpia */
    }
  })
  const heartbeat = setInterval(() => {
    try { res.write(`: ping\n\n`) } catch { /* ignore */ }
  }, 15_000)
  res.on("close", () => {
    unsub()
    clearInterval(heartbeat)
  })
}

// ── Zenkai Engine handlers ──
async function handleEngineDownload(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { id?: string; url?: string; nombre?: string }
    if (!body?.id || !body?.url) {
      return sendJson(res, 400, { error: { message: "faltan campos: id, url" } })
    }
    const engine = getEngine()
    const destPath = engine.getRegistry().defaultPath(body.id)
    // Progress vía event bus (frontend suscribe /v2/events).
    const r = await downloadGguf({
      url: body.url,
      destPath,
      onProgress: (p) => eventBus.emit("engine.download.progress", { id: body.id, ...p }),
    })
    const entry = engine.getRegistry().register({
      id: body.id,
      path: destPath,
      nombre: body.nombre ?? body.id,
      capabilities: inferirCapabilities(body.id),
      sourceUrl: body.url,
    })
    eventBus.emit("engine.download.done", { id: body.id, bytes: r.bytes, duracionMs: r.duracionMs })
    sendJson(res, 200, { entry, bytes: r.bytes })
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

async function handleEngineLoad(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { id?: string }
    if (!body?.id) return sendJson(res, 400, { error: { message: "falta id" } })
    const engine = getEngine()
    const r = await engine.asegurar(body.id)
    sendJson(res, 200, { id: body.id, puerto: r.puerto, entry: r.entry })
    // Auto-benchmark en background — invisible al usuario. Si ya tiene bench
    // reciente (<30 días), skip. Si falla, best-effort. Emite al event bus.
    void (async () => {
      try {
        const bench = await benchmarkYPersistir(engine.getRegistry(), body.id!, r.puerto)
        if (bench?.ok) eventBus.emit("engine.benchmark", bench)
      } catch { /* noop */ }
    })()
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

async function handleEngineCreate(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { id?: string; zenkaifile?: string }
    if (!body?.id || !body?.zenkaifile) {
      return sendJson(res, 400, { error: { message: "faltan campos: id, zenkaifile (contenido texto)" } })
    }
    const spec = parseZenkaiFile(body.zenkaifile)
    const entry = crearModeloDesdeZenkaiFile(getEngine().getRegistry(), body.id, spec)
    eventBus.emit("engine.model.created", { id: body.id })
    sendJson(res, 200, { entry, spec: serializarZenkaiFile(spec) })
  } catch (e) {
    sendJson(res, 400, { error: { message: String((e as Error).message) } })
  }
}

async function handleBootstrap(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const path = require("node:path") as typeof import("node:path")
    const binDir = path.join(tmpdir(), "zenkai-bin")
    const r = await bootstrapLlamaBinary({
      binDir,
      onProgress: (p) => eventBus.emit("bootstrap.progress", p),
    })
    if (r.ok && r.binaryPath) {
      // Setear env var para que futuras detecciones lo encuentren.
      process.env.ZENKAI_LLAMA_SERVER = r.binaryPath
      eventBus.emit("bootstrap.done", { binaryPath: r.binaryPath, version: r.version })
    }
    sendJson(res, r.ok ? 200 : 500, r)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

async function handleHfSearch(url: string, res: http.ServerResponse) {
  try {
    const u = new URL(url, "http://localhost")
    const query = u.searchParams.get("q") ?? ""
    const limit = Number(u.searchParams.get("limit") ?? "20")
    const modelos = await buscarModelosHf(query, limit)
    sendJson(res, 200, modelos)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

async function handleHfFiles(url: string, res: http.ServerResponse) {
  try {
    const modelId = decodeURIComponent(url.slice("/v2/hf/files/".length).split("?")[0]!)
    const files = await listarGgufsDeModelo(modelId)
    sendJson(res, 200, files)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

async function handleEngineBench(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { id?: string; forzar?: boolean }
    if (!body?.id) return sendJson(res, 400, { error: { message: "falta id" } })
    const engine = getEngine()
    const inst = engine.status().instancias.find((i) => i.id === body.id)
    if (!inst) return sendJson(res, 400, { error: { message: "modelo no está cargado — cargá primero" } })
    const r = await benchmarkYPersistir(engine.getRegistry(), body.id, inst.puerto, { forzar: body.forzar })
    sendJson(res, 200, r ?? { ok: false })
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

async function handleEngineUnload(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { id?: string }
    if (!body?.id) return sendJson(res, 400, { error: { message: "falta id" } })
    const ok = getEngine().descargar(body.id)
    sendJson(res, 200, { ok })
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

function handleEngineRemove(url: string, res: http.ServerResponse) {
  const id = decodeURIComponent(url.slice("/v2/engine/models/".length))
  const ok = getEngine().getRegistry().remove(id, { borrarArchivo: true })
  sendJson(res, ok ? 200 : 404, { ok, id })
}

// ── Training handler ──
async function handleTrain(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      datasetPath?: string
      baseModel?: string
      outputDir?: string
      epochs?: number
      permitirCpu?: boolean
    }
    if (!body?.datasetPath || !body?.baseModel || !body?.outputDir) {
      return sendJson(res, 400, { error: { message: "faltan campos: datasetPath, baseModel, outputDir" } })
    }
    const r = await correrTraining({
      datasetPath: body.datasetPath,
      baseModel: body.baseModel,
      outputDir: body.outputDir,
      epochs: body.epochs,
      permitirCpu: body.permitirCpu,
      onLog: (line) => eventBus.emit("train.log", line),
      onProgress: (info) => eventBus.emit("train.progress", info),
    })
    sendJson(res, 200, r)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

// ── Docker sandbox handler ──
async function handleDockerRun(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as {
      lenguaje?: "node" | "python" | "bash"
      codigo?: string
      timeoutMs?: number
      memoryLimit?: string
      cpuLimit?: string
    }
    if (!body?.lenguaje || !body?.codigo) {
      return sendJson(res, 400, { error: { message: "faltan campos: lenguaje, codigo" } })
    }
    const r = await correrEnDocker({
      lenguaje: body.lenguaje,
      codigo: body.codigo,
      timeoutMs: body.timeoutMs,
      memoryLimit: body.memoryLimit,
      cpuLimit: body.cpuLimit,
    })
    sendJson(res, 200, r)
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

// ── Pairing handlers ──
async function handlePairCrear(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { baseUrl?: string; ttlMs?: number }
    const baseUrl = body?.baseUrl ?? `http://localhost:${ZENKAI_ROUTER_PORT}`
    const inv = pairing.crearInvitacion({ baseUrl, ttlMs: body?.ttlMs })
    const qrMatrix = generarQrMatrizSimple(inv.url)
    sendJson(res, 200, { ...inv, qrMatrix })
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

async function handlePairAceptar(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { code?: string; nombre?: string }
    if (!body?.code) return sendJson(res, 400, { error: { message: "falta code" } })
    const r = pairing.aceptar(body.code, {
      nombre: body.nombre,
      userAgent: req.headers["user-agent"],
      ip: req.socket.remoteAddress,
    })
    if (!r.ok) return sendJson(res, 400, { error: { message: r.motivo } })
    eventBus.emit("pair.aceptada", { code: body.code, nombre: body.nombre })
    sendJson(res, 200, { token: r.token })
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

function handlePairStatus(url: string, res: http.ServerResponse) {
  const code = decodeURIComponent(url.slice("/v2/pair/status/".length))
  const inv = pairing.status(code)
  if (!inv) return sendJson(res, 404, { error: { message: "no existe" } })
  sendJson(res, 200, { estado: inv.estado, aceptadaEn: inv.aceptadaEn, clienteInfo: inv.clienteInfo })
}

// ── TTS handler ──
async function handleTtsSynth(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req)) as { texto?: string; modelPath?: string; lengthScale?: number }
    if (!body?.texto || !body?.modelPath) {
      return sendJson(res, 400, { error: { message: "faltan campos: texto, modelPath" } })
    }
    const r = await sintetizar(body.texto, { modelPath: body.modelPath, lengthScale: body.lengthScale })
    if (!r.ok || !r.wavBytes) {
      return sendJson(res, 500, { error: { message: r.mensajeError ?? "sintetización falló" } })
    }
    res.writeHead(200, { "content-type": "audio/wav", "content-length": String(r.wavBytes.length) })
    res.end(Buffer.from(r.wavBytes))
  } catch (e) {
    sendJson(res, 500, { error: { message: String((e as Error).message) } })
  }
}

function extraerJsonBalanceado(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf("{")
  if (start < 0) return undefined
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]!
    if (escape) { escape = false; continue }
    if (c === "\\") { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown> } catch { return undefined }
      }
    }
  }
  return undefined
}

export type ZenkaiRouterStatus = "already-running" | "started" | "skipped"

export async function startZenkaiRouter(): Promise<ZenkaiRouterStatus> {
  try {
    if (await portInUse(ZENKAI_ROUTER_PORT)) return "already-running"
    server = http.createServer((req, res) => {
      const url = req.url ?? ""
      // Endpoints custom del motor propio (fuera del OpenAI-compat).
      if (req.method === "POST" && url === "/v2/reflect") {
        void handleReflect(req, res)
        return
      }
      if (req.method === "POST" && url === "/v2/repair") {
        void handleRepair(req, res)
        return
      }
      if (req.method === "POST" && url === "/v2/parliament") {
        void handleParliament(req, res)
        return
      }
      if (req.method === "POST" && url === "/v2/sandbox") {
        void handleSandbox(req, res)
        return
      }
      if (req.method === "GET" && url.startsWith("/v2/events")) {
        return handleEventsStream(res)
      }
      // Zenkai Engine (reemplazo de Ollama).
      if (req.method === "GET" && url === "/v2/engine/status") {
        return sendJson(res, 200, getEngine().status())
      }
      if (req.method === "GET" && url === "/v2/engine/models") {
        return sendJson(res, 200, { catalogo: MODELOS_RECOMENDADOS, instalados: getEngine().getRegistry().list() })
      }
      if (req.method === "POST" && url === "/v2/engine/download") {
        void handleEngineDownload(req, res)
        return
      }
      if (req.method === "POST" && url === "/v2/engine/load") {
        void handleEngineLoad(req, res)
        return
      }
      if (req.method === "POST" && url === "/v2/engine/unload") {
        void handleEngineUnload(req, res)
        return
      }
      if (req.method === "DELETE" && url.startsWith("/v2/engine/models/")) {
        return void handleEngineRemove(url, res)
      }
      // Training.
      if (req.method === "GET" && url === "/v2/train/gpu") {
        void (async () => sendJson(res, 200, await detectarGpu()))()
        return
      }
      if (req.method === "POST" && url === "/v2/train") {
        void handleTrain(req, res)
        return
      }
      // Docker sandbox.
      if (req.method === "GET" && url === "/v2/docker/status") {
        void (async () => sendJson(res, 200, await detectarDocker()))()
        return
      }
      if (req.method === "POST" && url === "/v2/docker/run") {
        void handleDockerRun(req, res)
        return
      }
      // Pairing (mobile companion).
      if (req.method === "POST" && url === "/v2/pair/crear") {
        void handlePairCrear(req, res)
        return
      }
      if (req.method === "POST" && url === "/v2/pair/aceptar") {
        void handlePairAceptar(req, res)
        return
      }
      if (req.method === "GET" && url.startsWith("/v2/pair/status/")) {
        return void handlePairStatus(url, res)
      }
      // TTS Piper.
      // Hardware monitor + benchmarks (automáticos, sin opciones).
      if (req.method === "GET" && url === "/v2/hw") {
        void (async () => sendJson(res, 200, await hwMonitor.snapshot()))()
        return
      }
      // Diagnóstico + recomendación de modelos según HW.
      if (req.method === "GET" && url === "/v2/engine/diagnostico") {
        void (async () => {
          const snap = await hwMonitor.snapshot()
          sendJson(res, 200, resumenRecomendacion(snap))
        })()
        return
      }
      if (req.method === "GET" && url === "/v2/engine/benchmarks") {
        const eng = getEngine()
        const modelsDir = process.env.ZENKAI_MODELS_DIR ?? (require("node:path") as typeof import("node:path")).join(tmpdir(), "zenkai-models")
        return sendJson(res, 200, leerBenchmarks(modelsDir))
        void eng // silenciar lint
      }
      if (req.method === "POST" && url === "/v2/engine/benchmark") {
        void handleEngineBench(req, res)
        return
      }
      // Independencia total: bootstrap del binario llama-server (descarga auto).
      if (req.method === "POST" && url === "/v2/engine/bootstrap") {
        void handleBootstrap(req, res)
        return
      }
      // HuggingFace search (LM Studio-like).
      if (req.method === "GET" && url.startsWith("/v2/hf/search")) {
        void handleHfSearch(url, res)
        return
      }
      if (req.method === "GET" && url.startsWith("/v2/hf/files/")) {
        void handleHfFiles(url, res)
        return
      }
      // Ollama import (feature opcional — puente para usuarios que ya usan Ollama).
      if (req.method === "GET" && url === "/v2/ollama/status") {
        return sendJson(res, 200, { instalado: ollamaEstaInstalado(), modelos: descubrirModelosOllama() })
      }
      if (req.method === "POST" && url === "/v2/ollama/import") {
        const r = importarOllamaAlRegistry(getEngine().getRegistry())
        eventBus.emit("ollama.imported", r)
        return sendJson(res, 200, r)
      }
      // ZenkaiFile — modelo custom con SYSTEM/PARAMETER/TEMPLATE (paridad + mejora Modelfile).
      if (req.method === "POST" && url === "/v2/engine/create") {
        void handleEngineCreate(req, res)
        return
      }
      if (req.method === "GET" && url === "/v2/tts/status") {
        void (async () => {
          const p = await detectarPiper()
          sendJson(res, 200, { piperDisponible: p, voces: VOCES_PIPER })
        })()
        return
      }
      if (req.method === "POST" && url === "/v2/tts/synth") {
        void handleTtsSynth(req, res)
        return
      }
      // Rutas /v2/* van 100% al motor @zenkai/core (Fase 6).
      if (url.startsWith("/v2/")) {
        void (async () => {
          try {
            const webReq = await toWebRequest(req)
            const webRes = await coreServer().handle(new Request(webReq.url.replace("/v2/", "/v1/"), webReq))
            await copyResponse(webRes, res)
          } catch (e) {
            sendJson(res, 500, { error: { message: String(e) } })
          }
        })()
        return
      }
      if (req.method === "GET" && url.startsWith("/v1/models")) return void handleModels(res)
      if (req.method === "GET" && url === "/v1/health") return void handleHealth(res)
      if (req.method === "POST" && url.startsWith("/v1/chat/completions")) {
        // Toggle: si el motor propio está activo, /v1 se sirve por @zenkai/core.
        // Sin toggle, sigue el pipeline legacy con Ollama passthrough.
        if (motorPropioActivo()) {
          void (async () => {
            try {
              const webReq = await toWebRequest(req)
              const target = new Request(webReq.url.replace("/v1/chat/completions", "/v1/chat/completions"), webReq)
              const webRes = await coreServer().handle(target)
              await copyResponse(webRes, res)
            } catch (e) {
              sendJson(res, 500, { error: { message: String(e) } })
            }
          })()
          return
        }
        return void handleChat(req, res)
      }
      if (req.method === "POST" && url === "/img") return void handleImagePost(req, res)
      if (req.method === "GET" && url.startsWith("/img/")) return handleImageGet(url, res)
      if (req.method === "GET" && (url === "/" || url.startsWith("/health"))) return sendJson(res, 200, { ok: true })
      sendJson(res, 404, { error: { message: "No encontrado" } })
    })
    // El listen puede fallar (EADDRINUSE por TOCTOU tras portInUse): resolvemos en 'listening'
    // y rechazamos en 'error', si no el arranque quedaría colgado para siempre.
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject)
      server!.listen(ZENKAI_ROUTER_PORT, "127.0.0.1", () => {
        server!.on("error", () => {}) // ya escuchando: no tumbar el proceso por errores post-listen
        resolve()
      })
    })
    return "started"
  } catch {
    return "skipped"
  }
}

export function stopZenkaiRouter(): void {
  try {
    server?.close()
  } catch {
    /* noop */
  }
  server = undefined
}
