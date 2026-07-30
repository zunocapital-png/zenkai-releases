import { createSignal, onMount, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform } from "@/context/platform"
import type { HardwareInfo } from "@/context/platform"
import { useQueryClient } from "@tanstack/solid-query"
import {
  CATALOGO_LOCAL,
  CATEGORIAS,
  type Descarga,
  type ModeloLocal,
  listarModelosOllama,
  estaInstalado,
  descargarModeloOllama,
  ramAproxGB,
  advertenciaPc,
  presupuestoGB,
  entraEnPc,
  modeloRecomendado,
} from "@/utils/ollama-local"

// Panel de diagnóstico: chequea que todo esté conectado y lo muestra en español.
type Estado = "ok" | "warn" | "error" | "loading"

const ICONO: Record<Estado, string> = {
  ok: "✅",
  warn: "⚠️",
  error: "❌",
  loading: "⏳",
}

const COLOR: Record<Estado, string> = {
  ok: "text-green-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  loading: "text-text-muted",
}

function Fila(props: { estado: Estado; titulo: string; detalle?: string; children?: any }) {
  return (
    <div class="flex flex-col gap-1.5 rounded-lg border border-border-base bg-surface-raised p-4">
      <div class="flex items-center gap-2.5">
        <span class={`text-16-medium ${COLOR[props.estado]}`}>{ICONO[props.estado]}</span>
        <span class="text-14-medium text-text-strong">{props.titulo}</span>
      </div>
      <Show when={props.detalle}>
        <p class="pl-[26px] text-13-regular text-text-muted">{props.detalle}</p>
      </Show>
      <Show when={props.children}>
        <div class="pl-[26px]">{props.children}</div>
      </Show>
    </div>
  )
}

async function pingJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function DialogDiagnostico() {
  const serverSDK = useServerSDK()
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const [hw, setHw] = createSignal<HardwareInfo | undefined>(undefined)
  const [analizando, setAnalizando] = createSignal(false)
  const [controlPc, setControlPc] = createSignal(false)

  onMount(() => void platform.computerUseGet?.().then((v) => setControlPc(!!v)))
  async function toggleControlPc() {
    const next = !controlPc()
    const res = await platform.computerUseSet?.(next)
    setControlPc(!!res)
  }

  async function analizarPc() {
    if (!platform.analyzeHardware) return
    setAnalizando(true)
    try {
      setHw(await platform.analyzeHardware())
    } catch {
      /* best-effort: si falla, no mostramos nada */
    } finally {
      setAnalizando(false)
    }
  }
  const presupuesto = () => {
    const h = hw()
    return h ? presupuestoGB(h.ramGB, h.vramGB) : undefined
  }
  const [ollama, setOllama] = createSignal<Estado>("loading")
  const [modelosOllama, setModelosOllama] = createSignal<string[]>([])
  const [auto, setAuto] = createSignal<Estado>("loading")
  const [modelosAuto, setModelosAuto] = createSignal<string[]>([])
  const [chequeando, setChequeando] = createSignal(false)
  const [descargas, setDescargas] = createSignal<Record<string, Descarga>>({})
  const [customTag, setCustomTag] = createSignal("")
  const [customActivo, setCustomActivo] = createSignal<string | undefined>(undefined)
  const ramGB = ramAproxGB()

  const instalado = (id: string) => estaInstalado(id, modelosOllama())

  // Tras bajar un modelo, forzamos al servidor a reconstruir su lista de providers
  // (dispose de la instancia) y refrescamos la query, para que el modelo aparezca en
  // el selector sin reiniciar ZENKAI.
  async function sincronizarConZenkai() {
    try {
      await serverSDK().client.global.dispose()
    } catch {
      /* si falla, igual aparece al reiniciar la app */
    }
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === serverSDK().scope && q.queryKey[2] === "providers",
    })
  }

  async function descargar(id: string) {
    try {
      await descargarModeloOllama(id, (d) => setDescargas((prev) => ({ ...prev, [id]: d })))
      void check()
      void sincronizarConZenkai()
    } catch (e) {
      setDescargas((prev) => ({
        ...prev,
        [id]: { pct: -1, estado: "Error", error: e instanceof Error ? e.message : "No se pudo descargar." },
      }))
    }
  }

  // Descargar cualquier modelo por nombre (tag de Ollama), aunque no esté en el catálogo.
  function descargarCustom() {
    const tag = customTag().trim()
    if (!tag) return
    setCustomActivo(tag)
    setCustomTag("")
    void descargar(tag)
  }

  // Barra de progreso reutilizable.
  const barraProgreso = (d: () => Descarga | undefined) => (
    <Show when={d()}>
      <div class="flex flex-col gap-1">
        <Show when={d()!.pct !== -1} fallback={<span class="text-12-regular text-red-400">{d()!.error}</span>}>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-border-base">
            <div class="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${Math.max(2, d()!.pct)}%` }} />
          </div>
          <span class="text-12-regular text-text-muted">
            {d()!.estado} {d()!.pct > 0 ? `· ${d()!.pct}%` : ""}
          </span>
        </Show>
      </div>
    </Show>
  )

  // Fila de un modelo del catálogo: nombre, nota, tamaño, botón y progreso.
  const filaModelo = (m: ModeloLocal) => {
    const d = () => descargas()[m.id]
    return (
      <div class="flex flex-col gap-1.5 rounded-md border border-border-base bg-surface-base p-3">
        <div class="flex items-center gap-3">
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="text-13-medium text-text-strong">{m.nombre}</span>
            <span class="text-12-regular text-text-muted">
              {m.nota} · {m.tam}
            </span>
          </div>
          <Show
            when={!instalado(m.id)}
            fallback={<span class="shrink-0 text-13-medium text-green-400">✅ Instalado</span>}
          >
            <button
              type="button"
              disabled={!!d() && d()!.pct >= 0 && d()!.pct < 100}
              onClick={() => void descargar(m.id)}
              class="shrink-0 rounded-md border border-border-base bg-surface-raised px-3 py-1.5 text-12-medium text-text-strong hover:bg-surface-hover disabled:opacity-50"
            >
              {d() ? (d()!.pct === -1 ? "Reintentar" : "Descargando…") : "Descargar"}
            </button>
          </Show>
        </div>
        <Show when={!instalado(m.id)}>
          <Show
            when={presupuesto() !== undefined}
            fallback={
              <Show when={advertenciaPc(m.tam, ramGB)}>
                <span class="text-11-regular text-yellow-400">⚠️ {advertenciaPc(m.tam, ramGB)}</span>
              </Show>
            }
          >
            <Show
              when={entraEnPc(m.tam, presupuesto()!)}
              fallback={<span class="text-11-regular text-yellow-400">⚠️ Puede exigir tu PC</span>}
            >
              <span class="text-11-regular text-green-400">✅ Le entra a tu PC</span>
            </Show>
          </Show>
        </Show>
        <Show when={!instalado(m.id)}>{barraProgreso(d)}</Show>
      </div>
    )
  }

  async function check() {
    setChequeando(true)
    setOllama("loading")
    setAuto("loading")
    setModelosOllama([])

    const [tags, models] = await Promise.all([
      pingJson("http://localhost:11434/api/tags"),
      pingJson("http://localhost:20128/v1/models"),
    ])

    if (tags) {
      const nombres = Array.isArray(tags?.models)
        ? tags.models.map((m: any) => m?.name).filter((n: any): n is string => typeof n === "string")
        : []
      setModelosOllama(nombres)
      setOllama("ok")
    } else {
      setOllama("error")
    }

    if (models && Array.isArray(models.data)) {
      setModelosAuto(
        models.data.map((m: any) => m?.id).filter((id: any): id is string => typeof id === "string"),
      )
    } else {
      setModelosAuto([])
    }
    setAuto(models ? "ok" : "warn")
    setChequeando(false)
  }

  onMount(() => void check())

  return (
    <Dialog
      size="large"
      title="Diagnóstico del sistema"
      class="w-[min(calc(100vw-40px),640px)] h-[min(calc(100vh-40px),560px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-4 overflow-y-auto p-6 text-14-regular text-text-base">
        <p class="text-13-regular text-text-muted">
          Estado de las conexiones de ZENKAI. Verde = todo bien, amarillo = opcional o limitado, rojo = no disponible.
        </p>

        {/* 1. Ollama */}
        <Fila
          estado={ollama()}
          titulo={
            ollama() === "ok"
              ? "Ollama corriendo"
              : ollama() === "loading"
                ? "Ollama · chequeando…"
                : "Ollama apagado o no instalado"
          }
          detalle={
            ollama() === "error" ? "ZENKAI intenta instalarlo/prenderlo solo al abrir." : undefined
          }
        >
          <Show when={ollama() === "ok"}>
            <Show
              when={modelosOllama().length > 0}
              fallback={<span class="text-13-regular text-text-muted">Sin modelos descargados todavía.</span>}
            >
              <ul class="flex flex-col gap-1">
                <For each={modelosOllama()}>
                  {(m) => <li class="font-mono text-13-regular text-text-base">{m}</li>}
                </For>
              </ul>
            </Show>
          </Show>
        </Fila>

        {/* 1.b Descargar modelos locales (solo si Ollama corre) */}
        <Show when={ollama() === "ok"}>
          <div class="flex flex-col gap-3 rounded-lg border border-border-base bg-surface-raised p-4">
            <div class="flex items-center gap-2.5">
              <span class="text-16-medium">📦</span>
              <span class="text-14-medium text-text-strong">Descargar modelos locales</span>
            </div>
            <p class="pl-[26px] text-13-regular text-text-muted">
              Gratis, corren en tu PC sin internet ni API. Un click y se descarga y queda listo en ZENKAI.
            </p>

            {/* Analizar la PC para recomendar el mejor modelo que le entra */}
            <Show when={platform.analyzeHardware}>
              <div class="ml-[26px] flex flex-col gap-2 rounded-md border border-border-base bg-surface-base p-3">
                <Show
                  when={hw()}
                  fallback={
                    <div class="flex items-center justify-between gap-3">
                      <span class="text-13-regular text-text-muted">
                        ¿No sabés cuál elegir? Analizo tu PC y te digo el mejor que te corre.
                      </span>
                      <button
                        type="button"
                        disabled={analizando()}
                        onClick={() => void analizarPc()}
                        class="shrink-0 rounded-md bg-orange-500 px-3 py-1.5 text-12-medium text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        {analizando() ? "Analizando…" : "🖥️ Analizar mi PC"}
                      </button>
                    </div>
                  }
                >
                  {(h) => {
                    const rec = () => modeloRecomendado(presupuesto() ?? 0)
                    return (
                      <div class="flex flex-col gap-2">
                        <div class="flex flex-col gap-0.5 text-12-regular text-text-muted">
                          <span>
                            🧠 RAM: <span class="text-text-strong">{h().ramGB} GB</span> · ⚙️ CPU:{" "}
                            <span class="text-text-strong">{h().cpuCores} núcleos</span>
                          </span>
                          <span>
                            🎮 GPU:{" "}
                            <span class="text-text-strong">
                              {h().gpuName ?? "no detectada"}
                              {h().vramGB ? ` · ${h().vramGB} GB VRAM` : ""}
                            </span>
                          </span>
                        </div>
                        <div class="flex items-center justify-between gap-3 rounded-md bg-surface-raised p-2.5">
                          <div class="flex min-w-0 flex-col">
                            <span class="text-12-regular text-text-muted">Recomendado para tu PC:</span>
                            <span class="text-13-medium text-green-400">
                              ✅ {rec().nombre} · {rec().tam}
                            </span>
                          </div>
                          <Show
                            when={!instalado(rec().id)}
                            fallback={<span class="shrink-0 text-12-medium text-green-400">Ya instalado</span>}
                          >
                            <button
                              type="button"
                              onClick={() => void descargar(rec().id)}
                              class="shrink-0 rounded-md bg-orange-500 px-3 py-1.5 text-12-medium text-white hover:bg-orange-600"
                            >
                              Descargar
                            </button>
                          </Show>
                        </div>
                      </div>
                    )
                  }}
                </Show>
              </div>
            </Show>

            {/* Descargar cualquier modelo por nombre (cubre todo el catálogo de Ollama) */}
            <div class="flex flex-col gap-1.5 pl-[26px]">
              <span class="text-12-medium text-text-strong">¿Sabés el nombre? Descargá cualquiera</span>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  value={customTag()}
                  onInput={(e) => setCustomTag(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") descargarCustom()
                  }}
                  placeholder="ej: llama3.3:70b, phi4, gemma3:12b…"
                  class="min-w-0 flex-1 rounded-md border border-border-base bg-surface-base px-3 py-1.5 text-13-regular text-text-strong placeholder:text-text-muted focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!customTag().trim()}
                  onClick={() => descargarCustom()}
                  class="shrink-0 rounded-md bg-orange-500 px-3 py-1.5 text-12-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  Descargar
                </button>
              </div>
              <span class="text-11-regular text-text-muted">
                Catálogo completo en ollama.com/library — pegá el nombre exacto del modelo.
              </span>
              <Show when={customActivo()}>
                <div class="flex flex-col gap-1 rounded-md border border-border-base bg-surface-base p-3">
                  <span class="font-mono text-12-regular text-text-strong">{customActivo()}</span>
                  {barraProgreso(() => descargas()[customActivo()!])}
                </div>
              </Show>
            </div>

            {/* Catálogo curado por categoría */}
            <For each={CATEGORIAS}>
              {(cat) => {
                const modelos = CATALOGO_LOCAL.filter((m) => m.categoria === cat.id)
                return (
                  <Show when={modelos.length > 0}>
                    <div class="flex flex-col gap-2 pl-[26px]">
                      <span class="text-12-medium text-text-strong">
                        {cat.emoji} {cat.label}
                      </span>
                      <div class="flex flex-col gap-2">
                        <For each={modelos}>{(m) => filaModelo(m)}</For>
                      </div>
                    </div>
                  </Show>
                )
              }}
            </For>
          </div>
        </Show>

        {/* 2. ZENKAI Auto */}
        <Fila
          estado={auto()}
          titulo={
            auto() === "ok"
              ? "Auto activo"
              : auto() === "loading"
                ? "ZENKAI Auto · chequeando…"
                : "Auto no disponible"
          }
          detalle={
            auto() === "warn"
              ? "Requiere Node. El motor de relevo no está respondiendo."
              : auto() === "ok"
                ? "Enruta solo entre proveedores gratis y de nube. Elegí 'Auto' o un modelo puntual en el selector."
                : undefined
          }
        >
          <Show when={auto() === "ok" && modelosAuto().length > 0}>
            <div class="flex flex-col gap-1">
              <span class="text-13-regular text-green-400">
                🆓 {modelosAuto().length} modelos disponibles vía Auto (gratis + nube)
              </span>
              <ul class="flex flex-col gap-0.5">
                <For each={modelosAuto().slice(0, 12)}>
                  {(m) => <li class="font-mono text-12-regular text-text-muted">{m}</li>}
                </For>
              </ul>
              <Show when={modelosAuto().length > 12}>
                <span class="text-12-regular text-text-muted">…y {modelosAuto().length - 12} más</span>
              </Show>
            </div>
          </Show>
        </Fila>

        {/* 3. Proveedores de nube */}
        <Fila
          estado="warn"
          titulo="Proveedores de nube"
          detalle="Conectá tus keys con el botón 'Conectar API'. Podés ver los conectados en Ajustes → Proveedores."
        />

        {/* 4. Control de PC (experimental, solo desktop) */}
        <Show when={platform.computerUseSet}>
          <div class="flex flex-col gap-2 rounded-lg border border-border-base bg-surface-raised p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <span class="text-16-medium">🖥️</span>
                <span class="text-14-medium text-text-strong">Control de PC (experimental)</span>
              </div>
              <button
                type="button"
                onClick={() => void toggleControlPc()}
                class="shrink-0 rounded-full px-3 py-1.5 text-12-medium transition-colors"
                classList={{
                  "bg-orange-500 text-white hover:bg-orange-600": controlPc(),
                  "border border-border-base text-text-strong hover:bg-surface-hover": !controlPc(),
                }}
              >
                {controlPc() ? "Activado — Apagar" : "Apagado — Activar"}
              </button>
            </div>
            <p class="pl-[26px] text-12-regular text-text-muted">
              Deja que el modelo vea tu pantalla y mueva mouse/teclado, estilo Claude. ⚠️ Riesgoso: la IA puede hacer
              clic en cualquier cosa. Apagado por defecto; funciona mejor con un modelo de visión potente. Apagar bloquea
              todo al instante.
            </p>
          </div>
        </Show>

        {/* Botón re-chequear */}
        <div class="mt-1 flex justify-end">
          <button
            type="button"
            disabled={chequeando()}
            onClick={() => void check()}
            class="rounded-lg border border-border-base bg-surface-raised px-4 py-2 text-13-medium text-text-strong hover:bg-surface-hover disabled:opacity-50"
          >
            {chequeando() ? "Chequeando…" : "Volver a chequear"}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
