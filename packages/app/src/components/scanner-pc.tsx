import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { usePlatform } from "@/context/platform"
import {
  MODELOS_RECOMENDADOS,
  type ModeloLocal,
  modeloRecomendado,
  presupuestoGB,
} from "@/utils/ollama-local"

// Scanner de PC pixelado estilo terminal 8-bit. Fases secuenciales con animación
// visible (no un flash instantáneo): detecta RAM, VRAM, CPU y sugiere el mejor
// modelo local que entra en el equipo. Al terminar, expone el resultado al
// callback `onResultado` — el diálogo padre decide qué hacer (ofrecer descarga,
// abrir el chat, etc.).
export type ResultadoScan = {
  ramGB: number | undefined
  vramGB: number | undefined
  freeRamGB: number | undefined
  cpuCores: number | undefined
  modeloSugerido: ModeloLocal | undefined
}

type Fase = {
  clave: string
  label: string
  duracionMs: number
}

const FASES: Fase[] = [
  { clave: "init", label: "Iniciando scanner", duracionMs: 500 },
  { clave: "ram", label: "Detectando memoria RAM", duracionMs: 900 },
  { clave: "vram", label: "Buscando GPU y VRAM", duracionMs: 900 },
  { clave: "cpu", label: "Contando núcleos de CPU", duracionMs: 700 },
  { clave: "budget", label: "Calculando presupuesto de VRAM", duracionMs: 700 },
  { clave: "model", label: "Eligiendo el modelo óptimo", duracionMs: 800 },
  { clave: "done", label: "Listo", duracionMs: 400 },
]

const TOTAL_MS = FASES.reduce((s, f) => s + f.duracionMs, 0)
const CELDAS = 24 // "bytes" pixel de la barra de progreso

export function ScannerPC(props: { onResultado?: (r: ResultadoScan) => void; onCerrar?: () => void }) {
  const platform = usePlatform()
  const [faseIdx, setFaseIdx] = createSignal(0)
  const [progreso, setProgreso] = createSignal(0) // 0..1
  const [resultado, setResultado] = createSignal<ResultadoScan | undefined>()
  const [logs, setLogs] = createSignal<string[]>([])
  const [tickPulse, setTickPulse] = createSignal(0)

  let cancelado = false
  const pushLog = (s: string) => setLogs((prev) => [...prev.slice(-8), s])

  // Ejecuta cada fase con delay visible y actualiza logs con lo real que descubre.
  const correr = async () => {
    // Kick-off del hardware YA — antes iba en race dentro del loop y si tardaba
    // >50ms se perdían los logs de esa fase. Ahora se resuelve una única vez y
    // los datos están disponibles a partir de cuando lleguen; las fases dibujan
    // el log solo cuando el dato existe.
    let hw: { ramGB?: number; vramGB?: number | null; freeRamGB?: number; cpuCores?: number } | undefined
    void (platform.analyzeHardware?.().catch(() => undefined) ?? Promise.resolve(undefined)).then((v) => {
      hw = v as typeof hw
    })

    let acumulado = 0
    for (let i = 0; i < FASES.length; i++) {
      if (cancelado) return
      setFaseIdx(i)
      const fase = FASES[i]
      pushLog(`▶ ${fase.label}...`)
      // Animar el progreso dentro de la fase (~30 fps)
      const inicio = Date.now()
      while (Date.now() - inicio < fase.duracionMs) {
        if (cancelado) return
        const t = (Date.now() - inicio) / fase.duracionMs
        setProgreso((acumulado + t * fase.duracionMs) / TOTAL_MS)
        await new Promise((r) => setTimeout(r, 33))
      }
      acumulado += fase.duracionMs

      // Al final de cada fase, dibujamos el log correspondiente si el HW ya está.
      if (hw && !cancelado) {
        const _ram = hw.ramGB ?? 0
        const _vram = hw.vramGB ?? null
        const _free = hw.freeRamGB
        if (fase.clave === "ram") pushLog(`  → RAM total: ${_ram.toFixed(1)} GB`)
        if (fase.clave === "vram") pushLog(`  → VRAM detectada: ${_vram ? `${_vram.toFixed(1)} GB` : "no dedicada"}`)
        if (fase.clave === "cpu") pushLog(`  → Núcleos: ${hw.cpuCores ?? "—"}`)
        if (fase.clave === "budget") pushLog(`  → Presupuesto: ${presupuestoGB(_ram, _vram, _free).toFixed(1)} GB`)
        if (fase.clave === "model") {
          const m = modeloRecomendado(presupuestoGB(_ram, _vram, _free))
          pushLog(`  → Recomendado: ${m?.id ?? "sin sugerencia"}`)
        }
      } else if (!hw && fase.clave === "model" && !cancelado) {
        // El HW no llegó a tiempo: avisamos con un log honesto en vez de vacío.
        pushLog("  → No pudimos leer el hardware. Podés continuar sin escaneo.")
      }
    }

    setProgreso(1)
    if (cancelado) return
    const r: ResultadoScan = {
      ramGB: hw?.ramGB,
      vramGB: hw?.vramGB ?? undefined,
      freeRamGB: hw?.freeRamGB,
      cpuCores: hw?.cpuCores,
      modeloSugerido: hw
        ? modeloRecomendado(presupuestoGB(hw.ramGB ?? 0, hw.vramGB ?? null, hw.freeRamGB))
        : undefined,
    }
    setResultado(r)
    props.onResultado?.(r)
    pushLog(hw ? "✔ Scan completado." : "✔ Podés continuar sin escaneo.")
  }

  onMount(() => {
    void correr()
    // Pulso de dot / cursor blinking
    const t = setInterval(() => setTickPulse((n) => n + 1), 400)
    onCleanup(() => clearInterval(t))
  })
  onCleanup(() => {
    cancelado = true
  })

  const celdasRellenas = () => Math.round(progreso() * CELDAS)

  return (
    <div class="flex flex-col gap-4 p-6 font-mono text-[13px] text-v2-text-text-base">
      {/* Header */}
      <div class="flex items-center gap-3">
        <svg width="22" height="22" viewBox="0 0 12 12" shape-rendering="crispEdges" fill="#EC5B2B" aria-hidden="true">
          {[
            [1, 3], [2, 3],
            [1, 4], [2, 4], [3, 4],
            [2, 5], [3, 5], [4, 5],
            [3, 6], [4, 6], [5, 6],
            [4, 7], [5, 7], [6, 7],
            [3, 8], [4, 8], [5, 8],
            [2, 9], [3, 9], [4, 9],
            [1, 10], [2, 10], [3, 10],
            [1, 11], [2, 11],
            [8, 3], [9, 3], [8, 4], [9, 4], [8, 5], [9, 5], [8, 6], [9, 6],
            [8, 7], [9, 7], [8, 8], [9, 8], [8, 9], [9, 9], [8, 10], [9, 10],
            [8, 11], [9, 11],
          ].map(([x, y]) => (
            <rect x={x} y={y} width="1" height="1" />
          ))}
        </svg>
        <div>
          <div class="text-[14px] font-semibold uppercase tracking-[0.2em] text-[#EC5B2B]">SCAN.EXE</div>
          <div class="text-[10.5px] opacity-60">Analizando tu equipo · Buscando el mejor modelo</div>
        </div>
      </div>

      {/* Barra de progreso PIXELADA */}
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-[10px] opacity-70 uppercase tracking-[0.1em]">
          <span>{FASES[faseIdx()]?.label ?? "Listo"}</span>
          <span>{Math.round(progreso() * 100)}%</span>
        </div>
        <div class="flex gap-[2px] rounded border border-v2-border-border-muted p-[3px] bg-black/40">
          <For each={Array.from({ length: CELDAS })}>
            {(_, i) => {
              const rellena = () => i() < celdasRellenas()
              return (
                <div
                  class="flex-1 h-3 transition-colors"
                  style={{
                    background: rellena() ? "#EC5B2B" : "rgba(236,91,43,0.08)",
                    "box-shadow": rellena() ? "0 0 6px rgba(236,91,43,0.5)" : undefined,
                  }}
                />
              )
            }}
          </For>
        </div>
      </div>

      {/* Log estilo terminal */}
      <div class="rounded border border-v2-border-border-muted bg-black/50 p-3 min-h-[190px] max-h-[220px] overflow-y-auto no-scrollbar text-[11.5px] leading-[1.55]">
        <For each={logs()}>
          {(line) => (
            <div class="opacity-90">
              {line}
            </div>
          )}
        </For>
        <Show when={!resultado()}>
          <div class="text-[#EC5B2B] mt-1">
            {"> _"}
            <span style={{ opacity: tickPulse() % 2 === 0 ? 1 : 0 }}>█</span>
          </div>
        </Show>
      </div>

      {/* Resultado final */}
      <Show when={resultado()}>
        {(r) => (
          <div
            class="rounded border p-3 flex flex-col gap-2"
            style={{ "border-color": "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.05)" }}
          >
            <div class="flex items-center gap-2 text-[12px] font-semibold text-[#22c55e]">
              <span>[ RESULTADO ]</span>
            </div>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-[11.5px]">
              <StatLinea label="RAM total" valor={r().ramGB ? `${r().ramGB!.toFixed(1)} GB` : "—"} />
              <StatLinea label="VRAM GPU" valor={r().vramGB ? `${r().vramGB!.toFixed(1)} GB` : "no dedicada"} />
              <StatLinea label="Núcleos" valor={r().cpuCores ? String(r().cpuCores) : "—"} />
              <StatLinea
                label="Modelo óptimo"
                valor={r().modeloSugerido?.id ?? "sin sugerencia"}
                acento
              />
            </div>
            <Show when={r().modeloSugerido}>
              {(m) => (
                <div class="text-[10.5px] opacity-70 mt-1">
                  {m().tam} — {m().nota}
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>

      {/* Cerrar */}
      <Show when={resultado() && props.onCerrar}>
        <div class="flex justify-end">
          <button
            type="button"
            onClick={props.onCerrar}
            class="rounded-md bg-[#EC5B2B] px-4 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          >
            Continuar
          </button>
        </div>
      </Show>
    </div>
  )
}

function StatLinea(props: { label: string; valor: string; acento?: boolean }) {
  return (
    <div class="flex items-center gap-2">
      <span class="opacity-60 uppercase tracking-wider text-[10px] min-w-[70px]">{props.label}</span>
      <span
        class="font-semibold"
        style={{ color: props.acento ? "#EC5B2B" : undefined }}
      >
        {props.valor}
      </span>
    </div>
  )
}

// helper reservado para futuro uso — el catálogo actual expone `nota` y `tam`.
void MODELOS_RECOMENDADOS
