import { createSignal, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"

// Dialog Sandbox — corre código en child_process aislado (env whitelist, timeout).
// Consume /v2/sandbox del zenkai-router.

type SandboxResult = {
  ok: boolean
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  duracionMs: number
  timeout: boolean
}

export function DialogSandbox() {
  const dialog = useDialog()
  const [lenguaje, setLenguaje] = createSignal<"node" | "python" | "bash">("node")
  const [codigo, setCodigo] = createSignal('console.log("hola desde sandbox")')
  const [timeoutMs, setTimeoutMs] = createSignal(10_000)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const [r, setR] = createSignal<SandboxResult | undefined>()

  const correr = async () => {
    setError(undefined)
    setR(undefined)
    setLoading(true)
    try {
      const res = await fetch("/v2/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lenguaje: lenguaje(), codigo: codigo(), timeoutMs: timeoutMs() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setR((await res.json()) as SandboxResult)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style="padding:20px;max-width:720px;">
      <h2 style="margin:0 0 8px;">Cognitive Sandbox</h2>
      <p style="margin:0 0 12px;color:#888;font-size:13px;">
        Ejecuta código aislado en child_process. Env whitelist, timeout duro, sin shell.
      </p>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <select
          value={lenguaje()}
          onChange={(e) => setLenguaje(e.currentTarget.value as "node" | "python" | "bash")}
          style="padding:8px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:6px;"
        >
          <option value="node">Node.js</option>
          <option value="python">Python</option>
          <option value="bash">Bash</option>
        </select>
        <input
          type="number"
          value={timeoutMs()}
          min="1000"
          max="120000"
          onInput={(e) => setTimeoutMs(Number(e.currentTarget.value))}
          style="width:100px;padding:8px;background:#1a1a1a;color:#fff;border:1px solid #333;border-radius:6px;"
        />
        <span style="align-self:center;font-size:12px;color:#888;">ms timeout</span>
      </div>
      <textarea
        value={codigo()}
        onInput={(e) => setCodigo(e.currentTarget.value)}
        rows="8"
        style="width:100%;padding:8px;background:#050505;color:#e4e4e4;border:1px solid #333;border-radius:6px;margin-bottom:12px;font-family:monospace;font-size:13px;"
      />
      <div style="display:flex;gap:8px;">
        <button
          disabled={loading() || !codigo()}
          onClick={correr}
          style="padding:8px 16px;background:#ff6b35;color:#000;border:0;border-radius:6px;cursor:pointer;font-weight:600;"
        >
          {loading() ? "Ejecutando…" : "Correr"}
        </button>
        <button
          onClick={() => dialog.close()}
          style="padding:8px 16px;background:transparent;color:#aaa;border:1px solid #333;border-radius:6px;cursor:pointer;"
        >
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
          <div style="margin-top:16px;">
            <div style={`padding:8px 12px;border-radius:6px;margin-bottom:8px;background:${rr().ok ? "#0f2a10" : "#3a1010"};color:${rr().ok ? "#4ade80" : "#f87171"};font-weight:600;font-size:13px;`}>
              {rr().ok ? "✓ OK" : "✗ FALLÓ"} · exit {rr().exitCode} · {rr().duracionMs}ms{rr().timeout ? " · TIMEOUT" : ""}
            </div>
            <Show when={rr().stdout}>
              <div style="font-size:12px;color:#aaa;margin-bottom:4px;">stdout:</div>
              <pre style="margin:0 0 8px;padding:8px;background:#050505;color:#c0c0c0;border-radius:4px;font-size:12px;max-height:200px;overflow:auto;">{rr().stdout}</pre>
            </Show>
            <Show when={rr().stderr}>
              <div style="font-size:12px;color:#f87171;margin-bottom:4px;">stderr:</div>
              <pre style="margin:0;padding:8px;background:#050505;color:#ff8a8a;border-radius:4px;font-size:12px;max-height:200px;overflow:auto;">{rr().stderr}</pre>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}
