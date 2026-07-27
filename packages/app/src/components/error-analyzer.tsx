import { createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"

type ErrorClass = "syntax" | "runtime" | "type" | "reference" | "network" | "permission" | "memory" | "timeout" | "assertion" | "import" | "unknown"

type SuggestedFix = {
  id: string
  title: string
  code: string
  file?: string
  line?: number
  confidence: "high" | "medium" | "low"
}

type SimilarError = {
  id: string
  message: string
  timestamp: number
  resolved: boolean
}

type AnalysisResult = {
  errorType: ErrorClass
  rootCause: string
  explanation: string
  fixes: SuggestedFix[]
  similar: SimilarError[]
  confidence: "high" | "medium" | "low"
}

type ErrorAnalyzerProps = {
  error: string
  stack?: string
  onApplyFix?: (fix: SuggestedFix) => void
  onAnalyze?: (error: string, stack?: string) => Promise<AnalysisResult>
}

const CLASS_LABELS: Record<ErrorClass, string> = {
  syntax: "Syntax Error",
  runtime: "Runtime Error",
  type: "Type Error",
  reference: "Reference Error",
  network: "Network Error",
  permission: "Permission Error",
  memory: "Memory Error",
  timeout: "Timeout Error",
  assertion: "Assertion Error",
  import: "Import Error",
  unknown: "Unknown Error",
}

const CLASS_COLORS: Record<ErrorClass, string> = {
  syntax: "bg-yellow-500/20 text-yellow-400",
  runtime: "bg-[#EC5B2B]/20 text-[#EC5B2B]",
  type: "bg-blue-500/20 text-blue-400",
  reference: "bg-purple-500/20 text-purple-400",
  network: "bg-cyan-500/20 text-cyan-400",
  permission: "bg-red-500/20 text-red-400",
  memory: "bg-red-500/20 text-red-400",
  timeout: "bg-orange-500/20 text-orange-400",
  assertion: "bg-amber-500/20 text-amber-400",
  import: "bg-indigo-500/20 text-indigo-400",
  unknown: "bg-gray-500/20 text-gray-400",
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-500/20 text-green-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-red-500/20 text-red-400",
}

function ConfidenceDots(props: { level: "high" | "medium" | "low" }) {
  const filled = () => (props.level === "high" ? 3 : props.level === "medium" ? 2 : 1)
  return (
    <div class="flex items-center gap-0.5">
      <For each={[1, 2, 3]}>
        {(n) => (
          <div
            classList={{
              "h-1.5 w-1.5 rounded-full": true,
              "bg-green-400": n <= filled() && props.level === "high",
              "bg-yellow-400": n <= filled() && props.level === "medium",
              "bg-red-400": n <= filled() && props.level === "low",
              "bg-text-weak/30": n > filled(),
            }}
          />
        )}
      </For>
    </div>
  )
}

export function ErrorAnalyzer(props: ErrorAnalyzerProps) {
  const [state, setState] = createStore({
    loading: false,
    result: null as AnalysisResult | null,
    error: null as string | null,
    expandedFix: null as string | null,
    showSimilar: false,
  })

  const analyze = async () => {
    if (!props.onAnalyze) return
    setState("loading", true)
    setState("error", null)
    try {
      const result = await props.onAnalyze(props.error, props.stack)
      setState("result", result)
    } catch (e) {
      setState("error", e instanceof Error ? e.message : "Analysis failed")
    } finally {
      setState("loading", false)
    }
  }

  return (
    <div class="flex flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha">
      <div class="flex items-center justify-between border-b border-border-base px-3 py-2">
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-bold uppercase tracking-wider text-[#EC5B2B]">Error Analysis</span>
          <Show when={state.result}>
            {(r) => (
              <>
                <span classList={{ "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase": true, [CLASS_COLORS[r().errorType]]: true }}>
                  {CLASS_LABELS[r().errorType]}
                </span>
                <span classList={{ "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase": true, [CONFIDENCE_COLORS[r().confidence]]: true }}>
                  {r().confidence}
                </span>
                <ConfidenceDots level={r().confidence} />
              </>
            )}
          </Show>
        </div>
        <button
          type="button"
          classList={{
            "rounded px-3 py-1 text-[11px] font-medium transition-colors": true,
            "bg-[#EC5B2B] text-white hover:bg-[#EC5B2B]/80": !state.loading,
            "bg-[#EC5B2B]/50 text-white/50 cursor-not-allowed": state.loading,
          }}
          disabled={state.loading}
          onClick={analyze}
        >
          {state.loading ? "Analyzing..." : state.result ? "Re-analyze" : "Analyze with AI"}
        </button>
      </div>

      <div class="border-b border-border-base bg-[#EC5B2B]/5 px-3 py-2">
        <pre class="whitespace-pre-wrap font-mono text-[12px] text-[#EC5B2B]">{props.error}</pre>
        <Show when={props.stack}>
          <pre class="mt-1 max-h-[100px] overflow-auto whitespace-pre-wrap font-mono text-[11px] text-text-weak">{props.stack}</pre>
        </Show>
      </div>

      <Show when={state.loading}>
        <div class="flex items-center justify-center gap-2 px-3 py-8">
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-[#EC5B2B] border-t-transparent" />
          <span class="text-[12px] text-text-weak">Analyzing error...</span>
        </div>
      </Show>

      <Show when={state.error}>
        <div class="px-3 py-4 text-center text-[12px] text-[#EC5B2B]">{state.error}</div>
      </Show>

      <Show when={!state.loading && state.result}>
        {(r) => (
          <div class="flex flex-col">
            <div class="border-b border-border-base px-3 py-2">
              <div class="text-[10px] font-bold uppercase tracking-wider text-text-weak">Root Cause</div>
              <div class="mt-1 text-[12px] text-text-strong">{r().rootCause}</div>
            </div>

            <div class="border-b border-border-base px-3 py-2">
              <div class="text-[10px] font-bold uppercase tracking-wider text-text-weak">Explanation</div>
              <div class="mt-1 text-[12px] leading-relaxed text-text-strong">{r().explanation}</div>
            </div>

            <div class="border-b border-border-base">
              <div class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-weak">
                Suggested Fixes ({r().fixes.length})
              </div>
              <For each={r().fixes}>
                {(fix) => (
                  <div class="border-t border-border-base/50">
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-raised-base"
                      onClick={() => setState("expandedFix", state.expandedFix === fix.id ? null : fix.id)}
                    >
                      <span class="text-[10px] text-text-weak">{state.expandedFix === fix.id ? "▼" : "▶"}</span>
                      <span class="flex-1 text-[12px] text-text-strong">{fix.title}</span>
                      <ConfidenceDots level={fix.confidence} />
                    </button>
                    <Show when={state.expandedFix === fix.id}>
                      <div class="border-t border-border-base/30 bg-surface-raised-base px-3 py-2">
                        <Show when={fix.file}>
                          <div class="mb-1 text-[11px] text-text-weak">
                            {fix.file}
                            <Show when={fix.line}>:{fix.line}</Show>
                          </div>
                        </Show>
                        <pre class="overflow-auto rounded bg-black/20 p-2 font-mono text-[11px] text-text-strong">{fix.code}</pre>
                        <button
                          type="button"
                          class="mt-2 rounded bg-[#EC5B2B] px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[#EC5B2B]/80"
                          onClick={() => props.onApplyFix?.(fix)}
                        >
                          Apply Fix
                        </button>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <Show when={r().similar.length > 0}>
              <div>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-raised-base"
                  onClick={() => setState("showSimilar", (s) => !s)}
                >
                  <span class="text-[10px] text-text-weak">{state.showSimilar ? "▼" : "▶"}</span>
                  <span class="text-[10px] font-bold uppercase tracking-wider text-text-weak">Similar Errors ({r().similar.length})</span>
                </button>
                <Show when={state.showSimilar}>
                  <For each={r().similar}>
                    {(err) => (
                      <div class="flex items-center gap-2 border-t border-border-base/50 px-3 py-1.5">
                        <div
                          classList={{
                            "h-2 w-2 shrink-0 rounded-full": true,
                            "bg-green-400": err.resolved,
                            "bg-[#EC5B2B]": !err.resolved,
                          }}
                        />
                        <span class="min-w-0 flex-1 truncate text-[12px] text-text-strong">{err.message}</span>
                        <span class="shrink-0 text-[10px] tabular-nums text-text-weak">{new Date(err.timestamp).toLocaleDateString()}</span>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}
