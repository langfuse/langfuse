import {
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { TopicsProviderUnavailable } from "./provider-error";

type TopicStage =
  | "execution"
  | "transcript"
  | "summary"
  | "embedding"
  | "clustering"
  | "naming"
  | "assignment"
  | "storage";
type TopicResult =
  | "generated"
  | "cached"
  | "reused"
  | "not_applicable"
  | "insufficient_input"
  | "topics_found"
  | "no_topics"
  | "insufficient_data"
  | "no_applicable_summaries"
  | "assigned"
  | "awaiting_topics"
  | "outlier";
type TopicErrorReason =
  | TopicsProviderUnavailable["reason"]
  | "trace_load"
  | "storage"
  | "numerical"
  | "unknown";

/** One instance per execution attempt prevents nested catches counting an error twice. */
export class TopicMetrics {
  private readonly reportedErrors = new WeakSet<object>();
  private readonly countedEmbeddings = new Set<string>();

  execution(
    outcome: "started" | "completed" | "completed_with_errors" | "failed",
  ): void {
    recordIncrement("langfuse.topics.executions", 1, { outcome });
  }

  result(stage: TopicStage, result: TopicResult, count = 1): void {
    if (count > 0)
      recordIncrement("langfuse.topics.results", count, { stage, result });
  }

  embeddingResult(summaryId: string, result: "generated" | "cached"): void {
    // Count an accepted vector once per attempt.
    if (result === "cached" && this.countedEmbeddings.has(summaryId)) return;
    this.countedEmbeddings.add(summaryId);
    this.result("embedding", result);
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
