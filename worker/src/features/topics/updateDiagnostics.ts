import type { Span } from "@opentelemetry/api";
import { instrumentAsync, logger } from "@langfuse/shared/src/server";
import type { TopicFacetProgress } from "@langfuse/shared/topics";
import type { TopicMetrics } from "./metrics";

type TopicUpdateStage = Parameters<TopicMetrics["measure"]>[0];
type FallbackReason = Parameters<TopicMetrics["measure"]>[2];
type AttributeValue = string | number | boolean;

/** Steps whose duration blocks the worker's event loop (no awaited I/O). */
const SYNCHRONOUS_STEPS = new Set(["prototypes", "naming_evidence"]);

/**
 * Per-facet diagnostics for one Update topics attempt: a span per step and one
 * structured log with the cohort, its outcome and step timings. Metrics stay
 * untagged by project; logs and spans carry the IDs needed to attribute a slow
 * or blocking update to a project, execution, facet and run.
 */
export class TopicUpdateDiagnostics {
  private readonly startedAt = performance.now();
  private readonly fields: Record<string, AttributeValue> = {};
  private readonly timingsMs: Record<string, number> = {};

  constructor(
    private readonly metrics: TopicMetrics,
    private readonly span: Span,
    ids: {
      projectId: string;
      executionId: string;
      facetId: string;
      facetVersion: number;
    },
  ) {
    this.span.setAttribute("langfuse.project.id", ids.projectId);
    this.set(ids);
  }

  /** Records fields on the facet span (`langfuse.topics.*`) and the final log. */
  set(fields: Record<string, AttributeValue | null | undefined>): void {
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      this.fields[key] = value;
      this.span.setAttribute(`langfuse.topics.${snakeCase(key)}`, value);
    }
  }

  /** Runs one step in its own span, timed in the stage-duration metric and the log. */
  step<T>(
    stage: TopicUpdateStage,
    action: () => T | Promise<T>,
    fallbackReason?: FallbackReason,
  ): Promise<T> {
    return this.time(stage, () =>
      this.metrics.measure(stage, async () => action(), fallbackReason),
    );
  }

  /** Like `step`, for work that already records its own stage metric. */
  async time<T>(name: string, action: () => Promise<T>): Promise<T> {
    return instrumentAsync(
      { name: `topics-update-${name}`, traceScope: "topics" },
      async (span) => {
        const startedAt = performance.now();
        try {
          return await action();
        } finally {
          const elapsed = performance.now() - startedAt;
          span.setAttribute("langfuse.topics.duration_ms", Math.round(elapsed));
          this.timingsMs[name] = (this.timingsMs[name] ?? 0) + elapsed;
        }
      },
    );
  }

  finish(progress: TopicFacetProgress, error?: unknown): void {
    const durationMs = Math.round(performance.now() - this.startedAt);
    const timingsMs = Object.fromEntries(
      Object.entries(this.timingsMs).map(([name, ms]) => [
        name,
        Math.round(ms),
      ]),
    );
    const synchronousMs = Object.entries(timingsMs)
      .filter(([name]) => SYNCHRONOUS_STEPS.has(name))
      .map(([, ms]) => ms);
    const maxSynchronousStepMs = synchronousMs.length
      ? Math.max(...synchronousMs)
      : 0;
    const outcome = error ? "failed" : progress.outcome;
    this.set({
      outcome,
      durationMs,
      maxSynchronousStepMs,
      assignedCount: progress.counts.assigned,
      outlierCount: progress.counts.outlier,
    });
    const f = this.fields;
    const message =
      `Topics update facet ${outcome}: projectId=${f.projectId} executionId=${f.executionId} ` +
      `facet=${f.facetId}@${f.facetVersion} runId=${f.runId ?? "none"} cohort=${f.cohortSize ?? 0} ` +
      `topics=${f.topicCount ?? 0} durationMs=${durationMs} maxSynchronousStepMs=${maxSynchronousStepMs}`;
    const payload = { ...this.fields, timingsMs };
    if (error) logger.warn(message, { ...payload, error });
    else logger.info(message, payload);
  }
}

const snakeCase = (value: string) =>
  value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
