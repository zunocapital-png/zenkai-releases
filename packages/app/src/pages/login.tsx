import { createSignal, onCleanup, onMount, Show } from "solid-js"
import "./login.css"

// Login estilo terminal con Matrix rain de fondo. Pensado para la ruta /login
// cuando el usuario quiera activar cuenta (cloud sync, team). La app SIGUE
// funcionando sin cuenta — el botón "Continuar sin cuenta · modo local"
// respeta la promesa de privacidad total.
//
// Mantiene el mismo lenguaje visual del home (font mono, wordmark ZENKAI,
// panels [ TITLE ], caret ›). Matrix agrega la capa de identidad que el
// usuario pidió intensificar.

export function LoginPage(props: {
  onSubmit?: (creds: { email: string; password: string }) => void
  onSkip?: () => void
  onProvider?: (provider: "github" | "google" | "email-code") => void
}) {
  const [email, setEmail] = createSignal("")
  const [password, setPassword] = createSignal("")
  let canvasRef: HTMLCanvasElement | undefined
  let raf = 0

  onMount(() => {
    if (!canvasRef) return
    const ctx = canvasRef.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄZENKAI01<>{}[]=/\\"
    let width = 0
    let height = 0
    let columns = 0
    let drops: number[] = []
    const fs = 16 * dpr

    const resize = () => {
      if (!canvasRef) return
      width = canvasRef.width = window.innerWidth * dpr
      height = canvasRef.height = window.innerHeight * dpr
      canvasRef.style.width = window.innerWidth + "px"
      canvasRef.style.height = window.innerHeight + "px"
      columns = Math.floor(width / fs)
      drops = new Array(columns).fill(0).map(() => Math.random() * -height)
    }
    resize()
    window.addEventListener("resize", resize)

    const draw = () => {
      // Fade con transparencia para dejar rastro característico.
      ctx.fillStyle = "rgba(10, 10, 10, 0.08)"
      ctx.fillRect(0, 0, width, height)
      ctx.font = fs + "px 'JetBrains Mono', ui-monospace, monospace"
      for (let i = 0; i < columns; i++) {
        const x = i * fs
        const y = drops[i]!
        const glyph = glyphs[Math.floor(Math.random() * glyphs.length)]!
        // 8% de columnas en naranja Zenkai — resto verde clásico.
        const isAccent = (i * 31) % 100 < 8
        const brightness = Math.random() < 0.04 ? 1 : 0.5 + Math.random() * 0.3
        ctx.fillStyle = isAccent
          ? `rgba(236, 91, 43, ${brightness})`
          : `rgba(70, 255, 130, ${brightness * 0.62})`
        ctx.fillText(glyph, x, y)
        drops[i] = y + fs * 0.6
        if (y > height && Math.random() > 0.975) drops[i] = 0
      }
      raf = requestAnimationFrame(draw)
    }
    draw()

    onCleanup(() => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(raf)
    })
  })

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    props.onSubmit?.({ email: email(), password: password() })
  }

  return (
    <div class="zenkai-login">
      <canvas ref={canvasRef} class="zenkai-login-matrix" />
      <div class="zenkai-login-overlay" />
      <div class="zenkai-login-scanlines" />

      <div class="zenkai-login-stage">
        <div class="zenkai-login-container">

          <div class="zenkai-login-header">
            <div class="zenkai-login-logo-mark">
              <div class="core" />
            </div>
            <div class="zenkai-login-wordmark">
              <h1>ZENKAI</h1>
              <div class="subtitle">
                <span class="k">Terminal · IA</span>
                <span class="sep">·</span>
                <span class="m">Local + Nube · Zuno Company</span>
              </div>
            </div>
          </div>

          <form class="zenkai-login-panel" onSubmit={handleSubmit}>
            <span class="label">[ ACCESO ]</span>

            <div class="prompt-block">
              <label class="prompt-line">
                <span class="field-label">Correo</span>
                <div class="input-row">
                  <span class="caret">›</span>
                  <input
                    type="email"
                    autocomplete="email"
                    placeholder="tu@correo.com"
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                  />
                </div>
              </label>

              <label class="prompt-line">
                <span class="field-label">Contraseña</span>
                <div class="input-row">
                  <span class="caret">›</span>
                  <input
                    type="password"
                    autocomplete="current-password"
                    placeholder="••••••••"
                    value={password()}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                  />
                  <span class="blinker" />
                </div>
              </label>
            </div>

            <div class="actions">
              <button type="submit" class="btn-primary">
                <span>▶</span>
                <span>Iniciar sesión</span>
                <span style="opacity:0.6;font-weight:400;">↵</span>
              </button>
              <button type="button" class="btn-secondary" onClick={() => props.onSkip?.()}>
                <span class="arrow">›</span>
                <span>Continuar sin cuenta · modo local</span>
              </button>
            </div>

            <Show when={props.onProvider}>
              <div class="alts">
                <span>o ingresá con:</span>
                <button type="button" class="provider" onClick={() => props.onProvider?.("github")}>
                  <span class="dot" /> GitHub
                </button>
                <button type="button" class="provider" onClick={() => props.onProvider?.("google")}>
                  <span class="dot" /> Google
                </button>
                <button type="button" class="provider" onClick={() => props.onProvider?.("email-code")}>
                  <span class="dot" /> Correo · código
                </button>
              </div>
            </Show>
          </form>

          <div class="zenkai-login-panel panel-muted">
            <span class="label label-plain">[ ESTADO ]</span>
            <div class="status-lines">
              <div class="status-line"><span class="ind ok" /><span class="clave">Router</span><span class="valor">operativo · localhost:20128</span></div>
              <div class="status-line"><span class="ind ok" /><span class="clave">Motor</span><span class="valor">local activo</span></div>
              <div class="status-line"><span class="ind ok" /><span class="clave">Skills</span><span class="valor">8 herramientas integradas</span></div>
              <div class="status-line"><span class="ind warn" /><span class="clave">Cloud</span><span class="valor">sin cuenta · funcionás 100% offline</span></div>
            </div>
          </div>

          <div class="zenkai-login-statusbar">
            <span class="left">
              <span class="dot" />
              <span>todo listo</span>
            </span>
            <span>Zuno Company · Maycol Velazquez</span>
          </div>

        </div>
      </div>
    </div>
  )
}
