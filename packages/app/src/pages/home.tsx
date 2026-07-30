import { createEffect, createSignal, Show } from "solid-js"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { useTabs } from "@/context/tabs"
import { createHomeController } from "./home/home-controller"
import { createHomeScrollController } from "./home/home-scroll-controller"
import { createHomeSessionSearchController } from "./home/home-session-search-controller"
import { createHomeSessionsController } from "./home/home-sessions-controller"
import { HomeSessions } from "./home/home-sessions"

// On a cold app launch the app should open directly on a new chat (like Claude)
// instead of the projects/sessions browser. This flag is module-scoped so it only
// triggers once per app session: later visits to "/" (grid-plus home button / Ctrl+B)
// keep showing the full browser.
let startupChatOpened = false

export function NewHome() {
  const home = createHomeController()
  const sessions = createHomeSessionsController(home)
  const search = createHomeSessionSearchController(home, sessions)
  const scroll = createHomeScrollController(sessions.data.groups)
  const tabs = useTabs()

  // While the startup redirect is being resolved, avoid flashing the browser.
  const [startupPending, setStartupPending] = createSignal(!startupChatOpened)

  createEffect(() => {
    if (startupChatOpened) {
      setStartupPending(false)
      return
    }
    if (!tabs.ready()) return
    // Reuse an existing draft (if any) so empty drafts don't pile up across launches.
    const existingDraft = tabs.store.find((tab) => tab.type === "draft")
    if (existingDraft) {
      startupChatOpened = true
      tabs.select(existingDraft)
      return
    }
    const project = home.project.newSession()
    if (!project) {
      // No project available yet (e.g. fresh install): fall back to the browser
      // so the user can add one.
      setStartupPending(false)
      return
    }
    startupChatOpened = true
    home.project.openNewSession()
  })

  return (
    <Show when={!startupPending()}>
    <div
      class={`
        m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px]
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <ScrollView
        class="h-full [container-type:size]"
        thumbContainer={scroll.viewport.thumbTrack}
        thumbHoverTarget={scroll.viewport.hoverTarget}
        viewportRef={scroll.viewport.setViewport}
        onScroll={(event) => scroll.viewport.update(event.currentTarget.scrollTop)}
        onWheel={scroll.viewport.containOuterWheel}
      >
        {/* Home limpio: solo el welcome centrado. Proyectos vive ahora en el
            sidebar izquierdo (LeftSidebar), y los chats también. No más columnas
            duplicadas ni panel derecho. */}
        <div class="mx-auto flex min-h-full w-full max-w-[900px] flex-col px-3 lg:px-6">
          <HomeSessions sessions={sessions} search={search} scroll={scroll} />
        </div>
      </ScrollView>
    </div>
    </Show>
  )
}
