import {
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { TopicsProviderUnavailable } from "./provider-error";

type TopicStage =
  | "execution"
  | "trace"
  | "transcript"
  | "summary"
  | "embedding"
  | "clustering"
  | "naming"
  | "assignment"
  | "storage";
export type TopicResult =
  | "generated"
  | "cached"
  | "applicable"
  | "not_applicable"
  | "insufficient_input"
  | "invalid_output"
  | "input_too_large"
  | "topics_found"
  | "no_topics"
  | "insufficient_data"
  | "no_applicable_summaries"
  | "assigned"
  | "awaiting_topics"
  | "outlier"
  | "name_conflict"
  | "duplicate_name";
type TopicErrorReason =
  | TopicsProviderUnavailable["reason"]
  | "trace_load"
  | "storage"
  | "numerical"
  | "unknown";

const COUNTED_HTTP_STATUSES = new Set([
  400, 401, 402, 403, 404, 408, 413, 422, 429,
]);

/** Provider usage is counted per call, before local validation or persistence. */
export function recordTopicTokenUsage(
  stage: "summary" | "embedding" | "naming",
  usage: { input?: number; output?: number },
): void {
  for (const [direction, tokens] of Object.entries(usage)) {
    const tags = { stage, direction };
    if (
      typeof tokens === "number" &&
      Number.isSafeInteger(tokens) &&
      tokens >= 0
    )
      recordIncrement("langfuse.topics.tokens", tokens, tags);
    else recordIncrement("langfuse.topics.token_usage_missing", 1, tags);
  }
}

/** Counts every provider request with a bounded status tag. */
export function recordTopicModelCall(
  stage: "summary" | "embedding" | "naming",
  adapter: string,
  outcome: { httpStatus?: number; reason?: string },
): void {
  const { httpStatus, reason } = outcome;
  let status = reason ?? "ok";
  if (httpStatus)
    status = COUNTED_HTTP_STATUSES.has(httpStatus)
      ? String(httpStatus)
      : `${Math.floor(httpStatus / 100)}xx`;
  recordIncrement("langfuse.topics.llm_calls", 1, { stage, adapter, status });
}

/** One instance per execution attempt prevents nested catches counting an error twice. */
export class TopicMetrics {
  private readonly reportedErrors = new WeakSet<object>();

  execution(
    outcome: "started" | "completed" | "completed_with_errors" | "failed",
  ): void {
    recordIncrement("langfuse.topics.executions", 1, { outcome });
  }

  result(
    stage: TopicStage,
    result: TopicResult,
    count = 1,
    // Summary outcomes say whether the model or a local rule decided, and for which facet.
    tags: { source?: "model" | "rule"; facet?: string } = {},
  ): void {
    if (count > 0)
      recordIncrement("langfuse.topics.results", count, {
        stage,
        result,
        ...tags,
      });
  }

  clusteringWorkload(vectors: number, dimensions: number): void {
    const tags = { dimensions: String(dimensions) };
    recordIncrement("langfuse.topics.clustering_vectors", vectors, tags);
    recordDistribution("langfuse.topics.clustering_cohort_size", vectors, tags);
  }

  async measure<T>(
    stage: TopicStage,
    action: () => Promise<T>,
    fallbackReason: TopicErrorReason = "unknown",
  ): Promise<T> {
    const startedAt = performance.now();
    let outcome = "success";
    try {
      return await action();
    } catch (error) {
      outcome = "failed";
      this.error(stage, error, fallbackReason);
      throw error;
    } finally {
      recordDistribution(
        "langfuse.topics.stage_duration_ms",
        performance.now() - startedAt,
        { stage, outcome, unit: "milliseconds" },
      );
    }
  }

  error(
    stage: TopicStage,
    error: unknown,
    fallbackReason: TopicErrorReason = "unknown",
  ): void {
    if (error && typeof error === "object") {
      if (this.reportedErrors.has(error)) return;
      this.reportedErrors.add(error);
    }
    let reason: TopicErrorReason =
      error instanceof TopicsProviderUnavailable
        ? error.reason
        : fallbackReason;
    if (error instanceof Error) {
      if (
        [
          "AI_NoObjectGeneratedError",
          "AI_NoOutputGeneratedError",
          "ZodError",
        ].includes(error.name)
      )
        reason = "invalid_output";
      if (["AbortError", "TimeoutError"].includes(error.name))
        reason = "timeout";
      if (
        [
          "PrismaClientKnownRequestError",
          "PrismaClientUnknownRequestError",
          "PrismaClientInitializationError",
          "PrismaClientRustPanicError",
          "ClickHouseError",
        ].includes(error.name)
      )
        reason = "storage";
    }
    recordIncrement("langfuse.topics.errors", 1, { stage, reason });
  }
}
