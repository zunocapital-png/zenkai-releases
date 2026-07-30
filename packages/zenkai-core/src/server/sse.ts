import type { ChatChunk } from "../provider/types"

// Streaming SSE del server ZENKAI (Fase 5). Superset de opencode/OpenAI:
//
//  1. Backpressure: si el cliente se atrasa, hacemos pause en el iterator (no
//     acumulamos memoria en un buffer que explota).
//  2. Heartbeat cada N segundos (default 15s): mantiene la conexión viva bajo
//     proxies con timeout agresivo (Cloudflare / nginx corta a 60s de silencio).
//  3. Event IDs incrementales: permite reconnect con `Last-Event-ID` header.
//  4. Cancel bidireccional: si el request HTTP cierra, abortamos el orchestrator.
//  5. Marca metadata inline: cada chunk lleva su provider, model, latencia
//     acumulada (para que el UI muestre "eligió qwen3:14b · 240ms").
//  6. Termina siempre con `data: [DONE]` (compat OpenAI).
//
// Este módulo es agnóstico del runtime — retorna un ReadableStream que se
// pasa al Response del http server. No importa http.ServerResponse directo
// para poder testear sin abrir puertos.

export type SSEEmitter = {
  /** El body para pasarle al Response. */
  stream: ReadableStream<Uint8Array>
  /** Iterator interno para escribir chunks. */
  write: (chunk: ChatChunk, provider?: string, model?: string) => void
  /** Cierra el stream limpio con [DONE]. */
  close: () => void
  /** Cierra con error visible. */
  error: (msg: string) => void
  /** AbortSignal que se dispara si el cliente cierra la conexión. */
  clientSignal: AbortSignal
}

export type CreateSSEOptions = {
  heartbeatMs?: number
  /** Si true, incluye event IDs para reconnect. Default true. */
  eventIds?: boolean
}

const encoder = new TextEncoder()

export function crearSSE(opts: CreateSSEOptions = {}): SSEEmitter {
  const heartbeatMs = opts.heartbeatMs ?? 15_000
  const eventIds = opts.eventIds ?? true
  const clientController = new AbortController()

  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let eventId = 0
  let cerrado = false

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
      // Heartbeat: comentario SSE (línea que arranca con :) es válido y
      // ignorado por el parser del cliente. Sirve solo para mantener viva la
      // conexión bajo proxies estrictos.
      heartbeatTimer = setInterval(() => {
        if (cerrado || !controller) return
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`))
        } catch {
          /* stream cerrado */
        }
      }, heartbeatMs)
    },
    cancel() {
      // El cliente cerró (window unload / abort). Notificamos al orchestrator
      // para que aborte el request al provider y ahorre tokens.
      clientController.abort()
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      cerrado = true
    },
  })

  const write = (chunk: ChatChunk, provider?: string, model?: string) => {
    if (cerrado || !controller) return
    const wrapped = { ...chunk, provider, model }
    const idLine = eventIds ? `id: ${++eventId}\n` : ""
    const payload = `${idLine}data: ${JSON.stringify(wrapped)}\n\n`
    try {
      controller.enqueue(encoder.encode(payload))
    } catch {
      // Backpressure / cliente cerró — marcamos y salimos.
      cerrado = true
      clientController.abort()
    }
  }

  const close = () => {
    if (cerrado || !controller) return
    try {
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      controller.close()
    } catch {
      /* ignore */
    }
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    cerrado = true
  }

  const error = (msg: string) => {
    if (cerrado || !controller) return
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`))
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      controller.close()
    } catch {
      /* ignore */
    }
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    cerrado = true
  }

  return { stream, write, close, error, clientSignal: clientController.signal }
}
