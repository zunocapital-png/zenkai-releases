import { type Component, createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useParams } from "@solidjs/router"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import type { TextPart as SDKTextPart } from "@opencode-ai/sdk/v2/client"

interface WorkspaceSession {
  filename: string
  label?: string
  addedAt: number
}

interface SessionPreview {
  title: string
  messageCount: number
  firstMessage?: string
  lastMessage?: string
  cost?: number
  tokensInput?: number
  tokensOutput?: number
}

export const CollabPanel: Component = () => {
  const params = useParams()
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()

  const [activeTab, setActiveTab] = createSignal<"share" | "workspace" | "templates">("share")
  const [workspaceSessions, setWorkspaceSessions] = createStore<WorkspaceSession[]>([])
  const [previewData, setPreviewData] = createSignal<SessionPreview | null>(null)
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

  const messageCount = createMemo(() => sessionMessages().length)

  const buildMarkdown = () => {
    const session = currentSession()
    if (!session) return ""

    const msgs = sessionMessages()
    const lines: string[] = []
    lines.push(`# ${session.title}`)
    lines.push("")
    lines.push(`*Exported from Zenkai*`)
    lines.push("")
    lines.push("---")
    lines.push("")

    for (const msg of msgs) {
      const parts = sync().data.part[msg.id] ?? []
      const textParts = parts.filter((p): p is SDKTextPart => p.type === "text" && !p.synthetic)
      const text = textParts.map((p) => p.text).join("\n")
      if (!text.trim()) continue

      const role = msg.role === "user" ? "User" : "Assistant"
      const time = new Date(msg.time.created).toLocaleString()
      lines.push(`### ${role} — ${time}`)
      lines.push("")
      lines.push(text)
      lines.push("")
      lines.push("---")
      lines.push("")
    }

    return lines.join("\n")
  }

  const handleCopyMarkdown = async () => {
    const md = buildMarkdown()
    if (!md) return
    try {
      await navigator.clipboard.writeText(md)
      showToast({ title: "Copied", description: "Session copied as Markdown" })
    } catch {
      showToast({ title: "Failed", description: "Could not copy to clipboard" })
    }
  }

  const handleExportSession = async (format: "zenkai-session" | "markdown" | "json") => {
    const session = currentSession()
    if (!session) return

    setIsExporting(true)
    try {
      let content: string
      let filename: string
      let mime: string

      if (format === "markdown") {
        content = buildMarkdown()
        filename = `${session.title.replace(/[^a-zA-Z0-9-_]/g, "_")}.md`
        mime = "text/markdown"
      } else if (format === "json") {
        const msgs = sessionMessages()
        const data = {
          session: { id: session.id, title: session.title, model: session.model },
          messages: msgs.map((m) => ({
            role: m.role,
            time: m.time.created,
            parts: (sync().data.part[m.id] ?? []).map((p) => ({ type: p.type, ...(p.type === "text" ? { text: (p as SDKTextPart).text } : {}) })),
          })),
        }
        content = JSON.stringify(data, null, 2)
        filename = `${session.title.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`
        mime = "application/json"
      } else {
        const msgs = sessionMessages()
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
          messages: msgs.map((m) => {
            const parts = sync().data.part[m.id] ?? []
            const textParts = parts.filter((p): p is SDKTextPart => p.type === "text" && !p.synthetic)
            return {
              id: m.id,
              role: m.role,
              content: textParts.map((p) => p.text).join("\n"),
              time: m.time.created,
              agent: m.agent,
              model: "modelID" in m ? m.modelID : undefined,
            }
          }),
        }
        content = JSON.stringify(data, null, 2)
        filename = `${session.title.replace(/[^a-zA-Z0-9-_]/g, "_")}.zenkai-session`
        mime = "application/json"
      }

      const blob = new Blob([content], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      showToast({ title: "Exported", description: `Session exported as ${format}` })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: "Export failed", description: message })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportSession = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".zenkai-session,.json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text)

        if (data.version && data.session && data.messages) {
          setPreviewData({
            title: data.session.title,
            messageCount: data.messages.length,
            firstMessage: data.messages[0]?.content?.slice(0, 200),
            lastMessage: data.messages[data.messages.length - 1]?.content?.slice(0, 200),
            cost: data.session.cost,
            tokensInput: data.session.tokens?.input,
            tokensOutput: data.session.tokens?.output,
          })
          showToast({ title: "Loaded", description: `Preview: "${data.session.title}" (${data.messages.length} messages)` })
        } else {
          showToast({ title: "Invalid", description: "Not a valid .zenkai-session file" })
        }
      } catch {
        showToast({ title: "Error", description: "Failed to parse session file" })
      }
    }
    input.click()
  }

  return (
    <div class="flex flex-col h-full bg-surface-panel border-l border-border-weak-base">
      <div class="flex items-center gap-1 px-3 py-2 border-b border-border-weak-base">
        <button
          class="px-2.5 py-1 rounded text-12-medium transition-colors"
          classList={{
            "bg-[#EC5B2B] text-white": activeTab() === "share",
            "text-text-weak hover:text-text-strong": activeTab() !== "share",
          }}
          onClick={() => setActiveTab("share")}
        >
          Share
        </button>
        <button
          class="px-2.5 py-1 rounded text-12-medium transition-colors"
          classList={{
            "bg-[#EC5B2B] text-white": activeTab() === "workspace",
            "text-text-weak hover:text-text-strong": activeTab() !== "workspace",
          }}
          onClick={() => setActiveTab("workspace")}
        >
          Workspace
        </button>
        <button
          class="px-2.5 py-1 rounded text-12-medium transition-colors"
          classList={{
            "bg-[#EC5B2B] text-white": activeTab() === "templates",
            "text-text-weak hover:text-text-strong": activeTab() !== "templates",
          }}
          onClick={() => setActiveTab("templates")}
        >
          Templates
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <Show when={activeTab() === "share"}>
          <ShareTab
            session={currentSession()}
            messageCount={messageCount()}
            isExporting={isExporting()}
            previewData={previewData()}
            onExport={handleExportSession}
            onImport={handleImportSession}
            onCopyMarkdown={handleCopyMarkdown}
          />
        </Show>

        <Show when={activeTab() === "workspace"}>
          <WorkspaceTab sessions={workspaceSessions} />
        </Show>

        <Show when={activeTab() === "templates"}>
          <TemplatesTab />
        </Show>
      </div>
    </div>
  )
}

const ShareTab: Component<{
  session: { id: string; title: string } | null
  messageCount: number
  isExporting: boolean
  previewData: SessionPreview | null
  onExport: (format: "zenkai-session" | "markdown" | "json") => void
  onImport: () => void
  onCopyMarkdown: () => void
}> = (props) => {
  return (
    <div class="flex flex-col gap-3">
      <Show
        when={props.session}
        fallback={<p class="text-12-regular text-text-weak">No active session</p>}
      >
        <div class="flex flex-col gap-1.5">
          <p class="text-12-medium text-text-strong truncate">{props.session!.title}</p>
          <p class="text-11-regular text-text-weak">{props.messageCount} messages</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <p class="text-11-medium text-text-weak uppercase tracking-wider">Export</p>
          <button
            class="w-full px-3 py-1.5 rounded bg-[#EC5B2B] text-white text-12-medium hover:bg-[#d44f24] transition-colors disabled:opacity-50"
            disabled={props.isExporting}
            onClick={() => props.onExport("zenkai-session")}
          >
            Share Session (.zenkai-session)
          </button>
          <button
            class="w-full px-3 py-1.5 rounded border border-border-weak-base text-text-strong text-12-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
            disabled={props.isExporting}
            onClick={() => props.onExport("markdown")}
          >
            Export as Markdown
          </button>
          <button
            class="w-full px-3 py-1.5 rounded border border-border-weak-base text-text-strong text-12-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
            disabled={props.isExporting}
            onClick={() => props.onExport("json")}
          >
            Export as JSON
          </button>
        </div>

        <div class="flex flex-col gap-1.5">
          <p class="text-11-medium text-text-weak uppercase tracking-wider">Actions</p>
          <button
            class="w-full px-3 py-1.5 rounded border border-border-weak-base text-text-strong text-12-medium hover:bg-surface-hover transition-colors"
            onClick={props.onCopyMarkdown}
          >
            Copy as Markdown
          </button>
          <button
            class="w-full px-3 py-1.5 rounded border border-border-weak-base text-text-strong text-12-medium hover:bg-surface-hover transition-colors"
            onClick={props.onImport}
          >
            Import Session
          </button>
        </div>
      </Show>

      <Show when={props.previewData}>
        {(preview) => (
          <div class="flex flex-col gap-2 p-2.5 rounded border border-[#EC5B2B]/30 bg-[#EC5B2B]/5">
            <p class="text-11-medium text-text-weak uppercase tracking-wider">Preview</p>
            <p class="text-12-medium text-text-strong truncate">{preview().title}</p>
            <div class="flex items-center gap-3 text-11-regular text-text-weak">
              <span>{preview().messageCount} msgs</span>
              <Show when={preview().cost}>
                <span>${preview().cost!.toFixed(4)}</span>
              </Show>
              <Show when={preview().tokensInput}>
                <span>{preview().tokensInput!.toLocaleString()} tokens</span>
              </Show>
            </div>
            <Show when={preview().firstMessage}>
              <div class="mt-1">
                <p class="text-11-medium text-text-weak">First message:</p>
                <p class="text-11-regular text-text-strong line-clamp-3">{preview().firstMessage}</p>
              </div>
            </Show>
            <Show when={preview().lastMessage}>
              <div>
                <p class="text-11-medium text-text-weak">Last message:</p>
                <p class="text-11-regular text-text-strong line-clamp-3">{preview().lastMessage}</p>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}

const WorkspaceTab: Component<{ sessions: WorkspaceSession[] }> = (props) => {
  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <p class="text-11-medium text-text-weak uppercase tracking-wider">Shared Sessions</p>
        <span class="text-11-regular text-text-weak">{props.sessions.length}</span>
      </div>

      <Show
        when={props.sessions.length > 0}
        fallback={
          <div class="flex flex-col items-center gap-2 py-6 text-text-weak">
            <svg class="w-8 h-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p class="text-12-regular">No shared sessions yet</p>
            <p class="text-11-regular text-center">Export a session and add it to the workspace to share with your team</p>
          </div>
        }
      >
        <div class="flex flex-col gap-1">
          <For each={props.sessions}>
            {(session) => (
              <div class="flex items-center gap-2 px-2.5 py-2 rounded hover:bg-surface-hover transition-colors cursor-pointer group">
                <div class="w-1.5 h-1.5 rounded-full bg-[#EC5B2B] shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-12-medium text-text-strong truncate">{session.label || session.filename}</p>
                  <p class="text-11-regular text-text-weak">{new Date(session.addedAt).toLocaleDateString()}</p>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

const TemplatesTab: Component = () => {
  const [templates, setTemplates] = createSignal<Array<{ id: string; name: string; tags: string[]; variables: string[] }>>([])
  const [newName, setNewName] = createSignal("")
  const [newPrompt, setNewPrompt] = createSignal("")

  const handleSave = () => {
    const name = newName().trim()
    const prompt = newPrompt().trim()
    if (!name || !prompt) return

    const vars = (prompt.match(/\{\{(\w+)\}\}/g) ?? []).map((m) => m.slice(2, -2))
    setTemplates((prev) => [
      ...prev,
      { id: `tpl_${Date.now()}`, name, tags: [], variables: [...new Set(vars)] },
    ])
    setNewName("")
    setNewPrompt("")
    showToast({ title: "Saved", description: `Template "${name}" created` })
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <p class="text-11-medium text-text-weak uppercase tracking-wider">New Template</p>
        <input
          type="text"
          placeholder="Template name"
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
          class="w-full px-2.5 py-1.5 rounded border border-border-weak-base bg-transparent text-text-strong text-12-regular placeholder:text-text-weak focus:outline-none focus:border-[#EC5B2B] transition-colors"
        />
        <textarea
          placeholder="Prompt with {{variables}}..."
          value={newPrompt()}
          onInput={(e) => setNewPrompt(e.currentTarget.value)}
          rows={3}
          class="w-full px-2.5 py-1.5 rounded border border-border-weak-base bg-transparent text-text-strong text-12-regular placeholder:text-text-weak focus:outline-none focus:border-[#EC5B2B] transition-colors resize-none"
        />
        <button
          class="w-full px-3 py-1.5 rounded bg-[#EC5B2B] text-white text-12-medium hover:bg-[#d44f24] transition-colors disabled:opacity-50"
          disabled={!newName().trim() || !newPrompt().trim()}
          onClick={handleSave}
        >
          Save Template
        </button>
      </div>

      <Show when={templates().length > 0}>
        <div class="flex flex-col gap-1.5">
          <p class="text-11-medium text-text-weak uppercase tracking-wider">Saved Templates</p>
          <For each={templates()}>
            {(tpl) => (
              <div class="px-2.5 py-2 rounded border border-border-weak-base hover:border-[#EC5B2B]/40 transition-colors cursor-pointer group">
                <p class="text-12-medium text-text-strong">{tpl.name}</p>
                <Show when={tpl.variables.length > 0}>
                  <div class="flex flex-wrap gap-1 mt-1">
                    <For each={tpl.variables}>
                      {(v) => (
                        <span class="px-1.5 py-0.5 rounded text-10-regular bg-[#EC5B2B]/10 text-[#EC5B2B]">
                          {`{{${v}}}`}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
