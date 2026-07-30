import { createSignal, For, Show, onMount } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Zenkai Engine: reemplaza Ollama. Descarga GGUF, gestiona modelos, carga/descarga.
// Consume /v2/engine/*.

type CatalogoItem = { id: string; nombre: string; tamanoAprox: string; url: string; tipo: string }
type ModelEntry = { id: string; nombre: string; path: string; bytes: number; capabilities?: string[]; installedAt: number }
type EngineStatus = { binaryDetectado?: string; cargadosCount: number; maxCargados: number; instancias: Array<{ id: string; puerto: number; requestsActivos: number }> }

export function DialogZenkaiEngine() {
  const dialog = useDialog()
  const [status, setStatus] = createSignal<EngineStatus | undefined>()
  const [catalogo, setCatalogo] = createSignal<CatalogoItem[]>([])
  const [instalados, setInstalados] = createSignal<ModelEntry[]>([])
  const [descargando, setDescargando] = createSignal<string | undefined>()
  const [progreso, setProgreso] = createSignal(0)
  const [msg, setMsg] = createSignal<string | undefined>()

  const cargar = async () => {
    try {
      const [s, m] = await Promise.all([
        fetch("/v2/engine/status").then((r) => r.json()) as Promise<EngineStatus>,
        fetch("/v2/engine/models").then((r) => r.json()) as Promise<{ catalogo: CatalogoItem[]; instalados: ModelEntry[] }>,
      ])
      setStatus(s)
      setCatalogo(m.catalogo)
      setInstalados(m.instalados)
    } catch (e) {
      setMsg("Error cargando estado del motor: " + String((e as Error).message))
    }
  }

  onMount(() => {
    void cargar()
    // Suscribimos al event bus para progreso de descargas.
    try {
      const es = new EventSource("/v2/events")
      es.addEventListener("engine.download.progress", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data as string) as { data: { percent?: number; id?: string } }
          if (data?.data?.percent != null && data.data.id === descargando()) {
            setProgreso(data.data.percent)
          }
        } catch { /* ignore */ }
      })
      es.addEventListener("engine.download.done", () => {
        setDescargando(undefined)
        setProgreso(0)
        void cargar()
      })
    } catch { /* SSE no disponible en algunos entornos */ }
  })

  const descargar = async (item: CatalogoItem) => {
    setDescargando(item.id)
    setProgreso(0)
    setMsg(undefined)
    try {
      const r = await fetch("/v2/engine/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, url: item.url, nombre: item.nombre }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await cargar()
    } catch (e) {
      setMsg("Error: " + String((e as Error).message))
    } finally {
      setDescargando(undefined)
    }
  }

  const cargarModelo = async (id: string) => {
    try {
      const r = await fetch("/v2/engine/load", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
      await cargar()
    } catch (e) {
      setMsg("Error cargando: " + String((e as Error).message))
    }
  }

  const descargarModelo = async (id: string) => {
    await fetch("/v2/engine/unload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })
    await cargar()
  }

  const eliminar = async (id: string) => {
    if (!confirm(`¿Eliminar el modelo ${id} del disco? Esta acción no se puede deshacer.`)) return
    await fetch(`/v2/engine/models/${encodeURIComponent(id)}`, { method: "DELETE" })
    await cargar()
  }

  return (
    <div style="padding:20px;max-width:820px;max-height:80vh;overflow-y:auto;">
      <h2 style="margin:0 0 4px;">Zenkai Engine</h2>
      <p style="margin:0 0 12px;color:#888;font-size:13px;">
        Runtime propio 100% local. Descarga, carga y sirve modelos GGUF sin depender de Ollama.
      </p>

      <Show when={status()}>
        {(s) => (
          <div style="padding:10px;background:#0f0f0f;border:1px solid #222;border-radius:6px;margin-bottom:16px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;color:#aaa;">
              <span>Binario llama-server: {s().binaryDetectado ? <span style="color:#4ade80;">✓ {s().binaryDetectado}</span> : <span style="color:#f87171;">✗ no detectado</span>}</span>
              <span>Cargados: {s().cargadosCount} / {s().maxCargados}</span>
            </div>
            <Show when={!s().binaryDetectado}>
              <div style="margin-top:8px;padding:8px;background:#3a2010;border-radius:4px;color:#facc15;">
                Instalá llama.cpp: <code>brew install llama.cpp</code> / <code>scoop install llama-cpp</code> / <code>apt install llama.cpp</code>
              </div>
            </Show>
          </div>
        )}
      </Show>

      <Show when={msg()}>
        <div style="padding:10px;background:#3a1010;color:#ff8a8a;border-radius:6px;margin-bottom:12px;font-size:13px;">{msg()}</div>
      </Show>

      <h3 style="margin:16px 0 8px;font-size:14px;color:#e4e4e4;">Modelos instalados ({instalados().length})</h3>
      <Show when={instalados().length === 0}>
        <div style="color:#666;font-size:13px;margin-bottom:12px;">Ningún modelo aún. Descargá uno de abajo.</div>
      </Show>
      <For each={instalados()}>
        {(m) => {
          const cargado = () => status()?.instancias.some((i) => i.id === m.id)
          return (
            <div style="display:flex;align-items:center;padding:10px;background:#0f0f0f;border:1px solid #222;border-radius:6px;margin-bottom:6px;">
              <div style="flex:1;">
                <div style="color:#e4e4e4;font-weight:600;">{m.nombre}</div>
                <div style="font-size:11px;color:#666;">{m.id} · {(m.bytes / (1024 * 1024)).toFixed(0)} MB · {m.capabilities?.join(", ") ?? ""}</div>
              </div>
              <Show when={cargado()} fallback={
                <button onClick={() => cargarModelo(m.id)} style="padding:6px 12px;background:#0f2a10;color:#4ade80;border:0;border-radius:4px;cursor:pointer;font-size:12px;margin-right:6px;">Cargar</button>
              }>
                <span style="color:#4ade80;font-size:11px;margin-right:8px;">● cargado</span>
                <button onClick={() => descargarModelo(m.id)} style="padding:6px 12px;background:#2a2010;color:#facc15;border:0;border-radius:4px;cursor:pointer;font-size:12px;margin-right:6px;">Unload</button>
              </Show>
              <button onClick={() => eliminar(m.id)} style="padding:6px 12px;background:#3a1010;color:#f87171;border:0;border-radius:4px;cursor:pointer;font-size:12px;">Borrar</button>
            </div>
          )
        }}
      </For>

      <h3 style="margin:16px 0 8px;font-size:14px;color:#e4e4e4;">Catálogo recomendado</h3>
      <For each={catalogo().filter((c) => !instalados().some((i) => i.id === c.id))}>
        {(item) => (
          <div style="display:flex;align-items:center;padding:10px;background:#0f0f0f;border:1px solid #222;border-radius:6px;margin-bottom:6px;">
            <div style="flex:1;">
              <div style="color:#e4e4e4;font-weight:600;">{item.nombre}</div>
              <div style="font-size:11px;color:#666;">{item.tamanoAprox} · {item.tipo}</div>
            </div>
            <Show when={descargando() === item.id} fallback={
              <button onClick={() => descargar(item)} disabled={!!descargando()} style="padding:6px 12px;background:#ff6b35;color:#000;border:0;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;">
                Descargar
              </button>
            }>
              <div style="display:flex;flex-direction:column;align-items:flex-end;min-width:120px;">
                <div style="font-size:11px;color:#facc15;">Descargando {progreso().toFixed(0)}%</div>
                <div style="width:120px;height:4px;background:#222;border-radius:2px;margin-top:4px;">
                  <div style={`height:100%;background:#ff6b35;border-radius:2px;width:${progreso()}%;transition:width 0.2s;`} />
                </div>
              </div>
            </Show>
          </div>
        )}
      </For>

      <div style="margin-top:16px;text-align:right;">
        <button onClick={() => dialog.close()} style="padding:8px 16px;background:transparent;color:#aaa;border:1px solid #333;border-radius:6px;cursor:pointer;">Cerrar</button>
      </div>
    </div>
  )
}
