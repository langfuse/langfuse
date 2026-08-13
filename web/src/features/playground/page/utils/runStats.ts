import { type PlaygroundRunResult } from "../types";

export interface RunStats {
  totalCount: number;
  completedCount: number;
  errorCount: number;
  latency: { min: number; avg: number; max: number } | null;
  /**
   * Per tool-call signature (tool name + sorted argument keys), the number of
   * completed runs in which it was called at least once. Argument keys are
   * part of the signature so runs that call the same tool with a different
   * argument shape are surfaced as distinct behavior.
   */
  toolCallFrequencies: { signature: string; runCount: number }[];
  /** Number of distinct normalized outputs across completed runs. */
  distinctOutputCount: number;
}

const toolCallSignature = (name: string, args: unknown): string => {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const keys = Object.keys(args as Record<string, unknown>).sort();
    return `${name}(${keys.join(", ")})`;
  }
  return `${name}()`;
};

const normalizeOutput = (run: PlaygroundRunResult): string => {
  const content = run.content.trim().replace(/\s+/g, " ");
  const toolCalls = run.toolCalls
    .map((toolCall) =>
      JSON.stringify({ name: toolCall.name, args: toolCall.args }),
    )
    .sort()
    .join("|");
  return `${content}::${toolCalls}`;
};

/**
 * Deterministic consistency stats over a set of repeated playground runs:
 * counts, frequencies, and latency distribution only — no model-based scoring.
 */
export function computeRunStats(runs: PlaygroundRunResult[]): RunStats {
  const completed = runs.filter((run) => run.status === "completed");
  const errored = runs.filter((run) => run.status === "error");

  const latencies = completed.map((run) => run.latencyMs);
  const latency =
    latencies.length > 0
      ? {
          min: Math.min(...latencies),
          avg: Math.round(
            latencies.reduce((sum, value) => sum + value, 0) /
              latencies.length,
          ),
          max: Math.max(...latencies),
        }
      : null;

  const signatureRunCounts = new Map<string, number>();
  for (const run of completed) {
    const signaturesInRun = new Set(
      run.toolCalls.map((toolCall) =>
        toolCallSignature(toolCall.name, toolCall.args),
      ),
    );
    for (const signature of signaturesInRun) {
      signatureRunCounts.set(
        signature,
        (signatureRunCounts.get(signature) ?? 0) + 1,
      );
    }
  }

  const distinctOutputs = new Set(completed.map(normalizeOutput));

  return {
    totalCount: runs.length,
    completedCount: completed.length,
    errorCount: errored.length,
    latency,
    toolCallFrequencies: Array.from(signatureRunCounts.entries())
      .map(([signature, runCount]) => ({ signature, runCount }))
      .sort((a, b) => b.runCount - a.runCount),
    distinctOutputCount: distinctOutputs.size,
  };
}
