import { createSignal, createResource, createMemo, For, Show, Switch, Match } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { Switch as Toggle } from "@opencode-ai/ui/v2/switch-v2"
type MarketplaceCategory = "all" | "tool" | "theme" | "agent" | "provider" | "language"

interface MarketplaceEntry {
  id: string
  name: string
  version: string
  description: string
  author: string
  authorUrl?: string
  type: MarketplaceCategory
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
}
import "./plugin-marketplace.css"

type PluginStatus = "not-installed" | "installed" | "update-available"

interface InstalledState {
  [id: string]: { enabled: boolean; version: string }
}

const CATEGORY_TABS: { id: MarketplaceCategory | "installed"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tool", label: "Tools" },
  { id: "theme", label: "Themes" },
  { id: "agent", label: "Agents" },
  { id: "provider", label: "Providers" },
  { id: "language", label: "Languages" },
  { id: "installed", label: "Installed" },
]

function StarRating(props: { rating: number }) {
  const full = () => Math.floor(props.rating)
  const hasHalf = () => props.rating - full() >= 0.3
  const empty = () => 5 - full() - (hasHalf() ? 1 : 0)

  return (
    <div class="marketplace-stars" aria-label={`${props.rating} out of 5 stars`}>
      <For each={Array(full()).fill(0)}>{() => <span class="marketplace-star marketplace-star-full" />}</For>
      <Show when={hasHalf()}>
        <span class="marketplace-star marketplace-star-half" />
      </Show>
      <For each={Array(empty()).fill(0)}>{() => <span class="marketplace-star marketplace-star-empty" />}</For>
      <span class="marketplace-rating-value">{props.rating.toFixed(1)}</span>
    </div>
  )
}

function formatInstalls(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`
  return count.toString()
}

function PluginCard(props: {
  entry: MarketplaceEntry
  status: PluginStatus
  enabled: boolean
  onInstall: () => void
  onUninstall: () => void
  onUpdate: () => void
  onToggle: (enabled: boolean) => void
  onSelect: () => void
}) {
  return (
    <div class="marketplace-card" onClick={props.onSelect}>
      <div class="marketplace-card-header">
        <div class="marketplace-card-icon">
          <Icon name={props.entry.icon ?? "grid-plus"} size="large" />
        </div>
        <div class="marketplace-card-meta">
          <div class="marketplace-card-title">{props.entry.name}</div>
          <div class="marketplace-card-author">{props.entry.author}</div>
        </div>
        <Tag variant={props.status === "installed" ? "accent" : "neutral"}>
          v{props.entry.version}
        </Tag>
      </div>
      <div class="marketplace-card-description">{props.entry.description}</div>
      <div class="marketplace-card-footer">
        <div class="marketplace-card-stats">
          <StarRating rating={props.entry.rating} />
          <span class="marketplace-card-installs">{formatInstalls(props.entry.installs)} installs</span>
        </div>
        <div class="marketplace-card-actions" onClick={(e) => e.stopPropagation()}>
          <Switch>
            <Match when={props.status === "not-installed"}>
              <ButtonV2 size="small" variant="contrast" onClick={props.onInstall}>
                Install
              </ButtonV2>
            </Match>
            <Match when={props.status === "update-available"}>
              <ButtonV2 size="small" variant="contrast" onClick={props.onUpdate}>
                Update
              </ButtonV2>
              <ButtonV2 size="small" variant="ghost-muted" onClick={props.onUninstall}>
                Uninstall
              </ButtonV2>
            </Match>
            <Match when={props.status === "installed"}>
              <Toggle checked={props.enabled} onChange={props.onToggle} hideLabel>
                Enabled
              </Toggle>
              <ButtonV2 size="small" variant="ghost-muted" onClick={props.onUninstall}>
                Uninstall
              </ButtonV2>
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  )
}

export function PluginMarketplace(props: {
  onSelectPlugin?: (id: string) => void
}) {
  const [query, setQuery] = createSignal("")
  const [activeTab, setActiveTab] = createSignal<MarketplaceCategory | "installed">("all")
  const [installed, setInstalled] = createSignal<InstalledState>({})
  const [loadingId, setLoadingId] = createSignal<string | null>(null)

  const DEMO_PLUGINS: MarketplaceEntry[] = [
    { id: "context7", name: "Context7", version: "1.0.0", description: "Up-to-date docs for any library via MCP", author: "Context7", type: "tool", installs: 12500, rating: 4.8, entry: "index.js" },
    { id: "web-search", name: "Web Search", version: "1.0.0", description: "DuckDuckGo search integration", author: "Zenkai", type: "tool", installs: 9800, rating: 4.6, entry: "index.js" },
    { id: "git-tools", name: "Git Tools", version: "1.0.0", description: "Advanced git operations", author: "Zenkai", type: "tool", installs: 8200, rating: 4.7, entry: "index.js" },
    { id: "dark-pro", name: "Dark Pro Theme", version: "1.0.0", description: "Professional dark theme", author: "Zuno Company", type: "theme", installs: 5400, rating: 4.5, entry: "index.js" },
    { id: "code-agent", name: "Code Agent", version: "1.0.0", description: "Autonomous coding agent", author: "Zenkai", type: "agent", installs: 7100, rating: 4.9, entry: "index.js" },
    { id: "python-lsp", name: "Python LSP", version: "1.0.0", description: "Python language server integration", author: "Community", type: "language", installs: 6300, rating: 4.4, entry: "index.js" },
  ]

  const [plugins, { refetch }] = createResource(
    () => ({ q: query(), cat: activeTab() }),
    async (params) => {
      let results = [...DEMO_PLUGINS]
      if (params.cat !== "all" && params.cat !== "installed") {
        results = results.filter((e) => e.type === params.cat)
      }
      if (params.cat === "installed") {
        results = results.filter((e) => installed()[e.id])
      }
      if (params.q) {
        const q = params.q.toLowerCase()
        results = results.filter((e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
      }
      return results
    },
  )

  const [updates] = createResource(async () => {
    return [] as { id: string; hasUpdate: boolean }[]
  })

  const pluginStatus = (id: string): PluginStatus => {
    const inst = installed()
    if (!inst[id]) {
      const upds = updates()
      if (upds?.some((u) => u.id === id)) return "installed"
      return "not-installed"
    }
    const upd = updates()?.find((u) => u.id === id)
    if (upd?.hasUpdate) return "update-available"
    return "installed"
  }

  const handleInstall = async (id: string) => {
    setLoadingId(id)
    const ok = true
    if (ok) {
      setInstalled((prev) => ({ ...prev, [id]: { enabled: true, version: "" } }))
      refetch()
    }
    setLoadingId(null)
  }

  const handleUninstall = async (id: string) => {
    setLoadingId(id)
    const ok2 = true
    if (ok2) {
      setInstalled((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      refetch()
    }
    setLoadingId(null)
  }

  const handleToggle = (id: string, enabled: boolean) => {
    setInstalled((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled },
    }))
  }

  const filteredPlugins = createMemo(() => plugins() ?? [])

  return (
    <div data-component="plugin-marketplace">
      <div data-slot="marketplace-header">
        <h2 class="marketplace-title">Plugin Marketplace</h2>
        <div class="marketplace-search">
          <TextInputV2
            placeholder="Search plugins..."
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
      </div>

      <div data-slot="marketplace-tabs">
        <For each={CATEGORY_TABS}>
          {(tab) => (
            <button
              class="marketplace-tab"
              classList={{ "marketplace-tab-active": activeTab() === tab.id }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <div data-slot="marketplace-content">
        <Show when={plugins.loading}>
          <div class="marketplace-loading">
            <div class="marketplace-spinner" />
            <span>Loading plugins...</span>
          </div>
        </Show>

        <Show when={!plugins.loading && filteredPlugins().length === 0}>
          <div class="marketplace-empty">
            <Icon name="grid-plus" size="large" />
            <span>
              {activeTab() === "installed"
                ? "No plugins installed yet"
                : query()
                  ? `No plugins found for "${query()}"`
                  : "No plugins available in this category"}
            </span>
          </div>
        </Show>

        <Show when={!plugins.loading && filteredPlugins().length > 0}>
          <div class="marketplace-grid">
            <For each={filteredPlugins()}>
              {(entry) => (
                <PluginCard
                  entry={entry}
                  status={pluginStatus(entry.id)}
                  enabled={installed()[entry.id]?.enabled ?? true}
                  onInstall={() => handleInstall(entry.id)}
                  onUninstall={() => handleUninstall(entry.id)}
                  onUpdate={() => handleInstall(entry.id)}
                  onToggle={(v) => handleToggle(entry.id, v)}
                  onSelect={() => props.onSelectPlugin?.(entry.id)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
