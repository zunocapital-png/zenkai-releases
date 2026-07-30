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

async function tagsOllama(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return []
    const data = (await res.json()) as { models?: Array<{ name?: string }> }
    return (data.models ?? []).map((m) => m?.name).filter((n): n is string => typeof n === "string")
  } catch {
    return []
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
    const modelo = await resolverModelo(u, pedido)
    if (!modelo) continue // p.ej. Ollama sin modelos -> probar el siguiente upstream
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (u.key) headers["authorization"] = `Bearer ${u.key}`
    let upstream: Response
    try {
      upstream = await fetch(`${u.base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, model: modelo }),
      })
    } catch {
      continue // upstream caído -> failover al siguiente
    }
    if (upstream.status >= 500 || upstream.status === 429) continue // agotado/caído -> failover
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    })
    if (upstream.body) Readable.fromWeb(upstream.body as any).pipe(res)
    else res.end(await upstream.text())
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
    server.on("error", () => {})
    await new Promise<void>((resolve) => server!.listen(ZENKAI_ROUTER_PORT, "127.0.0.1", resolve))
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
