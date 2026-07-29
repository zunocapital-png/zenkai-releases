import type { JSX } from "solid-js"
import { ZenkaiLogoMark } from "@/components/zenkai-logo"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep">
      {/* Glow naranja de fondo para dar profundidad (que no se vea apagado) */}
      <div
        class="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(62% 46% at 50% 30%, rgba(236,91,43,0.12), rgba(236,91,43,0.03) 45%, transparent 72%)" }}
      />
      <div class="absolute inset-x-0 top-[21%] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <div
            class="flex items-center justify-center gap-3.5 select-none text-v2-background-bg-inverse"
            style={{ filter: "drop-shadow(0 0 26px rgba(236,91,43,0.28))" }}
          >
            <ZenkaiLogoMark size={60} animate />
            <span
              class="tracking-[0.18em]"
              style={{ "font-family": '"Press Start 2P", monospace', "font-size": "clamp(2rem, 4.6vw, 3.25rem)" }}
            >
              ZENKAI
            </span>
          </div>
          <div class="mt-5 text-center text-[16px] leading-5 text-v2-text-text-muted select-none">
            ¿En qué trabajamos hoy?
          </div>
          <div class="mt-2 text-center text-[12px] leading-4 tracking-wide text-v2-text-text-faint select-none">
            Tu asistente de código — local y en la nube, 100% tuyo
          </div>
          <div class="mt-7">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
