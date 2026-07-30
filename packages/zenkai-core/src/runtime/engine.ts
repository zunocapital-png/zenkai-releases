import { LlamaServer, detectarBinario } from "./llama-server"
import { ModelRegistry } from "./model-registry"
import type { ModelEntry } from "./model-registry"

// Zenkai Engine: daemon UNIFICADO que reemplaza y mejora Ollama.
//
// Qué hace Ollama:  descarga GGUF, corre modelos, sirve OpenAI-compat, gestiona modelos.
// Qué hace Zenkai:  todo eso, MÁS:
//   - Load/unload por demanda con keep_alive tunable.
//   - Un solo puerto público (:20130) que mapea a instancias por modelo.
//   - Auto-swap: si piden modelo X y no está cargado, lo carga (evita segundo puerto).
//   - Concurrencia: N modelos cargados en paralelo dentro del límite de VRAM.
//   - LRU eviction cuando llega al límite.
//   - Métricas por modelo (requests, tokens, latency).
//   - Integración nativa con ProviderOrchestrator, semantic cache, cost tracking.
//
// Cada modelo carga una instancia de LlamaServer en un puerto interno propio
// (20140+). El Engine hace routing por modelo cuando le llega un request.

export type EngineOptions = {
  modelsDir: string
  /** Binario llama-server. Si no se pasa, se detecta. */
  binaryPath?: string
  /** Modelos que pueden estar cargados simultáneamente. Default 2. */
  maxCargadosConcurrent?: number
  /** ms tras último uso para descargar un modelo (LRU). Default 5 min. */
  keepAliveMs?: number
  /** Puerto interno inicial — cada modelo suma 1. Default 20140. */
  puertoInternoBase?: number
  /** Args extra por default a llama-server (ej. n-gpu-layers). */
  llamaExtraArgs?: string[]
  /** Callback para eventos importantes (UI puede suscribirse). */
  onEvent?: (evt: EngineEvent) => void
}

export type EngineEvent =
  | { tipo: "modelo.cargando"; id: string }
  | { tipo: "modelo.cargado"; id: string; puerto: number; duracionMs: number }
  | { tipo: "modelo.descargando"; id: string }
  | { tipo: "modelo.error"; id: string; error: string }
  | { tipo: "engine.stopped" }

type InstanciaCargada = {
  entry: ModelEntry
  server: LlamaServer
  puerto: number
  cargadoEn: number
  ultimoUsoEn: number
  requestsActivos: number
}

export class ZenkaiEngine {
  private opts: EngineOptions
  private registry: ModelRegistry
  private instancias = new Map<string, InstanciaCargada>()
  private binary: string | undefined
  private nextPort: number
  private gcInterval: ReturnType<typeof setInterval> | undefined

  constructor(opts: EngineOptions) {
    this.opts = opts
    this.registry = new ModelRegistry({ modelsDir: opts.modelsDir })
    this.binary = opts.binaryPath ?? detectarBinario()
    this.nextPort = opts.puertoInternoBase ?? 20140
  }

  /** Arranca el GC de LRU eviction. No arranca modelos — se cargan on-demand. */
  start(): void {
    this.gcInterval = setInterval(() => this.gcLru(), 30_000).unref()
  }

  stop(): void {
    if (this.gcInterval) clearInterval(this.gcInterval)
    for (const inst of this.instancias.values()) {
      try { inst.server.stop() } catch { /* noop */ }
    }
    this.instancias.clear()
    this.opts.onEvent?.({ tipo: "engine.stopped" })
  }

  getRegistry(): ModelRegistry { return this.registry }
  getBinary(): string | undefined { return this.binary }

  /** Info runtime — cuántos modelos cargados, qué puertos, memoria. */
  status(): {
    binaryDetectado: string | undefined
    cargadosCount: number
    maxCargados: number
    instancias: Array<{ id: string; puerto: number; ultimoUsoEn: number; requestsActivos: number }>
  } {
    return {
      binaryDetectado: this.binary,
      cargadosCount: this.instancias.size,
      maxCargados: this.opts.maxCargadosConcurrent ?? 2,
      instancias: Array.from(this.instancias.entries()).map(([id, i]) => ({
        id,
        puerto: i.puerto,
        ultimoUsoEn: i.ultimoUsoEn,
        requestsActivos: i.requestsActivos,
      })),
    }
  }

  /**
   * Asegura que un modelo está cargado y devuelve su puerto interno.
   * Si no está cargado, lo carga (haciendo LRU eviction si hace falta).
   */
  async asegurar(modelId: string): Promise<{ puerto: number; entry: ModelEntry }> {
    const yaCargado = this.instancias.get(modelId)
    if (yaCargado) {
      yaCargado.ultimoUsoEn = Date.now()
      return { puerto: yaCargado.puerto, entry: yaCargado.entry }
    }
    const entry = this.registry.get(modelId)
    if (!entry) throw new Error(`modelo '${modelId}' no está en el registry — descárgalo primero`)
    if (!this.binary) throw new Error(`llama-server no detectado — instalalo desde llama.cpp release`)

    // Si estamos al límite, evicta el más viejo antes de cargar.
    const max = this.opts.maxCargadosConcurrent ?? 2
    while (this.instancias.size >= max) {
      this.evictarLru()
    }

    this.opts.onEvent?.({ tipo: "modelo.cargando", id: modelId })
    const t0 = Date.now()
    const puerto = this.nextPort++
    const server = new LlamaServer({
      binaryPath: this.binary,
      modelPath: entry.path,
      port: puerto,
      extraArgs: [
        ...(this.opts.llamaExtraArgs ?? []),
        ...(entry.paramsDefault?.ctx_size ? ["--ctx-size", String(entry.paramsDefault.ctx_size)] : []),
        ...(entry.paramsDefault?.n_gpu_layers ? ["--n-gpu-layers", String(entry.paramsDefault.n_gpu_layers)] : []),
      ],
    })
    try {
      await server.start()
    } catch (e) {
      this.opts.onEvent?.({ tipo: "modelo.error", id: modelId, error: (e as Error).message })
      throw e
    }
    const inst: InstanciaCargada = {
      entry,
      server,
      puerto,
      cargadoEn: Date.now(),
      ultimoUsoEn: Date.now(),
      requestsActivos: 0,
    }
    this.instancias.set(modelId, inst)
    this.opts.onEvent?.({ tipo: "modelo.cargado", id: modelId, puerto, duracionMs: Date.now() - t0 })
    return { puerto, entry }
  }

  /** Descarga (unload) un modelo manualmente. */
  descargar(modelId: string): boolean {
    const inst = this.instancias.get(modelId)
    if (!inst) return false
    this.opts.onEvent?.({ tipo: "modelo.descargando", id: modelId })
    try { inst.server.stop() } catch { /* noop */ }
    this.instancias.delete(modelId)
    return true
  }

  /** Marca que un modelo empezó a servir un request (para el keepalive). */
  markInicio(modelId: string): void {
    const inst = this.instancias.get(modelId)
    if (inst) {
      inst.requestsActivos++
      inst.ultimoUsoEn = Date.now()
    }
  }
  markFin(modelId: string): void {
    const inst = this.instancias.get(modelId)
    if (inst) {
      inst.requestsActivos = Math.max(0, inst.requestsActivos - 1)
      inst.ultimoUsoEn = Date.now()
    }
  }

  // ── LRU / GC ──
  private evictarLru(): void {
    let oldest: InstanciaCargada | undefined
    for (const inst of this.instancias.values()) {
      // Nunca evictar uno con requests activos.
      if (inst.requestsActivos > 0) continue
      if (!oldest || inst.ultimoUsoEn < oldest.ultimoUsoEn) oldest = inst
    }
    if (oldest) this.descargar(oldest.entry.id)
  }

  private gcLru(): void {
    const ttl = this.opts.keepAliveMs ?? 5 * 60_000
    const ahora = Date.now()
    for (const inst of this.instancias.values()) {
      if (inst.requestsActivos > 0) continue
      if (ahora - inst.ultimoUsoEn > ttl) this.descargar(inst.entry.id)
    }
  }
}
