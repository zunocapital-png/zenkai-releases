import { createSignal, For, Show, onMount, onCleanup } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"

function formatearBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Ordena: 1. los que pueden correr y son óptimos, 2. los que corren normal,
 * 3. los que no corren (mostrados grises al final). Dentro de cada grupo por
 * potencia desc.
 */
function ordenarCatalogo<T extends { id: string }>(
  catalogo: T[],
  instalados: Array<{ id: string }>,
  diag: { todos: Array<{ modelo: { id: string; potencia?: number }; puedeCorrer: boolean; esOptimo: boolean }> } | undefined,
): T[] {
  const noInstalados = catalogo.filter((c) => !instalados.some((i) => i.id === c.id))
  if (!diag) return noInstalados
  return noInstalados.slice().sort((a, b) => {
    const ra = diag.todos.find((r) => r.modelo.id === a.id)
    const rb = diag.todos.find((r) => r.modelo.id === b.id)
    const bucketA = ra?.esOptimo ? 0 : ra?.puedeCorrer ? 1 : 2
    const bucketB = rb?.esOptimo ? 0 : rb?.puedeCorrer ? 1 : 2
    if (bucketA !== bucketB) return bucketA - bucketB
    return (rb?.modelo.potencia ?? 0) - (ra?.modelo.potencia ?? 0)
  })
}

function pretty(m: { nombre: string }): string {
  const parts = m.nombre.split("(")
  return (parts[0] ?? m.nombre).trim()
}

// Zenkai Engine: reemplaza Ollama. Descarga GGUF, gestiona modelos, carga/descarga.
// Consume /v2/engine/*.

type CatalogoItem = { id: string; nombre: string; bytesAprox?: number; ramMinimaMB?: number; url: string; tipo: string; potencia?: number; ctxMax?: number; descripcion?: string }
type Recomendacion = { modelo: CatalogoItem; puedeCorrer: boolean; motivo: string; velocidadEsperada: string; esOptimo: boolean; esRecomendado: boolean }
type Diagnostico = {
  diagnostico: { perfil: string; memoriaUtilMB: number; tieneGpu: boolean; gpuNombre?: string; vramDisponibleMB: number; ramDisponibleMB: number }
  mensaje: string
  mejorCoding?: Recomendacion
  mejorGeneral?: Recomendacion
  mejorReasoning?: Recomendacion
  todos: Recomendacion[]
}
type ModelEntry = { id: string; nombre: string; path: string; bytes: number; capabilities?: string[]; installedAt: number }
type EngineStatus = { binaryDetectado?: string; cargadosCount: number; maxCargados: number; instancias: Array<{ id: string; puerto: number; requestsActivos: number }> }
type HwSnapshot = { ram: { totalMB: number; libreMB: number; usadoPct: number }; cpu: { cores: number; modelo?: string }; gpu?: { nombre: string; vramTotalMB?: number; vramUsadoMB?: number; utilizacionPct?: number; tempC?: number } }
type BenchInfo = { at: number; tokensPorSegundo: number; primerTokenMs: number }

export function DialogZenkaiEngine() {
  const dialog = useDialog()
  const [status, setStatus] = createSignal<EngineStatus | undefined>()
  const [catalogo, setCatalogo] = createSignal<CatalogoItem[]>([])
  const [instalados, setInstalados] = createSignal<ModelEntry[]>([])
  const [descargando, setDescargando] = createSignal<string | undefined>()
  const [progreso, setProgreso] = createSignal(0)
  const [msg, setMsg] = createSignal<string | undefined>()
  const [hw, setHw] = createSignal<HwSnapshot | undefined>()
  const [benchmarks, setBenchmarks] = createSignal<Record<string, BenchInfo>>({})
  const [diagnostico, setDiagnostico] = createSignal<Diagnostico | undefined>()

  const cargar = async () => {
    try {
      const [s, m, b, h, diag] = await Promise.all([
        fetch("/v2/engine/status").then((r) => r.json()) as Promise<EngineStatus>,
        fetch("/v2/engine/models").then((r) => r.json()) as Promise<{ catalogo: CatalogoItem[]; instalados: ModelEntry[] }>,
        fetch("/v2/engine/benchmarks").then((r) => r.json()) as Promise<Record<string, BenchInfo>>,
        fetch("/v2/hw").then((r) => r.json()) as Promise<HwSnapshot>,
        fetch("/v2/engine/diagnostico").then((r) => r.json()) as Promise<Diagnostico>,
      ])
      setStatus(s)
      setCatalogo(m.catalogo)
      setInstalados(m.instalados)
      setBenchmarks(b)
      setHw(h)
      setDiagnostico(diag)
    } catch (e) {
      setMsg("Error cargando estado del motor: " + String((e as Error).message))
    }
  }

  let es: EventSource | undefined
  onMount(() => {
    void cargar()
    try {
      es = new EventSource("/v2/events")
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
      // Hardware en vivo (RAM/GPU cada 2s desde el backend).
      es.addEventListener("hw.snapshot", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data as string) as { data: HwSnapshot }
          if (data?.data) setHw(data.data)
        } catch { /* ignore */ }
      })
      es.addEventListener("engine.benchmark", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data as string) as { data: { modelId: string; tokensPorSegundo: number; primerTokenMs: number } }
          if (data?.data?.modelId) {
            setBenchmarks((prev) => ({
              ...prev,
              [data.data.modelId]: {
                at: Date.now(),
                tokensPorSegundo: data.data.tokensPorSegundo,
                primerTokenMs: data.data.primerTokenMs,
              },
            }))
          }
        } catch { /* ignore */ }
      })
    } catch { /* SSE no disponible en algunos entornos */ }
  })

  onCleanup(() => {
    try { es?.close() } catch { /* noop */ }
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

      <Show when={diagnostico()}>
        {(diag) => (
          <div style="padding:12px 14px;background:linear-gradient(180deg,rgba(255,107,53,0.08),transparent),#0f0f0f;border:1px solid #2a2a2a;border-left:3px solid #ff6b35;border-radius:5px;margin:16px 0 8px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
              <div style="font-size:12px;color:#ff6b35;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Diagnóstico</div>
              <div style="font-size:11px;color:#aaa;font-family:monospace;">
                {diag().diagnostico.tieneGpu ? `GPU ${(diag().diagnostico.vramDisponibleMB/1024).toFixed(1)} GB` : "sin GPU"} · RAM libre {(diag().diagnostico.ramDisponibleMB/1024).toFixed(1)} GB
              </div>
            </div>
            <div style="color:#e4e4e4;font-size:13px;line-height:1.5;">{diag().mensaje}</div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
              <Show when={diag().mejorCoding}>
                {(m) => <span style="font-size:11px;padding:4px 8px;background:rgba(74,222,128,0.1);color:#4ade80;border:1px solid #4ade8022;border-radius:4px;">💻 mejor coding: {pretty(m().modelo)}</span>}
              </Show>
              <Show when={diag().mejorGeneral}>
                {(m) => <span style="font-size:11px;padding:4px 8px;background:rgba(97,175,239,0.1);color:#61afef;border:1px solid #61afef22;border-radius:4px;">🧠 mejor general: {pretty(m().modelo)}</span>}
              </Show>
              <Show when={diag().mejorReasoning}>
                {(m) => <span style="font-size:11px;padding:4px 8px;background:rgba(198,120,221,0.1);color:#c678dd;border:1px solid #c678dd22;border-radius:4px;">🎯 mejor razona: {pretty(m().modelo)}</span>}
              </Show>
            </div>
          </div>
        )}
      </Show>

      <h3 style="margin:16px 0 8px;font-size:14px;color:#e4e4e4;">Catálogo (ordenado por lo que corre en tu equipo)</h3>
      <For each={ordenarCatalogo(catalogo(), instalados(), diagnostico())}>
        {(item) => {
          const rec = () => diagnostico()?.todos.find((r) => r.modelo.id === item.id)
          const puedeCorrer = () => rec()?.puedeCorrer !== false
          return (
            <div style={`display:flex;align-items:center;padding:10px;background:#0f0f0f;border:1px solid #222;border-left:3px solid ${puedeCorrer() ? (rec()?.esOptimo ? "#4ade80" : "#61afef") : "#f87171"};border-radius:6px;margin-bottom:6px;${puedeCorrer() ? "" : "opacity:0.55;"}`}>
              <div style="flex:1;min-width:0;">
                <div style="color:#e4e4e4;font-weight:600;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
                  <span>{item.nombre}</span>
                  <Show when={rec()?.esOptimo}>
                    <span style="font-size:10px;padding:2px 6px;background:rgba(74,222,128,0.15);color:#4ade80;border-radius:3px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">óptimo</span>
                  </Show>
                </div>
                <div style="font-size:11px;color:#666;margin-top:2px;">
                  {formatearBytes(item.bytesAprox ?? 0)} · pide {((item.ramMinimaMB ?? 0)/1024).toFixed(0)} GB · {item.tipo} · potencia {item.potencia ?? "?"}/10
                </div>
                <Show when={item.descripcion}>
                  <div style="font-size:11px;color:#888;margin-top:2px;line-height:1.5;">{item.descripcion}</div>
                </Show>
                <Show when={rec()?.motivo}>
                  <div style={`font-size:11px;margin-top:3px;color:${puedeCorrer() ? "#999" : "#f87171"};`}>→ {rec()?.motivo}</div>
                </Show>
              </div>
              <Show when={descargando() === item.id} fallback={
                <button
                  onClick={() => descargar(item)}
                  disabled={!!descargando() || !puedeCorrer()}
                  title={puedeCorrer() ? "" : "Tu equipo no tiene RAM/VRAM suficiente"}
                  style={`padding:6px 12px;background:${puedeCorrer() ? "#ff6b35" : "#333"};color:${puedeCorrer() ? "#000" : "#666"};border:0;border-radius:4px;cursor:${puedeCorrer() ? "pointer" : "not-allowed"};font-weight:600;font-size:12px;`}
                >
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
          )
        }}
      </For>

      <div style="margin-top:16px;text-align:right;">
        <button onClick={() => dialog.close()} style="padding:8px 16px;background:transparent;color:#aaa;border:1px solid #333;border-radius:6px;cursor:pointer;">Cerrar</button>
      </div>
    </div>
  )
}
