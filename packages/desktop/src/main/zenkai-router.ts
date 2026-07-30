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
import { Readable } from "node:stream"

export const ZENKAI_ROUTER_PORT = 20128
const OLLAMA = "http://localhost:11434"

let server: http.Server | undefined

// Circuit breaker: si un upstream falla, lo saltamos por COOLDOWN_MS (evita martillar
// caídos y pagar el timeout completo en cada request). name -> timestamp hasta el que sigue abierto.
const breaker = new Map<string, number>()
const COOLDOWN_MS = 30_000
const PRIMER_BYTE_MS = 8_000 // watchdog: si no llega respuesta en este tiempo, failover

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
const PREFERENCIA = ["qwen2.5-coder", "qwen3", "qwen2.5", "llama3.1", "deepseek", "mistral", "gemma"]

// Cache corto de tags: en "auto" resolverModelo y handleModels piden /api/tags seguido;
// un TTL de 5s evita un roundtrip HTTP extra (con su timeout) por cada request.
let tagsCache: { at: number; tags: string[] } | undefined
const TAGS_TTL_MS = 5_000

async function tagsOllama(): Promise<string[]> {
  if (tagsCache && Date.now() - tagsCache.at < TAGS_TTL_MS) return tagsCache.tags
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return tagsCache?.tags ?? []
    const data = (await res.json()) as { models?: Array<{ name?: string }> }
    const tags = (data.models ?? []).map((m) => m?.name).filter((n): n is string => typeof n === "string")
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

  sendJson(res, 503, {
    error: {
      message:
        "ZENKAI Auto no encontró un modelo disponible. Descargá un modelo local en Diagnóstico o conectá un proveedor de nube.",
      type: "no_upstream",
    },
  })
}

export type ZenkaiRouterStatus = "already-running" | "started" | "skipped"

export async function startZenkaiRouter(): Promise<ZenkaiRouterStatus> {
  try {
    if (await portInUse(ZENKAI_ROUTER_PORT)) return "already-running"
    server = http.createServer((req, res) => {
      const url = req.url ?? ""
      if (req.method === "GET" && url.startsWith("/v1/models")) return void handleModels(res)
      if (req.method === "POST" && url.startsWith("/v1/chat/completions")) return void handleChat(req, res)
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
