import { mergeProps } from "solid-js"

type LogoProps = {
  size?: number
  animate?: boolean
  class?: string
}

// Zenkai logo = terminal prompt ">" + blinking block cursor.
const LOGO_STYLES = `
@keyframes zk-cursor-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@keyframes zk-glow-pulse {
  0%, 100% { filter: drop-shadow(0 0 3px rgba(236,91,43,0.35)); }
  50% { filter: drop-shadow(0 0 9px rgba(236,91,43,0.6)); }
}
@keyframes zk-chevron-in {
  from { opacity: 0; transform: translateX(-3px); }
  to { opacity: 1; transform: translateX(0); }
}
.zk-chevron {
  opacity: 0;
  animation: zk-chevron-in 0.4s ease-out 0.1s forwards;
}
.zk-cursor {
  animation: zk-cursor-blink 1s step-end 0.6s infinite;
}
.zk-mark-glow {
  animation: zk-glow-pulse 3s ease-in-out infinite;
}
.zk-no-anim .zk-chevron { animation: none !important; opacity: 1 !important; }
.zk-no-anim .zk-cursor { animation: none !important; }
.zk-no-anim.zk-mark-glow { animation: none !important; filter: none !important; }
`

let stylesInjected = false
function injectStyles() {
  if (stylesInjected) return
  stylesInjected = true
  const el = document.createElement("style")
  el.textContent = LOGO_STYLES
  document.head.appendChild(el)
}

// Bare prompt mark (no container) — ">" chevron + block cursor.
export function ZenkaiLogoMark(props: LogoProps) {
  injectStyles()
  const merged = mergeProps({ size: 40, animate: true }, props)

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={merged.size}
      height={merged.size}
      fill="none"
      class={`${merged.animate ? "zk-mark-glow" : "zk-no-anim zk-mark-glow"} ${merged.class ?? ""}`}
    >
      <defs>
        <linearGradient id="zk-m-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#EC5B2B" />
          <stop offset="100%" stop-color="#EE7948" />
        </linearGradient>
      </defs>
      <polyline
        points="34,26 62,50 34,74"
        stroke="url(#zk-m-grad)"
        stroke-width="11"
        stroke-linecap="round"
        stroke-linejoin="round"
        class={merged.animate ? "zk-chevron" : ""}
      />
      <rect x="70" y="30" width="12" height="40" rx="1" fill="#EC5B2B" class={merged.animate ? "zk-cursor" : ""} />
    </svg>
  )
}

// Prompt mark inside a rounded container (splash / login).
export function ZenkaiLogo(props: LogoProps) {
  injectStyles()
  const merged = mergeProps({ size: 40, animate: true }, props)

  const s = () => merged.size
  const r = () => s() * 0.18

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={s()}
      height={s()}
      fill="none"
      class={`${merged.animate ? "zk-mark-glow" : "zk-no-anim zk-mark-glow"} ${merged.class ?? ""}`}
    >
      <defs>
        <linearGradient id="zk-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#EC5B2B" stop-opacity="0.12" />
          <stop offset="100%" stop-color="#EE7948" stop-opacity="0.06" />
        </linearGradient>
        <linearGradient id="zk-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#EC5B2B" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#EE7948" stop-opacity="0.25" />
        </linearGradient>
        <linearGradient id="zk-stroke-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#EC5B2B" />
          <stop offset="100%" stop-color="#EE7948" />
        </linearGradient>
      </defs>
      <rect
        x={100 * 0.04}
        y={100 * 0.04}
        width={100 * 0.92}
        height={100 * 0.92}
        rx={r() / s() * 100}
        fill="url(#zk-bg-grad)"
        stroke="url(#zk-border-grad)"
        stroke-width="2"
      />
      <polyline
        points="36,32 58,50 36,68"
        stroke="url(#zk-stroke-grad)"
        stroke-width="9"
        stroke-linecap="round"
        stroke-linejoin="round"
        class={merged.animate ? "zk-chevron" : ""}
      />
      <rect x="64" y="35" width="10" height="30" rx="1" fill="#EC5B2B" class={merged.animate ? "zk-cursor" : ""} />
    </svg>
  )
}
