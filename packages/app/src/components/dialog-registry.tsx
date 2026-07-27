import type { useDialog } from "@opencode-ai/ui/context/dialog"

type DialogContext = ReturnType<typeof useDialog>

export function openGitPanel(dialog: DialogContext) {
  void import("@/components/git-panel").then((x) => {
    dialog.show(() => <x.GitPanel />)
  })
}

export function openDebugPanel(dialog: DialogContext) {
  void import("@/components/debug-panel").then((x) => {
    dialog.show(() => <x.DebugPanel />)
  })
}

export function openCollabPanel(dialog: DialogContext) {
  void import("@/components/collab-panel").then((x) => {
    dialog.show(() => <x.CollabPanel />)
  })
}

export function openSessionExport(dialog: DialogContext) {
  void import("@/components/session-export").then((x) => {
    dialog.show(() => <x.SessionExport />)
  })
}

export function openCodeSnippets(dialog: DialogContext) {
  void import("@/components/code-snippets").then((x) => {
    dialog.show(() => <x.CodeSnippets snippets={[]} />)
  })
}

export function openSmartContext(dialog: DialogContext) {
  void import("@/components/smart-context-panel").then((x) => {
    dialog.show(() => <x.SmartContextPanel items={[]} totalTokens={0} maxTokens={128000} />)
  })
}

export function openErrorAnalyzer(dialog: DialogContext) {
  void import("@/components/error-analyzer").then((x) => {
    dialog.show(() => <x.ErrorAnalyzer error="" />)
  })
}

export function openPluginMarketplace(dialog: DialogContext) {
  void import("@/components/plugin-marketplace").then((x) => {
    dialog.show(() => <x.PluginMarketplace />)
  })
}

export function openPerformanceMonitor(dialog: DialogContext) {
  void import("@/components/performance-monitor").then((x) => {
    dialog.show(() => <x.PerformanceMonitor />)
  })
}

export function openPluginDetail(dialog: DialogContext, pluginId: string) {
  void import("@/components/plugin-detail").then((x) => {
    dialog.show(() => <x.PluginDetail pluginId={pluginId} />)
  })
}
