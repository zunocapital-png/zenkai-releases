import { createSignal, createResource, For, Show, Switch, Match } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
interface MarketplaceEntry {
  id: string
  name: string
  version: string
  description: string
  author: string
  authorUrl?: string
  type: string
  icon?: string
  installs: number
  rating: number
  entry: string
  homepage?: string
  repository?: string
  screenshots?: string[]
  dependencies?: string[]
  changelog?: { version: string; date: string; changes: string }[]
  defaults?: Record<string, unknown>
  configSchema?: Record<string, ConfigField>
}

interface ConfigField {
  label: string
  description?: string
  type: "boolean" | "number" | "string" | string
  default?: unknown
}
import "./plugin-detail.css"

function MarkdownBlock(props: { text: string }) {
  const rendered = () => {
    let html = props.text
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>")
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>")
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>")
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")
    html = html.replace(/`(.+?)`/g, "<code>$1</code>")
    html = html.replace(/\n/g, "<br/>")
    return html
  }

  return <div class="plugin-detail-markdown" innerHTML={rendered()} />
}

function ConfigEditor(props: {
  schema: NonNullable<MarketplaceEntry["configSchema"]>
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  return (
    <div class="plugin-detail-config">
      <For each={Object.entries(props.schema)}>
        {([key, field]) => (
          <div class="plugin-detail-config-row">
            <div class="plugin-detail-config-label">
              <span class="plugin-detail-config-key">{field.label}</span>
              <Show when={field.description}>
                <span class="plugin-detail-config-desc">{field.description}</span>
              </Show>
            </div>
            <div class="plugin-detail-config-control">
              <Switch>
                <Match when={field.type === "boolean"}>
                  <input
                    type="checkbox"
                    checked={Boolean(props.values[key] ?? field.default)}
                    onChange={(e) => props.onChange(key, e.currentTarget.checked)}
                  />
                </Match>
                <Match when={field.type === "number"}>
                  <TextInputV2
                    value={String(props.values[key] ?? field.default ?? "")}
                    onInput={(e) => props.onChange(key, Number(e.currentTarget.value))}
                  />
                </Match>
                <Match when={true}>
                  <TextInputV2
                    value={String(props.values[key] ?? field.default ?? "")}
                    onInput={(e) => props.onChange(key, e.currentTarget.value)}
                  />
                </Match>
              </Switch>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

export function PluginDetail(props: {
  pluginId: string
  onBack?: () => void
  onInstall?: (id: string) => void
  onUninstall?: (id: string) => void
}) {
  const [configValues, setConfigValues] = createSignal<Record<string, unknown>>({})
  const [activeSection, setActiveSection] = createSignal<"overview" | "versions" | "config">("overview")

  const [plugin] = createResource(
    () => props.pluginId,
    async () => {
      return null as MarketplaceEntry | null
    },
  )

  const [installedManifests] = createResource(async () => {
    return [] as { id: string }[]
  })

  const [savedConfig] = createResource(
    () => props.pluginId,
    async () => {
      return {} as Record<string, unknown>
    },
  )

  const isInstalled = () => {
    const manifests = installedManifests()
    if (!manifests) return false
    return manifests.some((m) => m.id === props.pluginId)
  }

  const handleConfigChange = async (key: string, value: unknown) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }))
    void key
    void value
  }

  return (
    <div data-component="plugin-detail">
      <div data-slot="plugin-detail-nav">
        <button class="plugin-detail-back" onClick={props.onBack}>
          <Icon name="chevron-down" style={{ transform: "rotate(90deg)" }} />
          <span>Back</span>
        </button>
      </div>

      <Show when={plugin.loading}>
        <div class="plugin-detail-loading">
          <div class="plugin-detail-spinner" />
        </div>
      </Show>

      <Show when={plugin() && !plugin.loading}>
        {(() => {
          const p = () => plugin()!
          return (
            <>
              <div data-slot="plugin-detail-header">
                <div class="plugin-detail-icon">
                  <Icon name={p().icon ?? "grid-plus"} size="large" />
                </div>
                <div class="plugin-detail-info">
                  <h2 class="plugin-detail-name">{p().name}</h2>
                  <div class="plugin-detail-author-row">
                    <span class="plugin-detail-author">{p().author}</span>
                    <Tag variant="neutral">{p().type}</Tag>
                    <Tag variant="accent">v{p().version}</Tag>
                  </div>
                  <div class="plugin-detail-stats-row">
                    <span>{p().installs.toLocaleString()} installs</span>
                    <span>Rating: {p().rating.toFixed(1)}/5</span>
                  </div>
                </div>
                <div class="plugin-detail-action">
                  <Show
                    when={isInstalled()}
                    fallback={
                      <ButtonV2 variant="contrast" onClick={() => props.onInstall?.(p().id)}>
                        Install
                      </ButtonV2>
                    }
                  >
                    <ButtonV2 variant="danger" onClick={() => props.onUninstall?.(p().id)}>
                      Uninstall
                    </ButtonV2>
                  </Show>
                </div>
              </div>

              <div data-slot="plugin-detail-section-tabs">
                <button
                  class="plugin-detail-section-tab"
                  classList={{ "plugin-detail-section-tab-active": activeSection() === "overview" }}
                  onClick={() => setActiveSection("overview")}
                >
                  Overview
                </button>
                <button
                  class="plugin-detail-section-tab"
                  classList={{ "plugin-detail-section-tab-active": activeSection() === "versions" }}
                  onClick={() => setActiveSection("versions")}
                >
                  Version History
                </button>
                <Show when={p().configSchema && Object.keys(p().configSchema!).length > 0}>
                  <button
                    class="plugin-detail-section-tab"
                    classList={{ "plugin-detail-section-tab-active": activeSection() === "config" }}
                    onClick={() => setActiveSection("config")}
                  >
                    Configuration
                  </button>
                </Show>
              </div>

              <div data-slot="plugin-detail-body">
                <Switch>
                  <Match when={activeSection() === "overview"}>
                    <MarkdownBlock text={p().description} />

                    <Show when={p().screenshots && p().screenshots!.length > 0}>
                      <div class="plugin-detail-screenshots">
                        <h3 class="plugin-detail-section-title">Screenshots</h3>
                        <div class="plugin-detail-screenshots-grid">
                          <For each={p().screenshots}>
                            {(src) => (
                              <img class="plugin-detail-screenshot" src={src} alt="Plugin screenshot" loading="lazy" />
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={p().dependencies && p().dependencies!.length > 0}>
                      <div class="plugin-detail-deps">
                        <h3 class="plugin-detail-section-title">Dependencies</h3>
                        <div class="plugin-detail-deps-list">
                          <For each={p().dependencies}>
                            {(dep) => <Tag variant="neutral">{dep}</Tag>}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={p().homepage || p().repository}>
                      <div class="plugin-detail-links">
                        <h3 class="plugin-detail-section-title">Links</h3>
                        <Show when={p().homepage}>
                          <a class="plugin-detail-link" href={p().homepage} target="_blank" rel="noopener noreferrer">
                            Homepage
                          </a>
                        </Show>
                        <Show when={p().repository}>
                          <a class="plugin-detail-link" href={p().repository} target="_blank" rel="noopener noreferrer">
                            Repository
                          </a>
                        </Show>
                      </div>
                    </Show>
                  </Match>

                  <Match when={activeSection() === "versions"}>
                    <Show
                      when={p().changelog && p().changelog!.length > 0}
                      fallback={<div class="plugin-detail-empty">No version history available</div>}
                    >
                      <div class="plugin-detail-changelog">
                        <For each={p().changelog}>
                          {(entry) => (
                            <div class="plugin-detail-version-entry">
                              <div class="plugin-detail-version-header">
                                <Tag variant="accent">v{entry.version}</Tag>
                                <span class="plugin-detail-version-date">{entry.date}</span>
                              </div>
                              <div class="plugin-detail-version-changes">{entry.changes}</div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Match>

                  <Match when={activeSection() === "config"}>
                    <Show when={p().configSchema}>
                      <ConfigEditor
                        schema={p().configSchema!}
                        values={{ ...(savedConfig() ?? {}), ...configValues() }}
                        onChange={handleConfigChange}
                      />
                    </Show>
                  </Match>
                </Switch>
              </div>
            </>
          )
        })()}
      </Show>

      <Show when={!plugin() && !plugin.loading}>
        <div class="plugin-detail-empty">Plugin not found</div>
      </Show>
    </div>
  )
}
