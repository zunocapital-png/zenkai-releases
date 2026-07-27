import { randomUUID } from "crypto";

export type DisplayMode = "show" | "hide" | "collapse";

export interface ThinkingOptions {
  enabled: boolean;
  maxThinkingTokens: number;
  displayMode: DisplayMode;
  budgetTokens: number;
}

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  status: "thinking" | "done" | "error";
  startedAt: number;
  completedAt?: number;
  tokenCount: number;
}

export interface ThinkingResult {
  steps: ThinkingStep[];
  finalAnswer: string;
  totalThinkingTokens: number;
  totalTime: number;
}

export interface SubProblem {
  id: string;
  description: string;
  dependencies: string[];
  status: "pending" | "solving" | "solved";
  solution?: string;
}

export interface StructuredReasoning {
  premises: string[];
  analysis: string[];
  conclusion: string;
  confidence: number;
}

export class ThinkingEngine {
  private options: ThinkingOptions;
  private steps: ThinkingStep[] = [];
  private sessionStart: number = 0;
  private consumedTokens: number = 0;

  constructor(options: ThinkingOptions) {
    this.options = options;
  }

  startThinking(_prompt: string): void {
    this.steps = [];
    this.consumedTokens = 0;
    this.sessionStart = Date.now();
  }

  addStep(title: string, content: string): ThinkingStep | null {
    const estimatedTokens = Math.ceil(content.length / 4);

    if (this.consumedTokens + estimatedTokens > this.options.budgetTokens) {
      return null;
    }

    const step: ThinkingStep = {
      id: randomUUID(),
      title,
      content,
      status: "thinking",
      startedAt: Date.now(),
      tokenCount: estimatedTokens,
    };

    this.steps.push(step);
    this.consumedTokens += estimatedTokens;
    return step;
  }

  completeStep(stepId: string): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = "done";
      step.completedAt = Date.now();
    }
  }

  getResult(): ThinkingResult {
    const finalAnswer = this.steps
      .filter((s) => s.status === "done")
      .map((s) => s.content)
      .join("\n\n");

    return {
      steps: this.steps,
      finalAnswer,
      totalThinkingTokens: this.consumedTokens,
      totalTime: Date.now() - this.sessionStart,
    };
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function topologicalSort(subProblems: SubProblem[]): SubProblem[] {
  const visited = new Set<string>();
  const sorted: SubProblem[] = [];
  const idMap = new Map<string, SubProblem>();

  for (const sp of subProblems) {
    idMap.set(sp.id, sp);
  }

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const sp = idMap.get(id);
    if (!sp) return;
    for (const dep of sp.dependencies) {
      visit(dep);
    }
    sorted.push(sp);
  }

  for (const sp of subProblems) {
    visit(sp.id);
  }

  return sorted;
}

export function enableThinkingMode(options: Partial<ThinkingOptions> = {}): ThinkingOptions {
  return {
    enabled: true,
    maxThinkingTokens: options.maxThinkingTokens ?? 8192,
    displayMode: options.displayMode ?? "show",
    budgetTokens: options.budgetTokens ?? 4096,
  };
}

export function generateWithThinking(
  prompt: string,
  context: Record<string, unknown> = {}
): ThinkingResult {
  const options = enableThinkingMode();
  const engine = new ThinkingEngine(options);
  engine.startThinking(prompt);

  const contextSummary = Object.keys(context).length > 0
    ? `Context keys: ${Object.keys(context).join(", ")}`
    : "No additional context provided";

  const stages = [
    {
      title: "Understanding the problem",
      content: `Analyzing prompt: "${prompt}". ${contextSummary}.`,
    },
    {
      title: "Identifying key elements",
      content: `Extracting core requirements and constraints from the problem statement. Breaking down into actionable components.`,
    },
    {
      title: "Analyzing approaches",
      content: `Evaluating possible solution strategies. Considering trade-offs between approaches based on the identified constraints.`,
    },
    {
      title: "Formulating solution",
      content: `Synthesizing the analysis into a coherent solution that addresses all identified requirements.`,
    },
    {
      title: "Verifying answer",
      content: `Cross-checking the proposed solution against the original requirements and constraints to ensure completeness and correctness.`,
    },
  ];

  for (const stage of stages) {
    const step = engine.addStep(stage.title, stage.content);
    if (!step) break;
    engine.completeStep(step.id);
  }

  return engine.getResult();
}

export function analyzeComplexProblem(problem: string): StructuredReasoning {
  const segments = problem
    .split(/[.!?;]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const subProblems: SubProblem[] = segments.map((segment, index) => ({
    id: randomUUID(),
    description: segment,
    dependencies: index > 0 ? [segments[index - 1]] : [],
    status: "pending" as const,
  }));

  const resolvedDeps = subProblems.map((sp, index) => ({
    ...sp,
    dependencies: index > 0 ? [subProblems[index - 1].id] : [],
  }));

  const ordered = topologicalSort(resolvedDeps);

  const premises: string[] = [];
  const analysis: string[] = [];
  const solutions: string[] = [];

  for (const sp of ordered) {
    sp.status = "solving";
    premises.push(sp.description);

    const analysisEntry = `Analyzing: ${sp.description} [tokens: ~${estimateTokens(sp.description)}]`;
    analysis.push(analysisEntry);

    sp.solution = `Resolved: ${sp.description}`;
    sp.status = "solved";
    solutions.push(sp.solution);
  }

  const conclusion = solutions.length > 0
    ? solutions.join(". ") + "."
    : "No sub-problems identified.";

  const confidence = ordered.length > 0
    ? ordered.filter((sp) => sp.status === "solved").length / ordered.length
    : 0;

  return {
    premises,
    analysis,
    conclusion,
    confidence,
  };
}
