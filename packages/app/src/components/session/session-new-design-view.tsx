import type { JSX } from "solid-js"
import { ZenkaiLogoMark } from "@/components/zenkai-logo"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden bg-v2-background-bg-deep ">
      <div class="absolute inset-x-0 top-[25.375%] flex justify-center px-6">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <div class="flex items-center justify-center gap-3 select-none text-v2-background-bg-inverse">
            <ZenkaiLogoMark size={44} animate />
            <span class="tracking-[0.18em]" style={{ "font-family": '"Press Start 2P", monospace', "font-size": "clamp(1.75rem, 4vw, 2.75rem)" }}>
              ZENKAI
            </span>
          </div>
          <div class="mt-4 text-center text-[15px] leading-5 text-v2-text-text-muted select-none">
            ¿En qué trabajamos hoy?
          </div>
          <div class="mt-6">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
