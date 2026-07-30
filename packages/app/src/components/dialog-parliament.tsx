import { createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// AI Parliament / Debate Harness (Tomo IV de la charla). Le mandás la misma
// pregunta a 2 modelos en paralelo, ves ambas respuestas lado a lado y elegís
// la mejor (o dejás que el sub-agente `jurado` decida). Es un consenso mínimo
// pero real — la semilla del "Council" completo.
type RespuestaModelo = {
  modelo: string
  texto: string
  latenciaMs: number
  error?: string
}

// Trae los modelos disponibles (local + auto). Para no filtrar branding de nube
// mostramos "Local" / "Nube" en el selector.
async function listarModelos(): Promise<Array<{ id: string; label: string }>> {
  const out: Array<{ id: string; label: string }> = [
    { id: "auto/coding", label: "ZENKAI Auto · código" },
    { id: "auto/smart", label: "ZENKAI Auto · razonamiento" },
    { id: "auto/fast", label: "ZENKAI Auto · rápido" },
  ]
  try {
    const r = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(1500) })
    if (r.ok) {
      const d = (await r.json()) as { models?: Array<{ name: string; capabilities?: string[] }> }
      const localCon = (d.models ?? []).filter((m) => (m.capabilities ?? []).includes("tools"))
      for (const m of localCon) out.push({ id: m.name, label: `Local · ${m.name}` })
    }
  } catch {
    /* ignore */
  }
  return out
}

// Manda un chat completion NO-streaming al router local. Devuelve el texto y
// la latencia. Simple, sin tools ni streaming — es para comparar respuestas.
async function pedirRespuesta(pregunta: string, modelo: string): Promise<RespuestaModelo> {
  const t0 = Date.now()
  try {
    const r = await fetch("http://localhost:20128/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: "user", content: pregunta }],
        stream: false,
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!r.ok) {
      return { modelo, texto: "", latenciaMs: Date.now() - t0, error: `HTTP ${r.status}` }
    }
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const texto = j.choices?.[0]?.message?.content ?? ""
    return { modelo, texto, latenciaMs: Date.now() - t0 }
  } catch (e) {
    return { modelo, texto: "", latenciaMs: Date.now() - t0, error: (e as Error).message }
  }
}

export function DialogParliament() {
  const dialog = useDialog()
  const [pregunta, setPregunta] = createSignal("")
  const [modeloA, setModeloA] = createSignal("auto/coding")
  const [modeloB, setModeloB] = createSignal("auto/smart")
  const [respuestas, setRespuestas] = createSignal<RespuestaModelo[]>([])
  const [cargando, setCargando] = createSignal(false)
  const [modelos, setModelos] = createSignal<Array<{ id: string; label: string }>>([])
  const [veredicto, setVeredicto] = createSignal<string | undefined>(undefined)

  void listarModelos().then(setModelos)

  const debatir = async () => {
    if (!pregunta().trim() || cargando()) return
    setCargando(true)
    setRespuestas([])
    setVeredicto(undefined)
    // Corren en PARALELO — la gracia del parlamento.
    const [rA, rB] = await Promise.all([
      pedirRespuesta(pregunta(), modeloA()),
      pedirRespuesta(pregunta(), modeloB()),
    ])
    setRespuestas([rA, rB])
    setCargando(false)
  }

  // Jurado local (heurística barata): la respuesta más larga y con más código
  // suele ser la más completa. No es un LLM, es un tie-breaker rápido.
  const votarLocal = () => {
    const [a, b] = respuestas()
    if (!a || !b) return
    const scoreA = (a.texto?.length ?? 0) + ((a.texto?.match(/```/g)?.length ?? 0) * 200)
    const scoreB = (b.texto?.length ?? 0) + ((b.texto?.match(/```/g)?.length ?? 0) * 200)
    if (scoreA === scoreB) setVeredicto("Empate. Elegí vos.")
    else setVeredicto(`Gana ${scoreA > scoreB ? a.modelo : b.modelo} — respuesta más completa (${scoreA > scoreB ? scoreA : scoreB} pts).`)
  }

  return (
    <Dialog
      size="x-large"
      title="AI Parliament · Debate Harness"
      class="w-[min(calc(100vw-40px),1000px)] h-[min(calc(100vh-40px),720px)] min-h-0 overflow-hidden"
    >
      <div class="flex flex-col gap-3 p-4 h-full overflow-hidden text-[13px]">
        {/* Pregunta + selectores */}
        <textarea
          value={pregunta()}
          onInput={(e) => setPregunta(e.currentTarget.value)}
          placeholder="Pregunta o consigna a debatir entre 2 modelos…"
          class="rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2 text-[12.5px] resize-none outline-none focus:border-[#EC5B2B]/60"
          rows="3"
        />
        <div class="flex items-center gap-2">
          <select
            value={modeloA()}
            onChange={(e) => setModeloA(e.currentTarget.value)}
            class="flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2 py-1.5 text-[12px]"
          >
            <For each={modelos()}>{(m) => <option value={m.id}>{m.label}</option>}</For>
          </select>
          <span class="text-[11px] opacity-60 mx-1">vs</span>
          <select
            value={modeloB()}
            onChange={(e) => setModeloB(e.currentTarget.value)}
            class="flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-2 py-1.5 text-[12px]"
          >
            <For each={modelos()}>{(m) => <option value={m.id}>{m.label}</option>}</For>
          </select>
          <button
            type="button"
            onClick={() => void debatir()}
            disabled={cargando() || !pregunta().trim()}
            class="rounded-md bg-[#EC5B2B] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40 disabled:pointer-events-none hover:opacity-90"
          >
            {cargando() ? "Debatiendo…" : "Debatir"}
          </button>
        </div>

        {/* Respuestas lado a lado */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 overflow-hidden">
          <Show when={cargando()}>
            <RespuestaCard modelo={modeloA()} loading />
            <RespuestaCard modelo={modeloB()} loading />
          </Show>
          <For each={respuestas()}>
            {(r) => <RespuestaCard modelo={r.modelo} texto={r.texto} latenciaMs={r.latenciaMs} error={r.error} />}
          </For>
        </div>

        {/* Veredicto local */}
        <Show when={respuestas().length === 2 && !cargando()}>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={votarLocal}
              class="rounded-md border border-[#EC5B2B]/40 bg-[#EC5B2B]/10 px-3 py-1 text-[11.5px] text-[#EC5B2B] hover:bg-[#EC5B2B]/20"
            >
              Voto rápido (jurado local)
            </button>
            <Show when={veredicto()}>
              <span class="text-[11.5px] opacity-85">{veredicto()}</span>
            </Show>
            <button
              type="button"
              onClick={() => dialog.close()}
              class="ml-auto rounded-md bg-[#EC5B2B] px-3 py-1 text-[11.5px] text-white hover:opacity-90"
            >
              Cerrar
            </button>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}

function RespuestaCard(props: { modelo: string; texto?: string; latenciaMs?: number; error?: string; loading?: boolean }) {
  return (
    <div class="flex flex-col gap-1 rounded-md border border-v2-border-border-muted overflow-hidden">
      <div class="flex items-center gap-2 bg-v2-background-bg-layer-01 px-3 py-1.5 border-b border-v2-border-border-muted">
        <span class="text-[10.5px] uppercase tracking-wider font-semibold text-[#EC5B2B]">{props.modelo}</span>
        <Show when={props.latenciaMs}>
          <span class="ml-auto text-[10px] opacity-60">{Math.round(props.latenciaMs! / 100) / 10}s</span>
        </Show>
      </div>
      <div class="flex-1 overflow-y-auto p-3 text-[12px] leading-relaxed">
        <Show
          when={!props.loading}
          fallback={
            <div class="opacity-60 text-[11px] font-mono">
              <span class="animate-pulse">▓▒░ pensando…</span>
            </div>
          }
        >
          <Show when={props.error} fallback={<pre class="whitespace-pre-wrap font-sans">{props.texto}</pre>}>
            <div class="text-[11px] text-[#ef4444]">Error: {props.error}</div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
