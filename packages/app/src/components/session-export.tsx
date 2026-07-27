import { type Component, createMemo, createSignal, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useParams } from "@solidjs/router"
import { useSync } from "@/context/sync"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { showToast } from "@/utils/toast"
import type { TextPart as SDKTextPart } from "@opencode-ai/sdk/v2/client"

type ExportFormat = "zenkai-session" | "markdown" | "json"

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([A-Za-z0-9_\-]{16,})['"]?/gi,
  /(?:secret|token|password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi,
  /(?:sk|pk)[-_](?:live|test|prod)[-_][A-Za-z0-9]{16,}/gi,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g,
  /xox[bporsca]-[A-Za-z0-9\-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /Bearer\s+[A-Za-z0-9_\-.]{20,}/gi,
]

function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    result = result.replace(pattern, "[REDACTED]")
  }
  return result
}

export const SessionExport: Component = () => {
  const params = useParams()
  const sync = useSync()
  const dialog = useDialog()

  const [format, setFormat] = createSignal<ExportFormat>("zenkai-session")
  const [options, setOptions] = createStore({
    includeResponses: true,
    includeToolOutputs: false,
    includeFileChanges: false,
    includeTimestamps: true,
    redactSecrets: true,
  })
  const [isExporting, setIsExporting] = createSignal(false)

  const currentSession = createMemo(() => {
    const id = params.id
    if (!id) return null
    const sessions = sync().data.session ?? []
    return sessions.find((s) => s.id === id) ?? null
  })

  const sessionMessages = createMemo(() => {
    const id = params.id
    if (!id) return []
    return sync().data.message[id] ?? []
  })

  const estimatedSize = createMemo(() => {
    const msgs = sessionMessages()
    let size = 0
    for (const msg of msgs) {
      if (!options.includeResponses && msg.role === "assistant") continue
      const parts = sync().data.part[msg.id] ?? []
      for (const part of parts) {
        if (part.type === "text") size += ((part as SDKTextPart).text ?? "").length
        if (part.type === "tool" && options.includeToolOutputs) size += 500
      }
    }
    size += 200
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  })

  const buildExport = (): { content: string; filename: string; mime: string } => {
    const session = currentSession()
    if (!session) throw new Error("No session")

    const msgs = sessionMessages()
    const title = session.title.replace(/[^a-zA-Z0-9-_]/g, "_")

    const processText = (text: string) => (options.redactSecrets ? redactSecrets(text) : text)

    if (format() === "markdown") {
      const lines: string[] = []
      lines.push(`# ${session.title}`)
      lines.push("")
      lines.push(`*Exported from Zenkai on ${new Date().toISOString()}*`)
      lines.push("")
      lines.push("---")
      lines.push("")

      for (const msg of msgs) {
        if (!options.includeResponses && msg.role === "assistant") continue
        const parts = sync().data.part[msg.id] ?? []
        const textParts = parts.filter((p): p is SDKTextPart => p.type === "text" && !p.synthetic)
        const text = processText(textParts.map((p) => p.text).join("\n"))
        if (!text.trim()) continue

        const role = msg.role === "user" ? "User" : "Assistant"
        if (options.includeTimestamps) {
          lines.push(`### ${role} — ${new Date(msg.time.created).toLocaleString()}`)
        } else {
          lines.push(`### ${role}`)
        }
        lines.push("")
        lines.push(text)
        lines.push("")
        lines.push("---")
        lines.push("")
      }

      return { content: lines.join("\n"), filename: `${title}.md`, mime: "text/markdown" }
    }

    const exportMessages = msgs
      .filter((m) => options.includeResponses || m.role === "user")
      .map((m) => {
        const parts = sync().data.part[m.id] ?? []
        const textParts = parts.filter((p): p is SDKTextPart => p.type === "text" && !p.synthetic)
        return {
          id: m.id,
          role: m.role,
          content: processText(textParts.map((p) => p.text).join("\n")),
          time: options.includeTimestamps ? m.time.created : undefined,
          agent: m.agent,
          model: m.model,
        }
      })

    if (format() === "json") {
      const data = {
        session: { id: session.id, title: session.title, model: session.model },
        messages: exportMessages,
      }
      return { content: JSON.stringify(data, null, 2), filename: `${title}.json`, mime: "application/json" }
    }

    const data = {
      version: "1",
      exportedAt: Date.now(),
      session: {
        id: session.id,
        title: session.title,
        model: session.model,
        cost: session.cost,
        tokens: session.tokens,
        timeCreated: session.time.created,
        timeUpdated: session.time.updated,
      },
      messages: exportMessages,
    }
    return { content: JSON.stringify(data, null, 2), filename: `${title}.zenkai-session`, mime: "application/json" }
  }

  const handleExport = () => {
    setIsExporting(true)
    try {
      const { content, filename, mime } = buildExport()
      const blob = new Blob([content], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      showToast({ title: "Exported", description: `Saved as ${filename}` })
      dialog.close()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: "Export failed", description: message })
    } finally {
      setIsExporting(false)
    }
  }

  const formatOptions: Array<{ value: ExportFormat; label: string; desc: string }> = [
    { value: "zenkai-session", label: ".zenkai-session", desc: "Native format with full data" },
    { value: "markdown", label: ".md", desc: "Readable markdown document" },
    { value: "json", label: ".json", desc: "Raw JSON data" },
  ]

  return (
    <Dialog title="Export Session">
      <div class="flex flex-col gap-4 px-4 py-3 min-w-[360px]">
        <Show
          when={currentSession()}
          fallback={<p class="text-12-regular text-text-weak">No active session to export</p>}
        >
          <div>
            <p class="text-11-medium text-text-weak uppercase tracking-wider mb-2">Format</p>
            <div class="flex flex-col gap-1">
              {formatOptions.map((opt) => (
                <button
                  class="flex items-center gap-2.5 px-3 py-2 rounded text-left transition-colors"
                  classList={{
                    "bg-[#EC5B2B]/10 border border-[#EC5B2B]/40": format() === opt.value,
                    "border border-border-weak-base hover:bg-surface-hover": format() !== opt.value,
                  }}
                  onClick={() => setFormat(opt.value)}
                >
                  <div
                    class="w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0"
                    classList={{
                      "border-[#EC5B2B]": format() === opt.value,
                      "border-border-weak-base": format() !== opt.value,
                    }}
                  >
                    <Show when={format() === opt.value}>
                      <div class="w-1.5 h-1.5 rounded-full bg-[#EC5B2B]" />
                    </Show>
                  </div>
                  <div>
                    <p class="text-12-medium text-text-strong">{opt.label}</p>
                    <p class="text-11-regular text-text-weak">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p class="text-11-medium text-text-weak uppercase tracking-wider mb-2">Include</p>
            <div class="flex flex-col gap-1.5">
              <ToggleOption
                label="AI Responses"
                checked={options.includeResponses}
                onChange={(v) => setOptions("includeResponses", v)}
              />
              <ToggleOption
                label="Tool Outputs"
                checked={options.includeToolOutputs}
                onChange={(v) => setOptions("includeToolOutputs", v)}
              />
              <ToggleOption
                label="File Changes"
                checked={options.includeFileChanges}
                onChange={(v) => setOptions("includeFileChanges", v)}
              />
              <ToggleOption
                label="Timestamps"
                checked={options.includeTimestamps}
                onChange={(v) => setOptions("includeTimestamps", v)}
              />
            </div>
          </div>

          <div>
            <p class="text-11-medium text-text-weak uppercase tracking-wider mb-2">Privacy</p>
            <ToggleOption
              label="Auto-redact secrets"
              description="API keys, tokens, passwords"
              checked={options.redactSecrets}
              onChange={(v) => setOptions("redactSecrets", v)}
            />
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-border-weak-base">
            <p class="text-11-regular text-text-weak">Estimated size: {estimatedSize()}</p>
            <button
              class="px-4 py-1.5 rounded bg-[#EC5B2B] text-white text-12-medium hover:bg-[#d44f24] transition-colors disabled:opacity-50"
              disabled={isExporting()}
              onClick={handleExport}
            >
              {isExporting() ? "Exporting..." : "Export"}
            </button>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}

const ToggleOption: Component<{
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}> = (props) => {
  return (
    <button
      class="flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-surface-hover transition-colors text-left w-full"
      onClick={() => props.onChange(!props.checked)}
    >
      <div
        class="w-7 h-4 rounded-full relative transition-colors shrink-0"
        classList={{
          "bg-[#EC5B2B]": props.checked,
          "bg-border-weak-base": !props.checked,
        }}
      >
        <div
          class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
          classList={{
            "translate-x-3.5": props.checked,
            "translate-x-0.5": !props.checked,
          }}
        />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-12-regular text-text-strong">{props.label}</p>
        <Show when={props.description}>
          <p class="text-11-regular text-text-weak">{props.description}</p>
        </Show>
      </div>
    </button>
  )
}
