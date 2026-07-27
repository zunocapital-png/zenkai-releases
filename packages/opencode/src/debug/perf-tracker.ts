export type RequestRecord = {
  id: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  timestamp: number
}

export type PerfStats = {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalLatencyMs: number
  avgLatencyMs: number
  minLatencyMs: number
  maxLatencyMs: number
}

const CLOUD_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4": { input: 30, output: 60 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3.5-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  default: { input: 5, output: 15 },
}

let counter = 0
const history: RequestRecord[] = []

export function trackRequest(model: string, inputTokens: number, outputTokens: number, latencyMs: number) {
  const record: RequestRecord = {
    id: `req_${++counter}`,
    model,
    inputTokens,
    outputTokens,
    latencyMs,
    timestamp: Date.now(),
  }
  history.push(record)
  return record
}

export function getStats(): PerfStats {
  if (history.length === 0) {
    return {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
    }
  }

  let totalInput = 0
  let totalOutput = 0
  let totalLatency = 0
  let min = Infinity
  let max = 0

  for (const r of history) {
    totalInput += r.inputTokens
    totalOutput += r.outputTokens
    totalLatency += r.latencyMs
    if (r.latencyMs < min) min = r.latencyMs
    if (r.latencyMs > max) max = r.latencyMs
  }

  return {
    totalRequests: history.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalLatencyMs: totalLatency,
    avgLatencyMs: totalLatency / history.length,
    minLatencyMs: min,
    maxLatencyMs: max,
  }
}

export function getHistory(limit?: number): RequestRecord[] {
  if (limit === undefined) return [...history]
  return history.slice(-limit)
}

export function calculateSavings(): { totalSaved: number; breakdown: Array<{ model: string; tokens: number; cost: number }> } {
  const byModel = new Map<string, { input: number; output: number }>()

  for (const r of history) {
    const existing = byModel.get(r.model) ?? { input: 0, output: 0 }
    existing.input += r.inputTokens
    existing.output += r.outputTokens
    byModel.set(r.model, existing)
  }

  const breakdown: Array<{ model: string; tokens: number; cost: number }> = []
  let totalSaved = 0

  for (const [model, usage] of byModel) {
    const pricing = CLOUD_PRICING[model] ?? CLOUD_PRICING.default
    const cost = (usage.input / 1_000_000) * pricing.input + (usage.output / 1_000_000) * pricing.output
    totalSaved += cost
    breakdown.push({ model, tokens: usage.input + usage.output, cost })
  }

  return { totalSaved, breakdown }
}

export function reset() {
  history.length = 0
  counter = 0
}
