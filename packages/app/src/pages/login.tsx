import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { ZenkaiLogoMark } from "@/components/zenkai-logo"
import "./login.css"

// Login estilo terminal con Matrix rain naranja + logo idéntico al home
// (Press Start 2P + tracking 0.18em + drop-shadow naranja). Sin email/password.
// Solo código de acceso opaco de 12 chars generado por el backend.
//
// Flujo:
//   Tab "Ingresar código" → 12 casillas pixel + verificar
//   Tab "Generar nuevo"   → POST /v2/auth/crear → muestra 1 sola vez → copiar
//
// Respeta la promesa "modo local funciona sin cuenta": botón secundario
// "Continuar sin cuenta" bypass del login.

const LARGO_CODIGO = 12
const ALFABETO_VALIDO = /[^A-HJ-NP-Z2-9]/g // upper sin 0/1/I/O

export function LoginPage(props: {
  onVerificado?: (info: { id: string; nombre?: string }) => void
  onSkip?: () => void
  /** URL base del router — default localhost:20128. Para tests/mocks. */
  baseUrl?: string
}) {
  const base = () => props.baseUrl ?? ""
  const [tab, setTab] = createSignal<"ingresar" | "solicitar">("ingresar")
  const [chars, setChars] = createSignal<string[]>(new Array(LARGO_CODIGO).fill(""))
  const [error, setError] = createSignal<string | undefined>()
  const [verificando, setVerificando] = createSignal(false)
  const [codigoGenerado, setCodigoGenerado] = createSignal<string | undefined>()
  const [copiado, setCopiado] = createSignal(false)
  const [generando, setGenerando] = createSignal(false)
  let canvasRef: HTMLCanvasElement | undefined
  let raf = 0
  const inputRefs: Array<HTMLInputElement | undefined> = new Array(LARGO_CODIGO)

  onMount(() => {
    if (!canvasRef) return
    const ctx = canvasRef.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄZENKAI0123456789<>{}[]=/\\!@#$%"
    let width = 0, height = 0, columns = 0
    let drops: number[] = []
    const fs = 14 * dpr

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
      // Trail con leve fade (7%) — el rastro naranja queda visible más tiempo.
      ctx.fillStyle = "rgba(5, 5, 5, 0.07)"
      ctx.fillRect(0, 0, width, height)
      ctx.font = fs + "px 'IBM Plex Mono', ui-monospace, monospace"
      for (let i = 0; i < columns; i++) {
        const x = i * fs
        const y = drops[i]!
        const glyph = glyphs[Math.floor(Math.random() * glyphs.length)]!
        // 3 niveles de NARANJA (nada de verde):
        //   bright peak — el "líder" de la columna
        //   medium — mayoría, naranja Zenkai puro
        //   dim — el rastro atrás
        const roll = Math.random()
        if (roll < 0.05) {
          ctx.fillStyle = "rgba(255, 138, 78, 1)"
        } else if (roll < 0.4) {
          const b = 0.6 + Math.random() * 0.25
          ctx.fillStyle = `rgba(236, 91, 43, ${b})`
        } else {
          const b = 0.25 + Math.random() * 0.25
          ctx.fillStyle = `rgba(180, 60, 25, ${b})`
        }
        ctx.fillText(glyph, x, y)
        drops[i] = y + fs * 0.5
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

  const setChar = (i: number, valor: string) => {
    const limpio = valor.toUpperCase().replace(ALFABETO_VALIDO, "").slice(0, 1)
    const arr = [...chars()]
    arr[i] = limpio
    setChars(arr)
    setError(undefined)
    if (limpio && i < LARGO_CODIGO - 1) inputRefs[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: KeyboardEvent) => {
    if (e.key === "Backspace" && !chars()[i] && i > 0) inputRefs[i - 1]?.focus()
    if (e.key === "ArrowLeft" && i > 0) inputRefs[i - 1]?.focus()
    if (e.key === "ArrowRight" && i < LARGO_CODIGO - 1) inputRefs[i + 1]?.focus()
  }

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault()
    const raw = (e.clipboardData?.getData("text") ?? "").toUpperCase().replace(ALFABETO_VALIDO, "")
    const arr: string[] = new Array(LARGO_CODIGO).fill("")
    for (let i = 0; i < Math.min(raw.length, LARGO_CODIGO); i++) arr[i] = raw[i]!
    setChars(arr)
    const nextEmpty = arr.findIndex((c) => !c)
    inputRefs[nextEmpty >= 0 ? nextEmpty : LARGO_CODIGO - 1]?.focus()
  }

  const verificar = async (e: Event) => {
    e.preventDefault()
    const codigo = chars().join("")
    if (codigo.length !== LARGO_CODIGO) {
      setError(`Faltan ${LARGO_CODIGO - codigo.length} caracteres`)
      return
    }
    setVerificando(true)
    setError(undefined)
    try {
      const r = await fetch(`${base()}/v2/auth/verificar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codigo }),
      })
      if (r.ok) {
        const data = (await r.json()) as { ok: true; id: string; nombre?: string }
        props.onVerificado?.({ id: data.id, nombre: data.nombre })
      } else {
        const data = (await r.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? "Código inválido")
      }
    } catch (err) {
      setError("No pude conectar con el router. ¿La app está corriendo?")
    } finally {
      setVerificando(false)
    }
  }

  const generar = async () => {
    setGenerando(true)
    setError(undefined)
    try {
      const r = await fetch(`${base()}/v2/auth/crear`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!r.ok) throw new Error("no se pudo generar")
      const data = (await r.json()) as { codigoClaro: string; id: string }
      setCodigoGenerado(data.codigoClaro)
    } catch (err) {
      setError(String((err as Error).message))
    } finally {
      setGenerando(false)
    }
  }

  const copiarCodigo = async () => {
    const c = codigoGenerado()
    if (!c) return
    try {
      await navigator.clipboard.writeText(c)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* clipboard denied */ }
  }

  return (
    <div class="zenkai-login">
      <canvas ref={canvasRef} class="zenkai-login-matrix" />
      <div class="zenkai-login-overlay" />
      <div class="zenkai-login-scanlines" />
      <div class="zenkai-login-flicker" />

      <div class="zenkai-login-stage">
        <div class="zenkai-login-container">

          {/* Logo idéntico al NewSessionDesignView del home */}
          <div class="zenkai-login-logo-hero">
            <ZenkaiLogoMark size={88} animate />
            <span class="zenkai-login-wordmark">ZENKAI</span>
          </div>

          <div class="zenkai-login-panel">
            <span class="zenkai-login-panel-label">[ ACCESO ]</span>

            <div class="zenkai-login-tabs">
              <button
                type="button"
                class="zenkai-login-tab"
                classList={{ active: tab() === "ingresar" }}
                onClick={() => setTab("ingresar")}
              >
                › Ingresar código
              </button>
              <button
                type="button"
                class="zenkai-login-tab"
                classList={{ active: tab() === "solicitar" }}
                onClick={() => setTab("solicitar")}
              >
                › Generar nuevo
              </button>
            </div>

            <Show when={tab() === "ingresar"}>
              <form class="zenkai-login-view" onSubmit={verificar}>
                <div class="zenkai-login-hint">
                  Escribí tu código de acceso · <span class="k">12 caracteres</span>
                </div>
                <div class="zenkai-login-code-blocks">
                  {chars().map((c, i) => (
                    <>
                      {i === 4 || i === 8 ? <span class="dash">·</span> : null}
                      <input
                        ref={(el) => { inputRefs[i] = el }}
                        maxlength="1"
                        value={c}
                        placeholder="_"
                        onInput={(e) => setChar(i, e.currentTarget.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        onPaste={handlePaste}
                        autocomplete="off"
                      />
                    </>
                  ))}
                </div>
                <Show when={error()}>
                  <div class="zenkai-login-error">{error()}</div>
                </Show>
                <div class="zenkai-login-actions">
                  <button type="submit" class="zenkai-login-btn-primary" disabled={verificando()}>
                    <span>▶</span>
                    <span>{verificando() ? "Verificando..." : "Verificar código"}</span>
                    <span class="arrow" style="opacity:0.7;font-weight:400;">↵</span>
                  </button>
                  <button type="button" class="zenkai-login-btn-secondary" onClick={() => props.onSkip?.()}>
                    <span class="arrow">›</span>
                    <span>Continuar sin cuenta · modo local</span>
                  </button>
                </div>
              </form>
            </Show>

            <Show when={tab() === "solicitar"}>
              <div class="zenkai-login-view">
                <Show
                  when={codigoGenerado()}
                  fallback={
                    <div class="zenkai-login-request-panel">
                      <div class="icon">▓ ▓ ▓</div>
                      <div class="msg">Generá un código nuevo para este equipo</div>
                      <div class="sub">no requiere email · sin registro · privado</div>
                    </div>
                  }
                >
                  <div class="zenkai-login-generated-code">
                    <span class="label-in">[ TU NUEVO CÓDIGO ]</span>
                    <div class="code">{codigoGenerado()}</div>
                    <div class="warn">
                      <span class="warn-strong">Guardalo en un lugar seguro.</span><br />
                      Se muestra una sola vez y no se puede recuperar.
                    </div>
                  </div>
                </Show>
                <Show when={error()}>
                  <div class="zenkai-login-error">{error()}</div>
                </Show>
                <div class="zenkai-login-actions">
                  <Show
                    when={codigoGenerado()}
                    fallback={
                      <button type="button" class="zenkai-login-btn-primary" disabled={generando()} onClick={generar}>
                        <span>▶</span>
                        <span>{generando() ? "Generando..." : "Generar código"}</span>
                        <span class="arrow" style="opacity:0.7;font-weight:400;">↵</span>
                      </button>
                    }
                  >
                    <button type="button" class="zenkai-login-btn-primary" onClick={copiarCodigo}>
                      <span>▶</span>
                      <span>{copiado() ? "✓ Copiado" : "Copiar y continuar"}</span>
                      <span class="arrow" style="opacity:0.7;font-weight:400;">↵</span>
                    </button>
                    <button type="button" class="zenkai-login-btn-secondary" onClick={generar}>
                      <span class="arrow">›</span>
                      <span>Generar otro</span>
                    </button>
                  </Show>
                </div>
              </div>
            </Show>
          </div>

        </div>
      </div>
    </div>
  )
}
