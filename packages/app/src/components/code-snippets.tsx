import { Component, createSignal, createEffect, For, Show } from "solid-js"

type SnippetCategory = "functions" | "classes" | "patterns" | "configs" | "scripts"

interface Snippet {
  id: string
  title: string
  language: string
  code: string
  tags: string[]
  category: SnippetCategory
  createdAt: string
}

interface CodeSnippetsProps {
  snippets: Snippet[]
  onInsert?: (code: string) => void
  onSave?: (snippet: Omit<Snippet, "id" | "createdAt">) => void
  onDelete?: (id: string) => void
  onImport?: (json: string) => void
  onExport?: () => string
}

const CATEGORY_LABELS: Record<SnippetCategory, string> = {
  functions: "Functions",
  classes: "Classes",
  patterns: "Patterns",
  configs: "Configs",
  scripts: "Scripts",
}

const LANG_COLORS: Record<string, string> = {
  typescript: "bg-blue-500/20 text-blue-400",
  javascript: "bg-yellow-500/20 text-yellow-400",
  python: "bg-green-500/20 text-green-400",
  rust: "bg-[#EC5B2B]/20 text-[#EC5B2B]",
  go: "bg-cyan-500/20 text-cyan-400",
  java: "bg-red-500/20 text-red-400",
}

function SnippetCard(props: {
  snippet: Snippet
  onInsert?: () => void
  onCopy?: () => void
  onDelete?: () => void
}) {
  const [expanded, setExpanded] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const langColor = () => LANG_COLORS[props.snippet.language] || "bg-gray-500/20 text-gray-400"

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.snippet.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      props.onCopy?.()
    }
  }

  return (
    <div class="overflow-hidden rounded-lg border border-border-base bg-surface-primary-base transition-all duration-200 hover:border-[#EC5B2B]/30">
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-raised-base/50"
        onClick={() => setExpanded(!expanded())}
      >
        <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-text-base">
          {props.snippet.title}
        </span>
        <span class={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${langColor()}`}>
          {props.snippet.language}
        </span>
        <span class="shrink-0 text-[10px] text-text-dimmed-base">
          {CATEGORY_LABELS[props.snippet.category]}
        </span>
      </button>

      <Show when={expanded()}>
        <div class="border-t border-border-base">
          <pre class="max-h-64 overflow-auto bg-surface-raised-base/30 px-3 py-2 text-[11px] leading-relaxed text-text-base">
            <code>{props.snippet.code}</code>
          </pre>
          <div class="flex items-center gap-1.5 border-t border-border-base px-3 py-2">
            <For each={props.snippet.tags}>
              {(tag) => (
                <span class="rounded bg-surface-raised-base px-1.5 py-0.5 text-[10px] text-text-dimmed-base">
                  {tag}
                </span>
              )}
            </For>
            <div class="flex-1" />
            <Show when={props.onInsert}>
              <button
                type="button"
                class="rounded-md bg-[#EC5B2B] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#EC5B2B]/80"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onInsert?.()
                }}
              >
                Insert
              </button>
            </Show>
            <button
              type="button"
              class="rounded-md border border-border-base px-2.5 py-1 text-[11px] font-medium text-text-base hover:bg-surface-raised-base"
              onClick={(e) => {
                e.stopPropagation()
                handleCopy()
              }}
            >
              {copied() ? "Copied" : "Copy"}
            </button>
            <Show when={props.onDelete}>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/10"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onDelete?.()
                }}
              >
                Delete
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}

function NewSnippetForm(props: {
  onSave: (snippet: Omit<Snippet, "id" | "createdAt">) => void
  onCancel: () => void
}) {
  const [title, setTitle] = createSignal("")
  const [language, setLanguage] = createSignal("typescript")
  const [code, setCode] = createSignal("")
  const [tags, setTags] = createSignal("")
  const [category, setCategory] = createSignal<SnippetCategory>("functions")

  const handleSave = () => {
    if (!title().trim() || !code().trim()) return
    props.onSave({
      title: title().trim(),
      language: language(),
      code: code(),
      tags: tags().split(",").map((t) => t.trim()).filter(Boolean),
      category: category(),
    })
  }

  return (
    <div class="flex flex-col gap-2 rounded-lg border border-[#EC5B2B]/30 bg-[#EC5B2B]/5 p-3">
      <input
        type="text"
        placeholder="Snippet title"
        value={title()}
        onInput={(e) => setTitle(e.currentTarget.value)}
        class="w-full rounded-md border border-border-base bg-surface-primary-base px-2.5 py-1.5 text-[12px] text-text-base placeholder:text-text-dimmed-base focus:border-[#EC5B2B] focus:outline-none"
      />
      <div class="flex gap-2">
        <select
          value={language()}
          onChange={(e) => setLanguage(e.currentTarget.value)}
          class="rounded-md border border-border-base bg-surface-primary-base px-2 py-1.5 text-[12px] text-text-base focus:border-[#EC5B2B] focus:outline-none"
        >
          <option value="typescript">TypeScript</option>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="rust">Rust</option>
          <option value="go">Go</option>
          <option value="java">Java</option>
        </select>
        <select
          value={category()}
          onChange={(e) => setCategory(e.currentTarget.value as SnippetCategory)}
          class="rounded-md border border-border-base bg-surface-primary-base px-2 py-1.5 text-[12px] text-text-base focus:border-[#EC5B2B] focus:outline-none"
        >
          <For each={Object.entries(CATEGORY_LABELS)}>
            {([key, label]) => <option value={key}>{label}</option>}
          </For>
        </select>
      </div>
      <textarea
        placeholder="Paste your code here..."
        value={code()}
        onInput={(e) => setCode(e.currentTarget.value)}
        class="min-h-[120px] w-full rounded-md border border-border-base bg-surface-primary-base px-2.5 py-1.5 font-mono text-[11px] text-text-base placeholder:text-text-dimmed-base focus:border-[#EC5B2B] focus:outline-none"
      />
      <input
        type="text"
        placeholder="Tags (comma separated)"
        value={tags()}
        onInput={(e) => setTags(e.currentTarget.value)}
        class="w-full rounded-md border border-border-base bg-surface-primary-base px-2.5 py-1.5 text-[12px] text-text-base placeholder:text-text-dimmed-base focus:border-[#EC5B2B] focus:outline-none"
      />
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md border border-border-base px-3 py-1.5 text-[11px] font-medium text-text-base hover:bg-surface-raised-base"
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-md bg-[#EC5B2B] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#EC5B2B]/80"
          onClick={handleSave}
        >
          Save Snippet
        </button>
      </div>
    </div>
  )
}

export const CodeSnippets: Component<CodeSnippetsProps> = (props) => {
  const [search, setSearch] = createSignal("")
  const [filterLang, setFilterLang] = createSignal<string | null>(null)
  const [filterCategory, setFilterCategory] = createSignal<SnippetCategory | null>(null)
  const [showForm, setShowForm] = createSignal(false)

  const languages = () => [...new Set(props.snippets.map((s) => s.language))]

  const filtered = () => {
    let result = props.snippets
    const q = search().toLowerCase()
    if (q) {
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)) ||
          s.code.toLowerCase().includes(q),
      )
    }
    if (filterLang()) {
      result = result.filter((s) => s.language === filterLang())
    }
    if (filterCategory()) {
      result = result.filter((s) => s.category === filterCategory())
    }
    return result
  }

  const handleExport = () => {
    if (!props.onExport) return
    const json = props.onExport()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "snippets.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      props.onImport?.(text)
    }
    input.click()
  }

  return (
    <div class="flex flex-col gap-3 rounded-xl border border-border-base bg-surface-primary-base p-4">
      <div class="flex items-center justify-between">
        <span class="text-[13px] font-bold text-text-base">Code Snippets</span>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-md border border-border-base px-2 py-1 text-[10px] font-medium text-text-dimmed-base hover:bg-surface-raised-base"
            onClick={handleImport}
          >
            Import
          </button>
          <Show when={props.onExport}>
            <button
              type="button"
              class="rounded-md border border-border-base px-2 py-1 text-[10px] font-medium text-text-dimmed-base hover:bg-surface-raised-base"
              onClick={handleExport}
            >
              Export
            </button>
          </Show>
          <button
            type="button"
            class="rounded-md bg-[#EC5B2B] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#EC5B2B]/80"
            onClick={() => setShowForm(true)}
          >
            + New
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search snippets..."
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
        class="w-full rounded-md border border-border-base bg-surface-primary-base px-2.5 py-1.5 text-[12px] text-text-base placeholder:text-text-dimmed-base focus:border-[#EC5B2B] focus:outline-none"
      />

      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          classList={{
            "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors": true,
            "bg-[#EC5B2B] text-white": filterLang() === null && filterCategory() === null,
            "bg-surface-raised-base text-text-dimmed-base hover:text-text-base":
              filterLang() !== null || filterCategory() !== null,
          }}
          onClick={() => {
            setFilterLang(null)
            setFilterCategory(null)
          }}
        >
          All
        </button>
        <For each={languages()}>
          {(lang) => (
            <button
              type="button"
              classList={{
                "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors": true,
                "bg-[#EC5B2B] text-white": filterLang() === lang,
                "bg-surface-raised-base text-text-dimmed-base hover:text-text-base": filterLang() !== lang,
              }}
              onClick={() => setFilterLang(filterLang() === lang ? null : lang)}
            >
              {lang}
            </button>
          )}
        </For>
        <div class="h-4 w-px bg-border-base" />
        <For each={Object.entries(CATEGORY_LABELS)}>
          {([key, label]) => (
            <button
              type="button"
              classList={{
                "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors": true,
                "bg-[#EC5B2B] text-white": filterCategory() === key,
                "bg-surface-raised-base text-text-dimmed-base hover:text-text-base": filterCategory() !== key,
              }}
              onClick={() => setFilterCategory(filterCategory() === key ? null : (key as SnippetCategory))}
            >
              {label}
            </button>
          )}
        </For>
      </div>

      <Show when={showForm() && props.onSave}>
        <NewSnippetForm
          onSave={(snippet) => {
            props.onSave?.(snippet)
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      </Show>

      <div class="flex flex-col gap-1.5">
        <For each={filtered()}>
          {(snippet) => (
            <SnippetCard
              snippet={snippet}
              onInsert={props.onInsert ? () => props.onInsert?.(snippet.code) : undefined}
              onDelete={props.onDelete ? () => props.onDelete?.(snippet.id) : undefined}
            />
          )}
        </For>
      </div>

      <Show when={filtered().length === 0}>
        <div class="py-6 text-center text-[12px] text-text-dimmed-base">
          {props.snippets.length === 0 ? "No snippets saved yet" : "No matching snippets"}
        </div>
      </Show>
    </div>
  )
}
