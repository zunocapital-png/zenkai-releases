// ZENKAI Router: motor de "Auto" 100% NUESTRO (reemplaza el binario externo omniroute).
// Es un pequeño servidor OpenAI-compatible en localhost:20128 que:
//   - GET /v1/models       -> lista "auto" + los modelos locales de Ollama.
//   - POST /v1/chat/completions -> si el modelo es "auto"/"auto/*", elige el mejor
//     modelo local de Ollama disponible y hace de proxy a Ollama (que ya es
//     OpenAI-compatible en :11434/v1). El streaming se pasa tal cual (byte passthrough).
//
// Sin dependencias externas, sin npm, sin binarios de terceros: solo Node.
// Si Ollama no está o no hay modelos, responde un error claro (y el usuario igual
// puede elegir un modelo puntual en el selector).

import http from "node:http"
import net from "node:net"
import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"

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

// Circuit breaker: si un upstream falla, lo saltamos por COOLDOWN_MS (evita martillar
// caídos y pagar el timeout completo en cada request). name -> timestamp hasta el que sigue abierto.
const breaker = new Map<string, number>()
const COOLDOWN_MS = 30_000
// Watchdog de primer byte. Antes eran 8s, pero un modelo local recién arrancado
// (5-7 GB cargando a RAM la primera vez) TARDA 20-40s en emitir el primer token.
// Con 8s el router abortaba, disparaba el circuit breaker y devolvía 503 sin
// error visible — el usuario veía "la IA no responde". 60s es holgado sin ser
// eterno; los upstreams de nube igual responden en < 5s.
const PRIMER_BYTE_MS = 60_000

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

// Modelo concreto a usar en un upstream para el pedido dado.
async function resolverModelo(u: Upstream, pedido: string): Promise<string | undefined> {
  if (pedido !== "auto" && !pedido.startsWith("auto/")) return pedido
  if (u.kind === "ollama") return elegirModelo(await tagsOllama())
  return u.model // los upstreams de nube traen su modelo fijo
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
    if (Date.now() < (breaker.get(u.name) ?? 0)) continue // circuito abierto -> saltar sin esperar
    const modelo = await resolverModelo(u, pedido)
    if (!modelo) continue // p.ej. Ollama sin modelos -> probar el siguiente upstream
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (u.key) headers["authorization"] = `Bearer ${u.key}`
    // Watchdog de PRIMER BYTE: el timeout SOLO debe matar la espera de headers, NO el
    // stream de tokens. AbortSignal.timeout aborta toda la operación (incluido el body),
    // así que usamos un AbortController propio y limpiamos el timer al llegar los headers.
    const ac = new AbortController()
    const watchdog = setTimeout(() => ac.abort(), PRIMER_BYTE_MS)
    let upstream: Response
    try {
      upstream = await fetch(`${u.base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, model: modelo }),
        signal: ac.signal,
      })
    } catch {
      clearTimeout(watchdog)
      breaker.set(u.name, Date.now() + COOLDOWN_MS) // caído/timeout -> cooldown
      continue
    }
    clearTimeout(watchdog) // llegaron los headers: a partir de acá el stream puede tardar lo que sea
    if (upstream.status >= 500 || upstream.status === 429) {
      breaker.set(u.name, Date.now() + COOLDOWN_MS) // agotado/caído -> cooldown
      continue
    }
    breaker.delete(u.name) // respondió -> cerrar el circuito
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    })
    if (upstream.body) {
      const stream = Readable.fromWeb(upstream.body as any)
      // Si el upstream corta feo, cerramos la respuesta sin tirar el proceso.
      stream.on("error", () => res.destroyed || res.end())
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

export type ZenkaiRouterStatus = "already-running" | "started" | "skipped"

export async function startZenkaiRouter(): Promise<ZenkaiRouterStatus> {
  try {
    if (await portInUse(ZENKAI_ROUTER_PORT)) return "already-running"
    server = http.createServer((req, res) => {
      const url = req.url ?? ""
      if (req.method === "GET" && url.startsWith("/v1/models")) return void handleModels(res)
      if (req.method === "POST" && url.startsWith("/v1/chat/completions")) return void handleChat(req, res)
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
