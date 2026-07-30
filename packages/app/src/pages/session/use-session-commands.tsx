import { useNavigate } from "@solidjs/router"
import { useCommand, type CommandOption } from "@/context/command"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { previewSelectedLines } from "@opencode-ai/session-ui/pierre/selection-bridge"
import { useFile, selectionFromLines, type FileSelection, type SelectedLineRange } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePermission } from "@/context/permission"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useSettings } from "@/context/settings"
import { useSync } from "@/context/sync"
import { useTerminal } from "@/context/terminal"
import { showToast } from "@/utils/toast"
import { findLast } from "@opencode-ai/core/util/array"
import { createSessionTabs } from "@/pages/session/helpers"
import { extractPromptFromParts } from "@/utils/prompt"
import { UserMessage } from "@opencode-ai/sdk/v2"
import { useSessionLayout } from "@/pages/session/session-layout"
import { createSessionOwnership } from "./session-ownership"
import { useLocal } from "@/context/local"

export type SessionCommandContext = {
  navigateMessageByOffset: (offset: number) => void
  setActiveMessage: (message: UserMessage | undefined) => void
  focusInput: () => void
  review?: () => boolean
  fileBrowser?: () => boolean
}

const withCategory = (category: string) => {
  return (option: Omit<CommandOption, "category">): CommandOption => ({
    ...option,
    category,
  })
}

export const useSessionCommands = (actions: SessionCommandContext) => {
  const command = useCommand()
  const dialog = useDialog()
  const file = useFile()
  const language = useLanguage()
  const permission = usePermission()
  const prompt = usePrompt()
  const sdk = useSDK()
  const settings = useSettings()
  const sync = useSync()
  const terminal = useTerminal()
  const layout = useLayout()
  const local = useLocal()
  const navigate = useNavigate()
  const { params, sessionKey, tabs, view } = useSessionLayout()
  const sessionOwnership = createSessionOwnership(sessionKey)
  const openDialog = async <T,>(load: () => Promise<T>, show: (value: T) => void) => {
    const owner = sessionOwnership.capture()
    const value = await load()
    owner.run(() => show(value))
  }
  const runCommand = async <T,>(input: {
    owner: ReturnType<ReturnType<typeof createSessionOwnership>["capture"]>
    prompt: T
    request: () => Promise<unknown>
    updatePrompt: (prompt: T) => void
    updateViewport: () => void
  }) => {
    await input.request()
    input.updatePrompt(input.prompt)
    input.owner.run(input.updateViewport)
  }

  const info = () => {
    const id = params.id
    if (!id) return
    return sync().session.get(id)
  }
  const hasReview = () => !!params.id
  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }
  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: actions.review,
    hasReview,
    fileBrowser: actions.fileBrowser,
  })
  const activeFileTab = tabState.activeFileTab
  const closableTab = tabState.closableTab
  const shown = settings.visibility.fileTree

  const messages = () => {
    const id = params.id
    if (!id) return []
    return sync().data.message[id] ?? []
  }
  const userMessages = () => messages().filter((m) => m.role === "user") as UserMessage[]
  const visibleUserMessages = () => {
    const revert = info()?.revert?.messageID
    if (!revert) return userMessages()
    return userMessages().filter((m) => m.id < revert)
  }

  const showAllFiles = () => {
    if (layout.fileTree.tab() !== "changes") return
    layout.fileTree.setTab("all")
  }

  const selectionPreview = (path: string, selection: FileSelection) => {
    const content = file.get(path)?.content?.content
    if (!content) return undefined
    return previewSelectedLines(content, { start: selection.startLine, end: selection.endLine })
  }

  const addSelectionToContext = (path: string, selection: FileSelection) => {
    const preview = selectionPreview(path, selection)
    prompt.context.add({ type: "file", path, selection, preview })
  }

  const canAddSelectionContext = () => {
    const tab = activeFileTab()
    if (!tab) return false
    const path = file.pathFromTab(tab)
    if (!path) return false
    return file.selectedLines(path) != null
  }

  const navigateMessageByOffset = actions.navigateMessageByOffset
  const setActiveMessage = actions.setActiveMessage
  const focusInput = actions.focusInput

  const sessionCommand = withCategory(language.t("command.category.session"))
  const fileCommand = withCategory(language.t("command.category.file"))
  const contextCommand = withCategory(language.t("command.category.context"))
  const viewCommand = withCategory(language.t("command.category.view"))
  const terminalCommand = withCategory(language.t("command.category.terminal"))
  const mcpCommand = withCategory(language.t("command.category.mcp"))
  const permissionsCommand = withCategory(language.t("command.category.permissions"))

  const isAutoAcceptActive = () => {
    const sessionID = params.id
    if (sessionID) return permission.isAutoAccepting(sessionID, sdk().directory)
    return permission.isAutoAcceptingDirectory(sdk().directory)
  }
  const write = async (value: string) => {
    const body = typeof document === "undefined" ? undefined : document.body
    if (body) {
      const textarea = document.createElement("textarea")
      textarea.value = value
      textarea.setAttribute("readonly", "")
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      textarea.style.pointerEvents = "none"
      body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand("copy")
      body.removeChild(textarea)
      if (copied) return true
    }

    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard
    if (!clipboard?.writeText) return false
    return clipboard.writeText(value).then(
      () => true,
      () => false,
    )
  }

  const copyShare = async (url: string, existing: boolean) => {
    if (!(await write(url))) {
      showToast({
        title: language.t("toast.session.share.copyFailed.title"),
        variant: "error",
      })
      return
    }

    showToast({
      title: existing ? language.t("session.share.copy.copied") : language.t("toast.session.share.success.title"),
      description: language.t("toast.session.share.success.description"),
      variant: "success",
    })
  }

  const share = async () => {
    const sessionID = params.id
    if (!sessionID) return

    const existing = info()?.share?.url
    if (existing) {
      await copyShare(existing, true)
      return
    }

    const url = await sdk()
      .client.session.share({ sessionID })
      .then((res) => res.data?.share?.url)
      .catch(() => undefined)
    if (!url) {
      showToast({
        title: language.t("toast.session.share.failed.title"),
        description: language.t("toast.session.share.failed.description"),
        variant: "error",
      })
      return
    }

    await copyShare(url, false)
  }

  const unshare = async () => {
    const sessionID = params.id
    if (!sessionID) return

    await sdk()
      .client.session.unshare({ sessionID })
      .then(() =>
        showToast({
          title: language.t("toast.session.unshare.success.title"),
          description: language.t("toast.session.unshare.success.description"),
          variant: "success",
        }),
      )
      .catch(() =>
        showToast({
          title: language.t("toast.session.unshare.failed.title"),
          description: language.t("toast.session.unshare.failed.description"),
          variant: "error",
        }),
      )
  }

  const openFile = () => {
    void openDialog(
      () => import("@/components/dialog-select-file"),
      (x) => dialog.show(() => <x.DialogSelectFile onOpenFile={showAllFiles} />),
    )
  }

  const closeTab = () => {
    const tab = closableTab()
    if (!tab) return
    tabs().close(tab)
  }

  const addSelection = () => {
    const tab = activeFileTab()
    if (!tab) return

    const path = file.pathFromTab(tab)
    if (!path) return

    const range = file.selectedLines(path) as SelectedLineRange | null | undefined
    if (!range) {
      showToast({
        title: language.t("toast.context.noLineSelection.title"),
        description: language.t("toast.context.noLineSelection.description"),
      })
      return
    }

    addSelectionToContext(path, selectionFromLines(range))
  }

  const openTerminal = () => {
    if (terminal.all().length > 0) terminal.new({ focus: true })
    if (terminal.all().length === 0) terminal.requestFocus()
    view().terminal.open()
  }

  const closeTerminal = () => {
    const id = terminal.active()
    if (!id) return
    const last = terminal.all().length === 1
    void terminal.close(id)
    if (last) view().terminal.close()
  }

  const chooseMcp = () => {
    void openDialog(
      () => import("@/components/dialog-select-mcp"),
      (x) => dialog.show(() => <x.DialogSelectMcp />),
    )
  }

  // Comandos ZENKAI de acceso rápido — abren los flujos más usados sin salir
  // del compositor. Todos con prefijo español para el usuario final.
  const zenkaiAyuda = () => {
    void openDialog(
      () => import("@/components/dialog-help-guide"),
      (x) => dialog.show(() => <x.DialogHelpGuide />),
    )
  }
  const zenkaiImagen = () => {
    void openDialog(
      () => import("@/components/dialog-imagenes"),
      (x) => dialog.show(() => <x.DialogImagenes />),
    )
  }
  const zenkaiQueSonMcp = () => {
    void openDialog(
      () => import("@/components/dialog-que-son-mcp"),
      (x) => dialog.show(() => <x.DialogQueSonMcp />),
    )
  }
  const zenkaiDisenos = () => {
    void openDialog(
      () => import("@/components/dialog-galeria-diseno"),
      (x) => dialog.show(() => <x.DialogGaleriaDiseno />),
    )
  }
  const zenkaiObservability = () => {
    void openDialog(
      () => import("@/components/dialog-observability"),
      (x) => dialog.show(() => <x.DialogObservability />),
    )
  }
  const zenkaiCapacidades = () => {
    void openDialog(
      () => import("@/components/dialog-capacidades"),
      (x) => dialog.show(() => <x.DialogCapacidades />),
    )
  }
  const zenkaiEvolution = () => {
    void openDialog(
      () => import("@/components/dialog-evolution"),
      (x) => dialog.show(() => <x.DialogEvolution />),
    )
  }
  const zenkaiComputer = () => {
    void openDialog(
      () => import("@/components/dialog-computer-viewer"),
      (x) => dialog.show(() => <x.DialogComputerViewer />),
    )
  }
  const zenkaiParliament = () => {
    void openDialog(
      () => import("@/components/dialog-parliament"),
      (x) => dialog.show(() => <x.DialogParliament />),
    )
  }
  const zenkaiPoliticas = () => {
    void openDialog(
      () => import("@/components/dialog-policy-engine"),
      (x) => dialog.show(() => <x.DialogPolicyEngine />),
    )
  }
  const zenkaiDigitalTwin = () => {
    void openDialog(
      () => import("@/components/dialog-digital-twin"),
      (x) => dialog.show(() => <x.DialogDigitalTwin />),
    )
  }
  const zenkaiEstadoIntegral = () => {
    void openDialog(
      () => import("@/components/dialog-estado-integral"),
      (x) => dialog.show(() => <x.DialogEstadoIntegral />),
    )
  }
  const zenkaiSetup = () => {
    void openDialog(
      () => import("@/components/dialog-oneclick-setup"),
      (x) => dialog.show(() => <x.DialogOneClickSetup />),
    )
  }
  const zenkaiCostTracker = () => {
    void openDialog(
      () => import("@/components/dialog-cost-tracker"),
      (x) => dialog.show(() => <x.DialogCostTracker />),
    )
  }
  const zenkaiReflector = () => {
    void openDialog(
      () => import("@/components/dialog-reflector"),
      (x) => dialog.show(() => <x.DialogReflector />),
    )
  }
  const zenkaiAutoRepair = () => {
    void openDialog(
      () => import("@/components/dialog-auto-repair"),
      (x) => dialog.show(() => <x.DialogAutoRepair />),
    )
  }
  const zenkaiSandbox = () => {
    void openDialog(
      () => import("@/components/dialog-sandbox"),
      (x) => dialog.show(() => <x.DialogSandbox />),
    )
  }
  const zenkaiMotor = () => {
    void openDialog(
      () => import("@/components/dialog-zenkai-engine"),
      (x) => dialog.show(() => <x.DialogZenkaiEngine />),
    )
  }
  const zenkaiComandos = () => {
    void openDialog(
      () => import("@/components/dialog-comandos"),
      (x) => dialog.show(() => <x.DialogComandos />),
    )
  }

  const toggleAutoAccept = () => {
    const sessionID = params.id
    if (sessionID) permission.toggleAutoAccept(sessionID, sdk().directory)
    else permission.toggleAutoAcceptDirectory(sdk().directory)

    const active = sessionID
      ? permission.isAutoAccepting(sessionID, sdk().directory)
      : permission.isAutoAcceptingDirectory(sdk().directory)
    showToast({
      title: active
        ? language.t("toast.permissions.autoaccept.on.title")
        : language.t("toast.permissions.autoaccept.off.title"),
      description: active
        ? language.t("toast.permissions.autoaccept.on.description")
        : language.t("toast.permissions.autoaccept.off.description"),
    })
  }

  const undo = async () => {
    const sessionID = params.id
    if (!sessionID) return
    const owner = sessionOwnership.capture()
    const session = sdk().api.session
    const directory = sdk().directory
    const promptSession = prompt.capture()
    const revert = info()?.revert?.messageID
    const messages = userMessages()
    const message = findLast(messages, (x) => !revert || x.id < revert)
    if (!message) return
    const parts = sync().data.part[message.id]

    if (sync().data.session_working(sessionID)) {
      await session.interrupt({ sessionID }).catch(() => {})
    }

    await runCommand({
      owner,
      prompt: promptSession,
      request: () => session.revert.stage({ sessionID, messageID: message.id }),
      updatePrompt: (promptSession) => {
        if (parts) promptSession.set(extractPromptFromParts(parts, { directory }))
      },
      updateViewport: () => setActiveMessage(findLast(messages, (x) => x.id < message.id)),
    })
  }

  const redo = async () => {
    const sessionID = params.id
    if (!sessionID) return
    const owner = sessionOwnership.capture()
    const session = sdk().api.session
    const messages = userMessages()
    const promptSession = prompt.capture()

    const revertMessageID = info()?.revert?.messageID
    if (!revertMessageID) return

    const next = messages.find((x) => x.id > revertMessageID)
    if (!next) {
      await runCommand({
        owner,
        prompt: promptSession,
        request: () => session.revert.clear({ sessionID }),
        updatePrompt: (promptSession) => promptSession.reset(),
        updateViewport: () => setActiveMessage(findLast(messages, (x) => x.id >= revertMessageID)),
      })
      return
    }

    await runCommand({
      owner,
      prompt: promptSession,
      request: () => session.revert.stage({ sessionID, messageID: next.id }),
      updatePrompt: () => undefined,
      updateViewport: () => setActiveMessage(findLast(messages, (x) => x.id < next.id)),
    })
  }

  const compact = async () => {
    const sessionID = params.id
    if (!sessionID) return

    const model = local.model.current()
    if (!model) {
      showToast({
        title: language.t("toast.model.none.title"),
        description: language.t("toast.model.none.description"),
      })
      return
    }

    await sdk().api.session.compact({
      sessionID,
      model: { providerID: model.provider.id, modelID: model.id },
    })
  }

  const fork = () => {
    void openDialog(
      () => import("@/components/dialog-fork"),
      (x) => dialog.show(() => <x.DialogFork />),
    )
  }

  const shareCmds = () => {
    if (sync().data.config.share === "disabled") return []
    return [
      sessionCommand({
        id: "session.share",
        title: info()?.share?.url ? language.t("session.share.copy.copyLink") : language.t("command.session.share"),
        description: info()?.share?.url
          ? language.t("toast.session.share.success.description")
          : language.t("command.session.share.description"),
        slash: "share",
        disabled: !params.id,
        onSelect: share,
      }),
      sessionCommand({
        id: "session.unshare",
        title: language.t("command.session.unshare"),
        description: language.t("command.session.unshare.description"),
        slash: "unshare",
        disabled: !params.id || !info()?.share?.url,
        onSelect: unshare,
      }),
    ]
  }

  const sessionCmds = () => [
    sessionCommand({
      id: "session.new",
      title: language.t("command.session.new"),
      keybind: "mod+shift+s",
      slash: "new",
      onSelect: (source) => {
        if (settings.general.newLayoutDesigns()) {
          command.trigger("tab.new", source)
          return
        }
        navigate(`/${params.dir}/session`)
      },
    }),
    sessionCommand({
      id: "session.undo",
      title: language.t("command.session.undo"),
      description: language.t("command.session.undo.description"),
      slash: "undo",
      disabled: !params.id || visibleUserMessages().length === 0,
      onSelect: undo,
    }),
    sessionCommand({
      id: "session.redo",
      title: language.t("command.session.redo"),
      description: language.t("command.session.redo.description"),
      slash: "redo",
      disabled: !params.id || !info()?.revert?.messageID,
      onSelect: redo,
    }),
    sessionCommand({
      id: "session.compact",
      title: language.t("command.session.compact"),
      description: language.t("command.session.compact.description"),
      slash: "compact",
      disabled: !params.id || visibleUserMessages().length === 0,
      onSelect: compact,
    }),
    sessionCommand({
      id: "session.fork",
      title: language.t("command.session.fork"),
      description: language.t("command.session.fork.description"),
      slash: "fork",
      disabled: !params.id || visibleUserMessages().length === 0,
      onSelect: fork,
    }),
  ]

  const fileCmds = () => {
    const tab = closableTab()
    return [
      fileCommand({
        id: "file.open",
        title: language.t("command.file.open"),
        description: language.t("palette.search.placeholder"),
        keybind: "mod+p",
        slash: "open",
        onSelect: openFile,
      }),
      tab &&
        fileCommand({
          id: "tab.close",
          title: language.t("command.tab.close"),
          keybind: "mod+w",
          onSelect: closeTab,
        }),
    ].filter((v) => !!v)
  }

  const contextCmds = () => [
    contextCommand({
      id: "context.addSelection",
      title: language.t("command.context.addSelection"),
      description: language.t("command.context.addSelection.description"),
      keybind: "mod+shift+l",
      disabled: !canAddSelectionContext(),
      onSelect: addSelection,
    }),
  ]

  const viewCmds = () => [
    viewCommand({
      id: "terminal.toggle",
      title: language.t("command.terminal.toggle"),
      keybind: "ctrl+`",
      slash: "terminal",
      onSelect: () => {
        if (view().terminal.opened()) {
          terminal.cancelFocus()
          view().terminal.close()
          return
        }
        terminal.requestFocus(terminal.active())
        view().terminal.open()
      },
    }),
    viewCommand({
      id: "review.toggle",
      title: language.t("command.review.toggle"),
      keybind: "mod+shift+r",
      onSelect: () => view().reviewPanel.toggle(),
    }),
    ...(shown()
      ? [
          viewCommand({
            id: "fileTree.toggle",
            title: language.t("command.fileTree.toggle"),
            keybind: "mod+\\",
            onSelect: () => layout.fileTree.toggle(),
          }),
        ]
      : []),
    viewCommand({
      id: "input.focus",
      title: language.t("command.input.focus"),
      keybind: "ctrl+l",
      onSelect: focusInput,
    }),
  ]

  const terminalCmds = () => [
    terminalCommand({
      id: "terminal.close",
      title: language.t("terminal.close"),
      keybind: "mod+w",
      hidden: true,
      when: (event) => event.target instanceof Element && !!event.target.closest('[data-component="terminal"]'),
      onSelect: closeTerminal,
    }),
    terminalCommand({
      id: "terminal.new",
      title: language.t("command.terminal.new"),
      description: language.t("command.terminal.new.description"),
      keybind: "ctrl+alt+t",
      onSelect: openTerminal,
    }),
  ]

  const messageCmds = () => [
    sessionCommand({
      id: "message.previous",
      title: language.t("command.message.previous"),
      description: language.t("command.message.previous.description"),
      keybind: "mod+alt+[",
      disabled: !params.id,
      onSelect: () => navigateMessageByOffset(-1),
    }),
    sessionCommand({
      id: "message.next",
      title: language.t("command.message.next"),
      description: language.t("command.message.next.description"),
      keybind: "mod+alt+]",
      disabled: !params.id,
      onSelect: () => navigateMessageByOffset(1),
    }),
  ]

  const mcpCmds = () => [
    mcpCommand({
      id: "mcp.toggle",
      title: language.t("command.mcp.toggle"),
      description: language.t("command.mcp.toggle.description"),
      keybind: "mod+;",
      slash: "mcp",
      onSelect: chooseMcp,
    }),
    // Slash commands ZENKAI en español (acceso rápido a los flujos comunes).
    mcpCommand({
      id: "zenkai.imagen",
      title: "Generar imagen",
      description: "Crear una imagen con SD local o API cloud",
      slash: "imagen",
      onSelect: zenkaiImagen,
    }),
    mcpCommand({
      id: "zenkai.disenos",
      title: "Galería de diseños",
      description: "Plantillas listas para usar como prompt",
      slash: "disenos",
      onSelect: zenkaiDisenos,
    }),
    mcpCommand({
      id: "zenkai.ayuda",
      title: "Guía de uso",
      description: "Cómo usar ZENKAI y qué hace cada zona",
      slash: "ayuda",
      onSelect: zenkaiAyuda,
    }),
    mcpCommand({
      id: "zenkai.que-son-mcp",
      title: "¿Qué son los MCP?",
      description: "Explicación en criollo con ejemplos",
      slash: "que-son-mcp",
      onSelect: zenkaiQueSonMcp,
    }),
    mcpCommand({
      id: "zenkai.observability",
      title: "Observability Center",
      description: "Ver upstreams, latencias, breaker y modelos en vivo",
      slash: "observability",
      onSelect: zenkaiObservability,
    }),
    mcpCommand({
      id: "zenkai.capacidades",
      title: "¿Qué sabe hacer ZENKAI?",
      description: "Ver las capabilities agrupadas por categoría",
      slash: "capacidades",
      onSelect: zenkaiCapacidades,
    }),
    mcpCommand({
      id: "zenkai.evolution",
      title: "Evolution Engine",
      description: "Propuestas de mejora en base al estado real del sistema",
      slash: "evolution",
      onSelect: zenkaiEvolution,
    }),
    mcpCommand({
      id: "zenkai.computer",
      title: "Ver lo que hace la IA en tu PC",
      description: "Computer Viewer con marco naranja REC + screenshot en vivo",
      slash: "computer",
      onSelect: zenkaiComputer,
    }),
    mcpCommand({
      id: "zenkai.parliament",
      title: "AI Parliament · debate 2 modelos",
      description: "Misma pregunta a 2 modelos en paralelo con jurado local",
      slash: "parliament",
      onSelect: zenkaiParliament,
    }),
    mcpCommand({
      id: "zenkai.politicas",
      title: "Policy Engine",
      description: "Reglas declarativas: privacidad, presupuesto, tipo de tarea",
      slash: "politicas",
      onSelect: zenkaiPoliticas,
    }),
    mcpCommand({
      id: "zenkai.digital-twin",
      title: "Digital Twin del proyecto",
      description: "Ficha viva: lenguaje, framework, arquitectura, deps",
      slash: "twin",
      onSelect: zenkaiDigitalTwin,
    }),
    mcpCommand({
      id: "zenkai.estado-integral",
      title: "Estado integral · todo on/off",
      description: "Modelos, MCPs, agentes, upstreams, proveedores nube con estado real",
      slash: "estado",
      onSelect: zenkaiEstadoIntegral,
    }),
    mcpCommand({
      id: "zenkai.setup",
      title: "Setup en un click",
      description: "Escanea PC, sugiere modelo, links a nube gratis, todo en 3 pasos",
      slash: "setup",
      onSelect: zenkaiSetup,
    }),
    mcpCommand({
      id: "zenkai.costs",
      title: "Cost Tracker · @zenkai/core en vivo",
      description: "Gastos USD por provider + health + budget del motor propio",
      slash: "costos",
      onSelect: zenkaiCostTracker,
    }),
    mcpCommand({
      id: "zenkai.reflector",
      title: "Reflector cognitivo",
      description: "Otro modelo re-lee una respuesta, la puntúa y sugiere mejora",
      slash: "reflexionar",
      onSelect: zenkaiReflector,
    }),
    mcpCommand({
      id: "zenkai.repair",
      title: "Auto-repair loop",
      description: "Test → si falla, LLM propone fix → aplica → retesta",
      slash: "reparar",
      onSelect: zenkaiAutoRepair,
    }),
    mcpCommand({
      id: "zenkai.sandbox",
      title: "Cognitive Sandbox",
      description: "Ejecuta código Node/Python/Bash aislado con timeout duro",
      slash: "sandbox",
      onSelect: zenkaiSandbox,
    }),
    mcpCommand({
      id: "zenkai.motor",
      title: "Zenkai Engine (reemplazo Ollama)",
      description: "Descarga y gestiona modelos GGUF con el motor propio, cargar/descargar por demanda",
      slash: "motor",
      onSelect: zenkaiMotor,
    }),
    mcpCommand({
      id: "zenkai.comandos",
      title: "Catálogo de comandos",
      description: "Lista completa de slashes con descripción y ejemplos, agrupados por categoría",
      slash: "comandos",
      onSelect: zenkaiComandos,
    }),
  ]

  const permissionsCmds = () => [
    permissionsCommand({
      id: "permissions.autoaccept",
      title: isAutoAcceptActive()
        ? language.t("command.permissions.autoaccept.disable")
        : language.t("command.permissions.autoaccept.enable"),
      keybind: "mod+shift+a",
      disabled: false,
      onSelect: toggleAutoAccept,
    }),
  ]

  command.register("session", () => [
    ...sessionCmds(),
    ...shareCmds(),
    ...fileCmds(),
    ...contextCmds(),
    ...viewCmds(),
    ...terminalCmds(),
    ...messageCmds(),
    ...mcpCmds(),
    ...permissionsCmds(),
  ])
}
