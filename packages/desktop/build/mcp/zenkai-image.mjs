#!/usr/bin/env node
// ZENKAI Image — herramienta MCP PROPIA (sin dependencias) que le da al modelo la capacidad
// de GENERAR IMÁGENES desde el chat, como Claude: el usuario pide "generá una imagen de X" y
// el modelo llama a esta tool, que produce la imagen y la devuelve inline en la conversación.
//
// Usa el proveedor que el usuario configuró UNA vez (guardado en un archivo JSON que apunta
// ZENKAI_IMAGE_CONFIG):
//   { "mode": "local", "sdUrl": "http://localhost:7860" }                         // Stable Diffusion local
//   { "mode": "nube", "baseURL": "https://api.together.xyz/v1", "key": "...", "model": "black-forest-labs/FLUX.1-schnell-Free" }
// Sin config, la tool avisa cómo activarla. Protocolo MCP por stdio (JSON-RPC 2.0, newline).

import { readFileSync } from "node:fs"
import readline from "node:readline"

const CONFIG_FILE = process.env.ZENKAI_IMAGE_CONFIG

function leerConfig() {
  try {
    if (!CONFIG_FILE) return null
    const raw = readFileSync(CONFIG_FILE, "utf8")
    const c = JSON.parse(raw)
    return c && typeof c === "object" ? c : null
  } catch {
    return null
  }
}

// Genera con Stable Diffusion local (Automatic1111/Forge). Devuelve base64 PNG.
async function generarLocal(cfg, prompt, size) {
  const url = (cfg.sdUrl || "http://localhost:7860").replace(/\/$/, "")
  const res = await fetch(`${url}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, steps: 25, width: size, height: size, cfg_scale: 7 }),
  })
  if (!res.ok) throw new Error(`Motor local respondió ${res.status}`)
  const data = await res.json()
  const b64 = data?.images?.[0]
  if (!b64) throw new Error("El motor local no devolvió imagen.")
  return b64
}

// Genera con una API de imagen OpenAI-compatible (/images/generations). Devuelve base64 PNG.
async function generarNube(cfg, prompt, size) {
  const base = String(cfg.baseURL || "").replace(/\/$/, "")
  if (!base || !cfg.model) throw new Error("Falta baseURL o modelo en la config de nube.")
  if (!cfg.key) throw new Error("Falta la API key en la config de nube.")
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, prompt, n: 1, size: `${size}x${size}`, response_format: "b64_json" }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `El proveedor respondió ${res.status}`)
  const item = data?.data?.[0]
  if (item?.b64_json) return item.b64_json
  if (item?.url) {
    // Algunos proveedores devuelven URL: la bajamos y convertimos a base64.
    const img = await fetch(item.url)
    const buf = Buffer.from(await img.arrayBuffer())
    return buf.toString("base64")
  }
  throw new Error("El proveedor no devolvió imagen.")
}

const TOOLS = [
  {
    name: "generar_imagen",
    description:
      "Genera una imagen a partir de una descripción (texto→imagen) y la devuelve en el chat. Úsalo cuando el usuario pida crear/diseñar/generar una imagen. La imagen se produce con el proveedor configurado en ZENKAI (Stable Diffusion local o una API de nube).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Descripción detallada de la imagen a generar (en inglés rinde mejor)." },
        size: { type: "number", description: "Lado en píxeles (512, 768 o 1024). Default 1024." },
      },
      required: ["prompt"],
    },
  },
]

async function runTool(name, args) {
  if (name !== "generar_imagen") throw new Error(`Herramienta desconocida: ${name}`)
  const cfg = leerConfig()
  if (!cfg || !cfg.mode) {
    return {
      text: "🖼️ La generación de imágenes no está configurada. Abrí el botón 'Imagen' (menú + del chat) y elegí un proveedor (Stable Diffusion local o una API de nube con tu key) una sola vez. Después podés pedir imágenes por acá.",
    }
  }
  const prompt = String(args?.prompt ?? "").trim()
  if (!prompt) throw new Error("Falta el prompt de la imagen.")
  const size = [512, 768, 1024].includes(args?.size) ? args.size : 1024
  const b64 = cfg.mode === "local" ? await generarLocal(cfg, prompt, size) : await generarNube(cfg, prompt, size)
  return { image: b64 }
}

// ── Transporte MCP (JSON-RPC 2.0 por stdio) ──
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n")
}
async function handle(msg) {
  const { id, method, params } = msg
  if (method === "initialize") {
    return send({
      jsonrpc: "2.0",
      id,
      result: { protocolVersion: params?.protocolVersion ?? "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "zenkai-image", version: "1.0.0" } },
    })
  }
  if (method === "notifications/initialized" || method === "initialized") return
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } })
  if (method === "tools/call") {
    try {
      const out = await runTool(params?.name, params?.arguments ?? {})
      const content = out.image
        ? [
            { type: "text", text: "Imagen generada." },
            { type: "image", data: out.image, mimeType: "image/png" },
          ]
        : [{ type: "text", text: out.text ?? "ok" }]
      return send({ jsonrpc: "2.0", id, result: { content } })
    } catch (e) {
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `No se pudo generar la imagen: ${e.message}` }], isError: true } })
    }
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Método no soportado: ${method}` } })
}

const rl = readline.createInterface({ input: process.stdin })
let cola = Promise.resolve()
rl.on("line", (line) => {
  const t = line.trim()
  if (!t) return
  let msg
  try {
    msg = JSON.parse(t)
  } catch {
    return
  }
  cola = cola.then(() => handle(msg)).catch(() => {})
})
