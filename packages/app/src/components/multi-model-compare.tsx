import { For, Show } from "solid-js"

export type ModelResult = {
  modelName: string
  response: string
  latency: number
}

export function MultiModelCompare(props: {
  results: Array<ModelResult>
  onSelect: (index: number) => void
}) {
  return (
    <Show
      when={props.results.length > 0}
      fallback={
        <div class="flex items-center justify-center rounded-lg border border-v2-border-border-muted bg-v2-background-bg-base p-6 text-[13px] text-v2-text-text-muted">
          No model responses to compare
        </div>
      }
    >
      <div class="grid grid-cols-2 gap-3">
        <For each={props.results}>
          {(result, index) => (
            <div class="flex flex-col gap-2 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-base p-4">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-[13px] font-[530] text-v2-text-text-base">{result.modelName}</span>
                <span class="shrink-0 text-[12px] tabular-nums text-v2-text-text-muted">{result.latency}ms</span>
              </div>
              <div class="min-h-[80px] whitespace-pre-wrap text-[13px] leading-5 text-v2-text-text-base">
                {result.response}
              </div>
              <button
                type="button"
                onClick={() => props.onSelect(index())}
                class="mt-auto self-start rounded-md bg-v2-background-bg-muted px-3 py-1.5 text-[12px] font-[530] text-v2-text-text-base transition-colors hover:bg-v2-background-bg-hover"
              >
                Use this response
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
