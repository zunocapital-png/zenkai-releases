import { createSignal, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Dialog del Reflector — muestra el veredicto de un sub-agente que re-lee
// la última respuesta del assistant. Consume /v2/reflect del zenkai-router.

type Veredicto = {
  puntaje: number
  problemasDetectados: boolean
  problemas: string[]
  sugerencia?: string
  respuestaMejorada?: string
  modeloReflector: string
  latencyMs: number
}

export function DialogReflector() {
  const dialog = useDialog()
  const [pregunta, setPregunta] = createSignal("")
  const [respuesta, setRespuesta] = createSignal("")
  const [modelo, setModelo] = createSignal("qwen2.5:7b")
  const [mejorar, setMejorar] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const [v, setV] = createSignal<Veredicto | undefined>()

  const correr = async () => {
    setError(undefined)
    setV(undefined)
    setLoading(true)
    try {
      const res = await fetch("/v2/reflect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pregunta: pregunta(),
          respuesta: respuesta(),
          modelo: modelo(),
          mejorar: mejorar(),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`)
      setV((await res.json()) as Veredicto)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style="padding:20px;max-width:640px;">
      <h2 style="margin:0 0 8px;">Reflector cognitivo</h2>
      <p style="margin:0 0 12px;color:#888;font-size:13px;">
        Re-lee la respuesta con otro modelo. Detecta errores, puntúa, sugiere mejora.
      </p>

      <label style="display:block;margin-bottom:8px;font-size:12px;color:#aaa;">Pregunta original</label>
      <textarea
        value={pregunta()}
        onInput={(e) => setPregunta(e.currentTarget.value)}
        rows="2"
        style="width:100%;padding:8px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:6px;margin-bottom:12px;font-family:inherit;"
      />

      <label style="display:block;margin-bottom:8px;font-size:12px;color:#aaa;">Respuesta a evaluar</label>
      <textarea
        value={respuesta()}
        onInput={(e) => setRespuesta(e.currentTarget.value)}
        rows="6"
        style="width:100%;padding:8px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:6px;margin-bottom:12px;font-family:inherit;"
      />

      <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
        <label style="font-size:12px;color:#aaa;">Modelo reflector</label>
        <input
          value={modelo()}
          onInput={(e) => setModelo(e.currentTarget.value)}
          style="flex:1;padding:6px 8px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:6px;"
        />
        <label style="font-size:12px;color:#aaa;display:flex;gap:6px;align-items:center;">
          <input type="checkbox" checked={mejorar()} onChange={(e) => setMejorar(e.currentTarget.checked)} />
          Reescribir
        </label>
      </div>

      <div style="display:flex;gap:8px;">
        <button
          disabled={loading() || !pregunta() || !respuesta()}
          onClick={correr}
          style="padding:8px 16px;background:#ff6b35;color:#000;border:0;border-radius:6px;cursor:pointer;font-weight:600;"
        >
          {loading() ? "Reflexionando…" : "Reflexionar"}
        </button>
        <button onClick={() => dialog.close()} style="padding:8px 16px;background:transparent;color:#aaa;border:1px solid #333;border-radius:6px;cursor:pointer;">
          Cerrar
        </button>
      </div>

      <Show when={error()}>
        <div style="margin-top:16px;padding:12px;background:#3a1010;color:#ff8a8a;border-radius:6px;font-size:13px;">
          Error: {error()}
        </div>
      </Show>

      <Show when={v()}>
        {(vv) => (
          <div style="margin-top:20px;padding:16px;background:#0f0f0f;border:1px solid #222;border-radius:8px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <div>
                <span style="font-size:12px;color:#888;">Puntaje</span>
                <div style={`font-size:28px;font-weight:700;color:${vv().puntaje >= 7 ? "#4ade80" : vv().puntaje >= 4 ? "#facc15" : "#f87171"};`}>
                  {vv().puntaje}/10
                </div>
              </div>
              <div style="text-align:right;font-size:11px;color:#666;">
                <div>{vv().modeloReflector}</div>
                <div>{vv().latencyMs} ms</div>
              </div>
            </div>
            <Show when={vv().problemas.length > 0}>
              <div style="margin-bottom:12px;">
                <div style="font-size:12px;color:#aaa;margin-bottom:6px;">Problemas detectados:</div>
                <ul style="margin:0;padding-left:20px;color:#e4e4e4;font-size:13px;">
                  {vv().problemas.map((p) => (
                    <li>{p}</li>
                  ))}
                </ul>
              </div>
            </Show>
            <Show when={vv().sugerencia}>
              <div style="margin-bottom:12px;">
                <div style="font-size:12px;color:#aaa;margin-bottom:6px;">Sugerencia:</div>
                <div style="color:#e4e4e4;font-size:13px;">{vv().sugerencia}</div>
              </div>
            </Show>
            <Show when={vv().respuestaMejorada}>
              <div>
                <div style="font-size:12px;color:#aaa;margin-bottom:6px;">Respuesta mejorada:</div>
                <div style="color:#e4e4e4;font-size:13px;white-space:pre-wrap;background:#1a1a1a;padding:10px;border-radius:6px;">
                  {vv().respuestaMejorada}
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}
