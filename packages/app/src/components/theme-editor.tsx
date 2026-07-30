import { Component, createSignal, createEffect, For, Show } from "solid-js"

interface ThemeColors {
  primary: string
  secondary: string
  background: string
  foreground: string
  accent: string
  error: string
  warning: string
  success: string
}

interface ThemeConfig {
  name: string
  colors: ThemeColors
  fontSize: number
  fontFamily: string
  borderRadius: number
}

const PRESET_THEMES: ThemeConfig[] = [
  {
    name: "Zenkai Orange",
    colors: { primary: "#EC5B2B", secondary: "#1a1a2e", background: "#0f0f17", foreground: "#e4e4e7", accent: "#EC5B2B", error: "#ef4444", warning: "#f59e0b", success: "#22c55e" },
    fontSize: 14,
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: 8,
  },
  {
    name: "Dark Midnight",
    colors: { primary: "#6366f1", secondary: "#1e1b4b", background: "#020617", foreground: "#e2e8f0", accent: "#818cf8", error: "#f87171", warning: "#fbbf24", success: "#34d399" },
    fontSize: 14,
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: 8,
  },
  {
    name: "Light Clean",
    colors: { primary: "#EC5B2B", secondary: "#f1f5f9", background: "#ffffff", foreground: "#1e293b", accent: "#EC5B2B", error: "#dc2626", warning: "#d97706", success: "#16a34a" },
    fontSize: 14,
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: 8,
  },
  {
    name: "Dracula",
    colors: { primary: "#bd93f9", secondary: "#44475a", background: "#282a36", foreground: "#f8f8f2", accent: "#ff79c6", error: "#ff5555", warning: "#f1fa8c", success: "#50fa7b" },
    fontSize: 14,
    fontFamily: "'Fira Code', monospace",
    borderRadius: 6,
  },
  {
    name: "Nord",
    colors: { primary: "#88c0d0", secondary: "#3b4252", background: "#2e3440", foreground: "#eceff4", accent: "#81a1c1", error: "#bf616a", warning: "#ebcb8b", success: "#a3be8c" },
    fontSize: 14,
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: 6,
  },
  {
    name: "Solarized",
    colors: { primary: "#268bd2", secondary: "#073642", background: "#002b36", foreground: "#839496", accent: "#2aa198", error: "#dc322f", warning: "#b58900", success: "#859900" },
    fontSize: 14,
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: 4,
  },
]

const COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "background", label: "Background" },
  { key: "foreground", label: "Foreground" },
  { key: "accent", label: "Accent" },
  { key: "error", label: "Error" },
  { key: "warning", label: "Warning" },
  { key: "success", label: "Success" },
]

const FONT_FAMILIES = [
  "Inter, system-ui, sans-serif",
  "'Fira Code', monospace",
  "'JetBrains Mono', monospace",
  "'Source Code Pro', monospace",
  "system-ui, sans-serif",
  "Georgia, serif",
]

export const ThemeEditor: Component<{
  onSave?: (theme: ThemeConfig) => void
  onExport?: (json: string) => void
  onImport?: (json: string) => void
  initialTheme?: ThemeConfig
}> = (props) => {
  const [theme, setTheme] = createSignal<ThemeConfig>(props.initialTheme ?? PRESET_THEMES[0])
  const [customName, setCustomName] = createSignal("")
  const [importText, setImportText] = createSignal("")
  const [showImport, setShowImport] = createSignal(false)

  const updateColor = (key: keyof ThemeColors, value: string) => {
    setTheme((prev) => ({ ...prev, colors: { ...prev.colors, [key]: value } }))
  }

  const applyPreset = (preset: ThemeConfig) => {
    setTheme({ ...preset })
  }

  const exportTheme = () => {
    const json = JSON.stringify(theme(), null, 2)
    props.onExport?.(json)
    navigator.clipboard.writeText(json)
  }

  const importTheme = () => {
    try {
      const parsed = JSON.parse(importText()) as ThemeConfig
      if (parsed.colors && parsed.fontSize && parsed.fontFamily) {
        setTheme(parsed)
        props.onImport?.(importText())
        setShowImport(false)
        setImportText("")
      }
    } catch {
      /* invalid json */
    }
  }

  const saveCustom = () => {
    const name = customName().trim() || "Custom Theme"
    const t = { ...theme(), name }
    props.onSave?.(t)
  }

  createEffect(() => {
    const t = theme()
    const root = document.documentElement
    root.style.setProperty("--zenkai-preview-primary", t.colors.primary)
    root.style.setProperty("--zenkai-preview-bg", t.colors.background)
    root.style.setProperty("--zenkai-preview-fg", t.colors.foreground)
    root.style.setProperty("--zenkai-preview-accent", t.colors.accent)
  })

  return (
    <div class="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div class="text-lg font-semibold text-[var(--v2-text-text-base)]">Theme Editor</div>

      <div class="flex flex-col gap-2">
        <div class="text-xs font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)]">Presets</div>
        <div class="grid grid-cols-3 gap-2">
          <For each={PRESET_THEMES}>
            {(preset) => (
              <button
                class="flex flex-col items-center gap-1.5 rounded-lg border border-[var(--v2-border-border-muted)] p-3 transition-colors hover:border-[#EC5B2B]"
                classList={{ "border-[#EC5B2B] bg-[var(--v2-overlay-simple-overlay-hover)]": theme().name === preset.name }}
                onClick={() => applyPreset(preset)}
              >
                <div class="flex gap-1">
                  <div class="h-4 w-4 rounded-full" style={{ background: preset.colors.primary }} />
                  <div class="h-4 w-4 rounded-full" style={{ background: preset.colors.background }} />
                  <div class="h-4 w-4 rounded-full" style={{ background: preset.colors.accent }} />
                </div>
                <span class="text-xs text-[var(--v2-text-text-muted)]">{preset.name}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <div class="text-xs font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)]">Colors</div>
        <div class="grid grid-cols-2 gap-3">
          <For each={COLOR_FIELDS}>
            {(field) => (
              <div class="flex items-center gap-3">
                <input
                  type="color"
                  value={theme().colors[field.key]}
                  onInput={(e) => updateColor(field.key, e.currentTarget.value)}
                  class="h-8 w-8 cursor-pointer rounded border border-[var(--v2-border-border-muted)] bg-transparent"
                />
                <div class="flex flex-col">
                  <span class="text-sm text-[var(--v2-text-text-base)]">{field.label}</span>
                  <span class="text-[11px] text-[var(--v2-text-text-muted)]">{theme().colors[field.key]}</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Fuente y tamaño se manejan en Ajustes → General (evitamos duplicado con Themes).
          Acá solo dejamos radio de borde, que es específico del theme (no de la fuente global). */}
      <div class="flex flex-col gap-3">
        <div class="text-xs font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)]">Estilo</div>
        <div class="flex items-center gap-3">
          <label class="text-sm text-[var(--v2-text-text-muted)]">Border Radius</label>
          <input
            type="range"
            min={0}
            max={20}
            value={theme().borderRadius}
            onInput={(e) => setTheme((prev) => ({ ...prev, borderRadius: parseInt(e.currentTarget.value) }))}
            class="flex-1 accent-[#EC5B2B]"
          />
          <span class="w-10 text-right text-sm text-[var(--v2-text-text-base)]">{theme().borderRadius}px</span>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div class="text-xs font-medium uppercase tracking-wider text-[var(--v2-text-text-faint)]">Preview</div>
        <div
          class="rounded-lg border border-[var(--v2-border-border-muted)] p-4"
          style={{
            background: theme().colors.background,
            color: theme().colors.foreground,
            "font-family": theme().fontFamily,
            "font-size": `${theme().fontSize}px`,
            "border-radius": `${theme().borderRadius}px`,
          }}
        >
          <div style={{ color: theme().colors.primary, "font-weight": "600", "margin-bottom": "8px" }}>Zenkai AI Assistant</div>
          <div style={{ "margin-bottom": "8px" }}>This is how your theme will look.</div>
          <div class="flex gap-2">
            <span class="rounded px-2 py-0.5 text-xs text-white" style={{ background: theme().colors.success, "border-radius": `${theme().borderRadius / 2}px` }}>Success</span>
            <span class="rounded px-2 py-0.5 text-xs text-white" style={{ background: theme().colors.warning, "border-radius": `${theme().borderRadius / 2}px` }}>Warning</span>
            <span class="rounded px-2 py-0.5 text-xs text-white" style={{ background: theme().colors.error, "border-radius": `${theme().borderRadius / 2}px` }}>Error</span>
            <span class="rounded px-2 py-0.5 text-xs text-white" style={{ background: theme().colors.accent, "border-radius": `${theme().borderRadius / 2}px` }}>Accent</span>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <input
            type="text"
            placeholder="Custom theme name..."
            value={customName()}
            onInput={(e) => setCustomName(e.currentTarget.value)}
            class="flex-1 rounded-lg border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-base)] px-3 py-2 text-sm text-[var(--v2-text-text-base)] placeholder:text-[var(--v2-text-text-faint)] outline-none"
          />
          <button
            onClick={saveCustom}
            class="rounded-lg bg-[#EC5B2B] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Save Custom Theme
          </button>
        </div>
        <div class="flex gap-2">
          <button
            onClick={exportTheme}
            class="rounded-lg border border-[var(--v2-border-border-muted)] px-3 py-1.5 text-sm text-[var(--v2-text-text-muted)] transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]"
          >
            Export JSON
          </button>
          <button
            onClick={() => setShowImport((v) => !v)}
            class="rounded-lg border border-[var(--v2-border-border-muted)] px-3 py-1.5 text-sm text-[var(--v2-text-text-muted)] transition-colors hover:bg-[var(--v2-overlay-simple-overlay-hover)]"
          >
            Import JSON
          </button>
        </div>
        <Show when={showImport()}>
          <div class="flex gap-2">
            <textarea
              value={importText()}
              onInput={(e) => setImportText(e.currentTarget.value)}
              placeholder="Paste theme JSON here..."
              class="flex-1 rounded-lg border border-[var(--v2-border-border-muted)] bg-[var(--v2-background-bg-base)] px-3 py-2 text-sm text-[var(--v2-text-text-base)] placeholder:text-[var(--v2-text-text-faint)] outline-none"
              rows={4}
            />
            <button
              onClick={importTheme}
              class="self-end rounded-lg bg-[#EC5B2B] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Apply
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}
