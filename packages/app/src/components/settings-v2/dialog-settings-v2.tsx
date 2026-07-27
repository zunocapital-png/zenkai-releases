import { Component, createMemo, createSignal, lazy, startTransition } from "solid-js"
import { Dialog } from "@opencode-ai/ui/v2/dialog-v2"
import { TabsV2 } from "@opencode-ai/ui/v2/tabs-v2"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneralV2 } from "./general"
import { SettingsProvidersV2 } from "./providers"
import { SettingsModelsV2 } from "./models"
import "./settings-v2.css"
import { SettingsServersV2 } from "./servers"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLayout } from "@/context/layout"
import { useTabs } from "@/context/tabs"
import { useServerSync } from "@/context/server-sync"

const LazyThemeEditor = lazy(() => import("@/components/theme-editor").then((m) => ({ default: m.ThemeEditor })))
const LazyKeyboardShortcuts = lazy(() => import("@/components/keyboard-shortcuts").then((m) => ({ default: m.KeyboardShortcuts })))
const LazyPluginMarketplace = lazy(() => import("@/components/plugin-marketplace").then((m) => ({ default: m.PluginMarketplace })))
const LazyPerformanceMonitor = lazy(() => import("@/components/performance-monitor").then((m) => ({ default: m.PerformanceMonitor })))

export const DialogSettings: Component<{
  sessionID?: string
  defaultValue?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const layout = useLayout()
  const tabs = useTabs()
  const serverSync = useServerSync()
  const [tab, setTab] = createSignal(props.defaultValue ?? "general")
  const directory = createMemo(() => {
    const route = layout.route()
    if (route.type === "dir-new-sesssion") return route.dir
    if (route.type === "draft") {
      const draft = tabs.store.find((item) => item.type === "draft" && item.draftID === route.draftID)
      return draft?.type === "draft" ? draft.directory : undefined
    }
    if (route.type === "session") return serverSync().session.get(route.sessionId)?.directory
    return undefined
  })

  const showProviders = () => {
    void dialog.show(() => <DialogSettings sessionID={props.sessionID} defaultValue="providers" />)
  }

  return (
    <Dialog size="x-large" variant="settings" class="settings-v2-dialog">
      <TabsV2
        orientation="vertical"
        variant="settings"
        value={tab()}
        onChange={(value) => void startTransition(() => setTab(value))}
        class="settings-v2"
      >
        <TabsV2.List>
          <div class="flex flex-col justify-between h-full w-full">
            <div class="flex flex-col gap-3 w-full">
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.desktop")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1.5 w-full">
                    <TabsV2.Trigger value="general">
                      <Icon name="sliders" />
                      {language.t("settings.tab.general")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="shortcuts">
                      <Icon name="keyboard" />
                      {language.t("settings.tab.shortcuts")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="themes">
                      <Icon name="palette" />
                      Themes
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="plugins">
                      <Icon name="puzzle" />
                      Plugins
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="performance">
                      <Icon name="gauge" />
                      Performance
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="about">
                      <Icon name="info" />
                      About
                    </TabsV2.Trigger>
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.server")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1.5 w-full">
                    <TabsV2.Trigger value="servers">
                      <Icon name="server" />
                      {language.t("status.popover.tab.servers")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="providers">
                      <Icon name="providers" />
                      {language.t("settings.providers.title")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="models">
                      <Icon name="models" />
                      {language.t("settings.models.title")}
                    </TabsV2.Trigger>
                  </div>
                </div>
              </div>
            </div>
            <div class="settings-v2-nav-footer">
              <span>{language.t("app.name.desktop")}</span>
              <span>v{platform.version}</span>
              <span class="text-[10px] opacity-50 mt-1">Zuno Company - Maycol Velazquez</span>
            </div>
          </div>
        </TabsV2.List>
        <TabsV2.Content value="general" class="settings-v2-panel">
          <SettingsGeneralV2 sessionID={props.sessionID} />
        </TabsV2.Content>
        <TabsV2.Content value="shortcuts" class="settings-v2-panel">
          <LazyKeyboardShortcuts />
        </TabsV2.Content>
        <TabsV2.Content value="servers" class="settings-v2-panel">
          <SettingsServersV2 />
        </TabsV2.Content>
        <TabsV2.Content value="providers" class="settings-v2-panel">
          <SettingsProvidersV2 directory={directory} onBack={showProviders} />
        </TabsV2.Content>
        <TabsV2.Content value="models" class="settings-v2-panel">
          <SettingsModelsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="themes" class="settings-v2-panel">
          <LazyThemeEditor />
        </TabsV2.Content>
        <TabsV2.Content value="plugins" class="settings-v2-panel">
          <LazyPluginMarketplace />
        </TabsV2.Content>
        <TabsV2.Content value="performance" class="settings-v2-panel">
          <LazyPerformanceMonitor />
        </TabsV2.Content>
        <TabsV2.Content value="about" class="settings-v2-panel">
          <div class="flex flex-col items-center gap-6 py-8 px-4">
            <h1
              class="text-4xl font-black tracking-[0.15em] uppercase"
              style={{
                background: "linear-gradient(135deg, #EC5B2B 0%, #EE7948 50%, #EC5B2B 100%)",
                "-webkit-background-clip": "text",
                "-webkit-text-fill-color": "transparent",
                "background-clip": "text",
              }}
            >
              ZENKAI
            </h1>
            <p class="text-sm text-[var(--v2-text-text-muted)]">AI Coding Assistant</p>
            <p class="text-xs text-[var(--v2-text-text-base)]">v{platform.version}</p>
            <div class="w-full max-w-sm border-t border-[var(--v2-border-border-base)] pt-4 mt-2">
              <div class="flex flex-col gap-3 text-center">
                <div>
                  <p class="text-sm font-semibold text-[var(--v2-text-text-strong)]">Zuno Company</p>
                  <p class="text-xs text-[var(--v2-text-text-muted)]">Creador: Maycol Velazquez</p>
                </div>
                <div class="text-xs text-[var(--v2-text-text-muted)] space-y-1">
                  <p>Licencia: MIT</p>
                  <p>Especializado en programacion con IA</p>
                </div>
              </div>
            </div>
            <div class="w-full max-w-sm border-t border-[var(--v2-border-border-base)] pt-4">
              <p class="text-[10px] text-[var(--v2-text-text-muted)] text-center leading-relaxed">
                Zenkai es una herramienta de asistencia de codigo potenciada por inteligencia artificial.
                Creada para programadores que necesitan un copiloto local, privado y sin limites.
              </p>
            </div>
          </div>
        </TabsV2.Content>
      </TabsV2>
    </Dialog>
  )
}
