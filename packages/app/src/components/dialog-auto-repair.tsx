import { createSignal, For, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Dialog auto-repair — corre `bash test → si falla → LLM propone fix → aplica → retest`
// vía /v2/repair. Muestra el log de intentos en tiempo real.

type Intento = { comando: string; exitCode: number | null; salida: string; hipotesis?: string; fixError?: string }
type Resultado = { ok: boolean; intentos: Intento[] }

export function DialogAutoRepair() {
  const dialog = useDialog()
  const [cmd, setCmd] = createSignal("bun test")
  const [modelo, setModelo] = createSignal("qwen2.5:7b")
  const [maxIntentos, setMaxIntentos] = createSignal(3)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const [r, setR] = createSignal<Resultado | undefined>()

  const correr = async () => {
    setError(undefined)
    setR(undefined)
    setLoading(true)
    try {
      const res = await fetch("/v2/repair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ testCmd: cmd(), modelo: modelo(), maxIntentos: maxIntentos() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`)
      setR((await res.json()) as Resultado)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style="padding:20px;max-width:720px;">
      <h2 style="margin:0 0 8px;">Auto-repair loop</h2>
      <p style="margin:0 0 12px;color:#888;font-size:13px;">
        Corre el test. Si falla, propone un fix con LLM, lo aplica, y retesta hasta pasar o agotar intentos.
      </p>

      <div style="display:grid;grid-template-columns:2fr 1fr 80px;gap:8px;margin-bottom:12px;">
        <input
          value={cmd()}
          onInput={(e) => setCmd(e.currentTarget.value)}
          placeholder="bun test / npm test / pytest"
          style="padding:8px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:6px;"
        />
        <input
          value={modelo()}
          onInput={(e) => setModelo(e.currentTarget.value)}
          placeholder="modelo"
          style="padding:8px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:6px;"
        />
        <input
          type="number"
          value={maxIntentos()}
          min="1"
          max="10"
          onInput={(e) => setMaxIntentos(Number(e.currentTarget.value))}
          style="padding:8px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:6px;"
        />
      </div>

      <div style="display:flex;gap:8px;">
        <button
          disabled={loading() || !cmd()}
          onClick={correr}
          style="padding:8px 16px;background:#ff6b35;color:#000;border:0;border-radius:6px;cursor:pointer;font-weight:600;"
        >
          {loading() ? "Reparando…" : "Correr auto-repair"}
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

      <Show when={r()}>
        {(rr) => (
          <div style="margin-top:20px;">
            <div style={`padding:10px;border-radius:6px;margin-bottom:12px;background:${rr().ok ? "#0f2a10" : "#3a1010"};color:${rr().ok ? "#4ade80" : "#ff8a8a"};font-weight:600;`}>
              {rr().ok ? "✓ Test pasó" : "✗ No se logró reparar"} en {rr().intentos.length} intento(s)
            </div>
            <For each={rr().intentos}>
              {(it, i) => (
                <div style="margin-bottom:10px;padding:10px;background:#0f0f0f;border:1px solid #222;border-radius:6px;">
                  <div style="display:flex;justify-content:space-between;font-size:12px;color:#888;margin-bottom:6px;">
                    <span>Intento {i() + 1}</span>
                    <span style={`color:${it.exitCode === 0 ? "#4ade80" : "#f87171"};`}>exit {it.exitCode}</span>
                  </div>
                  <Show when={it.hipotesis}>
                    <div style="font-size:12px;color:#aaa;margin-bottom:6px;">
                      <strong>Hipótesis:</strong> {it.hipotesis}
                    </div>
                  </Show>
                  <Show when={it.fixError}>
                    <div style="font-size:12px;color:#ff8a8a;margin-bottom:6px;">Error aplicando fix: {it.fixError}</div>
                  </Show>
                  <pre style="margin:0;padding:8px;background:#050505;color:#c0c0c0;border-radius:4px;font-size:11px;max-height:180px;overflow:auto;">{it.salida.slice(0, 2000)}</pre>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  )
}
