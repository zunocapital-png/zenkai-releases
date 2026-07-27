import { createSignal, onMount, Show, For, type JSX } from "solid-js"
import { ZenkaiLogoMark } from "./zenkai-logo"
import { MatrixRain } from "./matrix-rain"
import { hashCredentials } from "@/auth/license-data"
import { validateCredentials, isAuthenticated, isExpired, saveAuth } from "@/auth/license-manager"

const REMEMBER_KEY = "zenkai-remember"

// Solicitud de acceso SIN exponer tu correo personal.
// Registrate GRATIS en https://web3forms.com con tu correo, copia el
// "Access Key" que te dan (es publico, NO revela tu correo) y pegalo aqui.
// Las solicitudes llegaran a tu correo, pero nadie vera cual es.
const ACCESS_FORM_KEY = "PEGA-AQUI-TU-ACCESS-KEY-DE-WEB3FORMS"

interface SavedCredentials {
  key: string
  code: string
}

function loadSaved(): SavedCredentials | null {
  try {
    const s = localStorage.getItem(REMEMBER_KEY)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

const TERMINAL_LINES = [
  { text: "zenkai v1.0.0 — AI Coding Assistant", delay: 0 },
  { text: "Copyright (c) 2025-2026 Zuno Company", delay: 100 },
  { text: "Initializing secure connection...", delay: 250 },
  { text: "Loading neural engine... OK", delay: 500 },
  { text: "Authentication required.", delay: 800 },
]

export function AuthGate(props: { children: JSX.Element }) {
  const [authed, setAuthed] = createSignal(isAuthenticated())
  const [mounted, setMounted] = createSignal(false)
  const [leaving, setLeaving] = createSignal(false)

  onMount(() => {
    requestAnimationFrame(() => setMounted(true))
  })

  function handleSuccess() {
    setLeaving(true)
    setTimeout(() => setAuthed(true), 600)
  }

  return (
    <Show when={authed()} fallback={<LoginScreen onSuccess={handleSuccess} mounted={mounted()} leaving={leaving()} />}>
      {props.children}
    </Show>
  )
}

function LoginScreen(props: { onSuccess: () => void; mounted: boolean; leaving: boolean }) {
  const saved = loadSaved()
  const [key, setKey] = createSignal(saved?.key ?? "")
  const [code, setCode] = createSignal(saved?.code ?? "")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal("")
  const [shake, setShake] = createSignal(false)
  const [remember, setRemember] = createSignal(!!saved)
  const [expired, setExpired] = createSignal(isExpired())
  const [visibleLines, setVisibleLines] = createSignal(0)
  const [showForm, setShowForm] = createSignal(false)

  // Solicitud de acceso (se envia a tu correo via Web3Forms, oculto)
  const [showRequest, setShowRequest] = createSignal(false)
  const [reqName, setReqName] = createSignal("")
  const [reqEmail, setReqEmail] = createSignal("")
  const [reqMsg, setReqMsg] = createSignal("")
  const [reqState, setReqState] = createSignal<"idle" | "sending" | "sent" | "error">("idle")

  async function submitRequest(e: Event) {
    e.preventDefault()
    if (reqState() === "sending") return
    setReqState("sending")
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: ACCESS_FORM_KEY,
          subject: "Solicitud de acceso a Zenkai",
          from_name: "Zenkai",
          nombre: reqName().trim(),
          correo_solicitante: reqEmail().trim(),
          motivo: reqMsg().trim(),
        }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      setReqState(data.success ? "sent" : "error")
    } catch {
      setReqState("error")
    }
  }

  onMount(() => {
    TERMINAL_LINES.forEach((line, i) => {
      setTimeout(() => {
        setVisibleLines(i + 1)
        if (i === TERMINAL_LINES.length - 1) {
          setTimeout(() => setShowForm(true), 300)
        }
      }, line.delay)
    })
  })

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (loading()) return
    setError("")
    setLoading(true)

    try {
      const result = await validateCredentials(key().trim(), code().trim())

      if (!result.valid) {
        setError(expired() ? ">> ERROR: License expired" : ">> ERROR: Invalid credentials")
        setShake(true)
        setTimeout(() => setShake(false), 500)
        setLoading(false)
        return
      }

      const combined = await hashCredentials(key().trim(), code().trim())
      saveAuth(combined, result.expiresAt!, result.tier!)

      if (remember()) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ key: key().trim(), code: code().trim() }))
      } else {
        localStorage.removeItem(REMEMBER_KEY)
      }

      setLoading(false)
      props.onSuccess()
    } catch {
      setError(">> ERROR: Validation failed")
      setLoading(false)
    }
  }

  return (
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      classList={{
        "auth-mounted": props.mounted,
        "auth-leaving": props.leaving,
      }}
      style={{ background: "#000" }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes termType {
          from { opacity: 0; transform: translateX(-5px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes cursorBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes glitchFlicker {
          0%, 92%, 100% { opacity: 1; }
          93% { opacity: 0.7; transform: translateX(2px); }
          94% { opacity: 1; transform: translateX(-1px); }
          95% { opacity: 0.8; transform: translateX(0); }
        }
        @keyframes formSlide {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
        }
        @keyframes spinGlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes logoReveal {
          from { opacity: 0; transform: scale(0.5); filter: brightness(3); }
          to { opacity: 1; transform: scale(1); filter: brightness(1); }
        }
        .auth-gate-container {
          opacity: 0;
        }
        .auth-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .auth-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        .auth-mounted .auth-gate-container {
          animation: fadeIn 0.5s ease-out forwards;
        }
        .auth-leaving .auth-gate-container {
          transition: all 0.5s ease-out;
          opacity: 0 !important;
          transform: scale(1.02) translateY(-10px) !important;
          filter: blur(3px);
        }
        .term-line {
          animation: termType 0.15s ease-out forwards;
          opacity: 0;
        }
        .term-cursor::after {
          content: '█';
          animation: cursorBlink 0.8s step-end infinite;
          color: #EC5B2B;
        }
        .scanline-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0,0,0,0.15) 2px,
            rgba(0,0,0,0.15) 4px
          );
          z-index: 10;
        }
        .scanline-bar {
          position: absolute;
          left: 0; right: 0;
          height: 4px;
          background: linear-gradient(180deg, transparent, rgba(236,91,43,0.06), transparent);
          animation: scanline 8s linear infinite;
          pointer-events: none;
          z-index: 11;
        }
        .auth-shake {
          animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
        }
        .term-input {
          background: rgba(236,91,43,0.04);
          border: 1px solid rgba(236,91,43,0.15);
          transition: all 0.2s ease;
          caret-color: #EC5B2B;
        }
        .term-input:focus {
          border-color: #EC5B2B;
          box-shadow: 0 0 0 1px rgba(236,91,43,0.2), 0 0 15px rgba(236,91,43,0.05);
          background: rgba(236,91,43,0.06);
        }
        .term-input::placeholder {
          color: rgba(236,91,43,0.25);
          font-style: italic;
        }
        .term-btn {
          transition: all 0.2s ease;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          position: relative;
          overflow: hidden;
        }
        .term-btn:hover:not(:disabled) {
          background: #EC5B2B !important;
          box-shadow: 0 0 20px rgba(236,91,43,0.3), 0 0 40px rgba(236,91,43,0.1);
        }
        .term-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        .logo-area {
          animation: logoReveal 0.6s ease-out forwards;
        }
        .form-area {
          animation: formSlide 0.4s ease-out forwards;
        }
        .grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(236,91,43,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(236,91,43,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }
        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%);
          pointer-events: none;
        }
        .spinner-ring {
          animation: spinGlow 1s linear infinite;
        }
        .ascii-letter {
          display: inline-block;
          font-family: monospace;
          font-size: 10px;
          line-height: 10px;
          color: rgba(236,91,43,0.08);
          white-space: pre;
          animation: glitchFlicker 10s ease-in-out infinite;
        }
      `}</style>

      <MatrixRain opacity={0.16} />
      <div class="grid-bg" />
      <div class="vignette" />
      <div class="scanline-overlay" />
      <div class="scanline-bar" />

      {/* Terminal boot log — esquina inferior izquierda */}
      <div
        class="absolute bottom-5 left-6 font-mono text-[10px] leading-[1.7] pointer-events-none select-none hidden sm:block"
        style={{ color: "rgba(236,91,43,0.4)", "z-index": "15", "max-width": "70vw" }}
      >
        <For each={TERMINAL_LINES.slice(0, visibleLines())}>
          {(line) => (
            <div class="term-line">
              <span style={{ color: "rgba(236,91,43,0.22)" }}>$</span> <span>{line.text}</span>
            </div>
          )}
        </For>
      </div>

      <div class="auth-gate-container auth-scroll flex flex-col items-center w-full max-w-md px-6 py-6 max-h-[100dvh] overflow-y-auto" style={{ "z-index": "20" }}>
        {/* Logo + ZENKAI title */}
        <div class="logo-area flex flex-col items-center gap-2 mb-5">
          <div class="flex items-center gap-3">
            <ZenkaiLogoMark size={52} animate />
            <h1 class="zenkai-wordmark text-3xl tracking-[0.25em] select-none">ZENKAI</h1>
          </div>
          <div class="flex items-center gap-2 mt-1">
            <div style={{ width: "40px", height: "1px", background: "linear-gradient(90deg, transparent, rgba(236,91,43,0.4))" }} />
            <span class="text-[9px] font-mono tracking-[0.4em] uppercase" style={{ color: "rgba(236,91,43,0.35)" }}>
              AI CODING ASSISTANT
            </span>
            <div style={{ width: "40px", height: "1px", background: "linear-gradient(90deg, rgba(236,91,43,0.4), transparent)" }} />
          </div>
        </div>

        {/* Login form */}
        <Show when={showForm()}>
          <div class="form-area w-full">
            <div
              class="w-full p-5 rounded-none"
              style={{
                border: "1px solid rgba(236,91,43,0.15)",
                background: "rgba(236,91,43,0.02)",
              }}
            >
              <div class="flex items-center gap-2 mb-4 pb-3" style={{ "border-bottom": "1px solid rgba(236,91,43,0.1)" }}>
                <div class="w-2 h-2 rounded-full" style={{ background: "#EC5B2B", "box-shadow": "0 0 6px rgba(236,91,43,0.5)" }} />
                <span class="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: "rgba(236,91,43,0.5)" }}>
                  Secure Authentication
                </span>
              </div>

              <form
                onSubmit={handleSubmit}
                class="flex flex-col gap-3"
                classList={{ "auth-shake": shake() }}
              >
                <div class="flex flex-col gap-1">
                  <label class="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: "rgba(236,91,43,0.35)" }}>
                    <span style={{ color: "rgba(236,91,43,0.2)" }}>&gt;</span> license_key
                  </label>
                  <input
                    type="text"
                    value={key()}
                    onInput={(e) => setKey(e.currentTarget.value)}
                    placeholder="XXXX-XXXX-XXXX"
                    class="term-input w-full rounded-none px-3 py-2.5 text-sm text-white outline-none font-mono"
                    autocomplete="off"
                    spellcheck={false}
                  />
                </div>

                <div class="flex flex-col gap-1">
                  <label class="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: "rgba(236,91,43,0.35)" }}>
                    <span style={{ color: "rgba(236,91,43,0.2)" }}>&gt;</span> access_code
                  </label>
                  <input
                    type="password"
                    value={code()}
                    onInput={(e) => setCode(e.currentTarget.value)}
                    placeholder="enter access code"
                    class="term-input w-full rounded-none px-3 py-2.5 text-sm text-white outline-none font-mono"
                    autocomplete="off"
                  />
                </div>

                <label class="flex items-center gap-2 cursor-pointer select-none mt-1">
                  <div
                    class="w-3.5 h-3.5 flex items-center justify-center"
                    style={{
                      border: `1px solid ${remember() ? "#EC5B2B" : "rgba(236,91,43,0.2)"}`,
                      background: remember() ? "rgba(236,91,43,0.15)" : "transparent",
                    }}
                    onClick={() => setRemember(!remember())}
                  >
                    <Show when={remember()}>
                      <span class="font-mono text-[9px]" style={{ color: "#EC5B2B" }}>x</span>
                    </Show>
                  </div>
                  <span
                    class="font-mono text-[10px]"
                    style={{ color: "rgba(236,91,43,0.35)" }}
                    onClick={() => setRemember(!remember())}
                  >
                    recordar_credenciales
                  </span>
                </label>

                <Show when={error()}>
                  <div
                    class="font-mono text-[11px] py-2 px-3"
                    style={{
                      color: "#ff4444",
                      background: "rgba(255,68,68,0.06)",
                      border: "1px solid rgba(255,68,68,0.15)",
                    }}
                  >
                    {error()}
                  </div>
                </Show>

                <button
                  type="submit"
                  disabled={loading() || !key().trim() || !code().trim()}
                  class="term-btn mt-1 w-full py-2.5 text-xs font-mono font-bold text-white tracking-wider"
                  style={{
                    background: loading()
                      ? "rgba(236,91,43,0.3)"
                      : !key().trim() || !code().trim()
                        ? "rgba(236,91,43,0.08)"
                        : "rgba(236,91,43,0.8)",
                    border: `1px solid ${!key().trim() || !code().trim() ? "rgba(236,91,43,0.1)" : "#EC5B2B"}`,
                    cursor: !key().trim() || !code().trim() ? "not-allowed" : "pointer",
                    opacity: !key().trim() || !code().trim() ? 0.4 : 1,
                  }}
                >
                  <Show
                    when={!loading()}
                    fallback={
                      <div class="flex items-center justify-center gap-2">
                        <svg class="spinner-ring" width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
                          <path d="M14 8a6 6 0 0 0-6-6" stroke="white" stroke-width="2" stroke-linecap="round" />
                        </svg>
                        <span>Authenticating...</span>
                      </div>
                    }
                  >
                    [ INICIAR SESION ]
                  </Show>
                </button>
              </form>
            </div>

            <div class="flex items-center justify-between mt-3 px-1">
              <span class="font-mono text-[9px]" style={{ color: "rgba(236,91,43,0.15)" }}>
                zenkai://auth
              </span>
              <span class="font-mono text-[9px]" style={{ color: "rgba(236,91,43,0.15)" }}>
                v1.0 &middot; Zuno Company
              </span>
            </div>

            {/* Solicitud de acceso — se envia al dueño sin exponer su correo */}
            <div class="mt-4 pt-3" style={{ "border-top": "1px solid rgba(236,91,43,0.08)" }}>
              <Show
                when={showRequest()}
                fallback={
                  <div class="text-center">
                    <button
                      type="button"
                      onClick={() => setShowRequest(true)}
                      class="term-btn inline-block px-4 py-2 text-[10px] font-mono tracking-wider"
                      style={{
                        color: "#EC5B2B",
                        border: "1px solid rgba(236,91,43,0.3)",
                        background: "rgba(236,91,43,0.04)",
                      }}
                    >
                      &gt; SOLICITAR ACCESO
                    </button>
                  </div>
                }
              >
                <Show
                  when={reqState() !== "sent"}
                  fallback={
                    <div class="text-center py-2">
                      <p class="font-mono text-[11px]" style={{ color: "#4ade80" }}>
                        &gt;&gt; Solicitud enviada
                      </p>
                      <p class="font-mono text-[9px] mt-1" style={{ color: "rgba(236,91,43,0.3)" }}>
                        Te contactaremos con tus credenciales
                      </p>
                    </div>
                  }
                >
                  <form onSubmit={submitRequest} class="flex flex-col gap-2">
                    <p class="font-mono text-[9px] uppercase tracking-[0.2em] mb-1" style={{ color: "rgba(236,91,43,0.4)" }}>
                      Solicitar credenciales de acceso
                    </p>
                    <input
                      type="text"
                      value={reqName()}
                      onInput={(e) => setReqName(e.currentTarget.value)}
                      placeholder="tu nombre"
                      required
                      class="term-input w-full rounded-none px-3 py-2 text-xs text-white outline-none font-mono"
                    />
                    <input
                      type="email"
                      value={reqEmail()}
                      onInput={(e) => setReqEmail(e.currentTarget.value)}
                      placeholder="tu correo de contacto"
                      required
                      class="term-input w-full rounded-none px-3 py-2 text-xs text-white outline-none font-mono"
                    />
                    <textarea
                      value={reqMsg()}
                      onInput={(e) => setReqMsg(e.currentTarget.value)}
                      placeholder="motivo (opcional)"
                      rows={2}
                      class="term-input w-full rounded-none px-3 py-2 text-xs text-white outline-none font-mono resize-none"
                    />
                    <Show when={reqState() === "error"}>
                      <p class="font-mono text-[10px]" style={{ color: "#ff4444" }}>
                        &gt;&gt; Error al enviar. Reintenta.
                      </p>
                    </Show>
                    <button
                      type="submit"
                      disabled={reqState() === "sending" || !reqName().trim() || !reqEmail().trim()}
                      class="term-btn w-full py-2 text-[10px] font-mono tracking-wider text-white"
                      style={{
                        background: reqState() === "sending" ? "rgba(236,91,43,0.3)" : "rgba(236,91,43,0.7)",
                        border: "1px solid #EC5B2B",
                        opacity: !reqName().trim() || !reqEmail().trim() ? 0.4 : 1,
                      }}
                    >
                      {reqState() === "sending" ? "Enviando..." : "[ ENVIAR SOLICITUD ]"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRequest(false)}
                      class="font-mono text-[9px] tracking-wider mx-auto mt-1 hover:opacity-100 transition-opacity"
                      style={{ color: "rgba(236,91,43,0.4)", opacity: 0.7 }}
                    >
                      &gt; cerrar / ocultar
                    </button>
                  </form>
                </Show>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default AuthGate
