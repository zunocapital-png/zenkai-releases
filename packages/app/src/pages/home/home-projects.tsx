import { onMount } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { HomeProjectsController } from "./home-projects-controller"
import { HomeProjectsView } from "./home-projects-view"
import type { HomeScrollController } from "./home-scroll-controller"

const WELCOME_FLAG = "zenkai.welcome.shown.v1"

export function HomeProjects(props: { projects: HomeProjectsController; scroll: HomeScrollController }) {
  const dialog = useDialog()

  // Primer arranque: mostramos la bienvenida una sola vez (guía para instalar un
  // modelo local o conectar una API). Se marca en localStorage para no repetir.
  onMount(() => {
    let ya = false
    try {
      ya = localStorage.getItem(WELCOME_FLAG) === "1"
    } catch {
      /* sin localStorage: mejor no molestar */
      ya = true
    }
    if (ya) return
    try {
      localStorage.setItem(WELCOME_FLAG, "1")
    } catch {
      /* noop */
    }
    void import("@/components/dialog-bienvenida").then((x) => dialog.show(() => <x.DialogBienvenida />))
  })

  return (
    <HomeProjectsView
      language={props.projects.copy.language}
      servers={props.projects.server.list}
      projects={props.projects.project.list}
      recentlyClosed={props.projects.project.recentlyClosed}
      selection={props.projects.selection.value}
      homedir={props.projects.project.homedir}
      serverHealth={props.projects.server.health}
      projectsForServer={props.projects.server.projects}
      collapsed={props.projects.server.collapsed}
      canDefaultServer={props.projects.server.canDefault}
      defaultServerKey={props.projects.server.defaultKey}
      canRevealProject={props.projects.project.canReveal}
      unseenCount={props.projects.project.unseenCount}
      onWheel={props.scroll.viewport.containWheel}
      onChooseProject={props.projects.project.choose}
      onFocusServer={props.projects.server.focus}
      onToggleCollapsed={props.projects.server.toggleCollapsed}
      onEditServer={props.projects.server.edit}
      onSetDefaultServer={props.projects.server.setDefault}
      onRemoveServer={props.projects.server.remove}
      onMoveProject={props.projects.project.move}
      onSelectProject={props.projects.project.select}
      onAddProjects={props.projects.project.add}
      onOpenProjectNewSession={props.projects.project.openNewSession}
      onEditProject={props.projects.project.edit}
      onRevealProject={props.projects.project.reveal}
      onClearNotifications={props.projects.project.clearNotifications}
      onCloseProject={props.projects.project.close}
      onOpenSettings={props.projects.utility.settings}
      onOpenHelp={props.projects.utility.help}
    />
  )
}
