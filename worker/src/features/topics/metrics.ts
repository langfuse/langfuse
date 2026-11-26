import {
  ClickHouseResourceError,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { TopicsProviderUnavailable } from "./provider-error";

type TopicStage =
  | "execution"
  | "trace"
  | "summary"
  | "embedding"
  | "clustering"
  | "naming"
  | "assignment"
  | "storage";
export type TopicResult =
  | "generated"
  | "applicable"
  | "not_applicable"
  | "insufficient_input"
  | "empty_input"
  | "invalid_output"
  | "input_too_large"
  | "topics_found"
  | "no_topics"
  | "insufficient_data"
  | "no_applicable_summaries"
  | "assigned"
  | "outlier"
  | "name_conflict"
  | "name_kept"
  | "duplicate_name";
type TopicErrorReason =
  | TopicsProviderUnavailable["reason"]
  | "storage"
  | "numerical"
  | "input_too_large"
  | "definition_readback"
  | "assignment_visibility"
  | "unknown";

/** Who has to act on a failure. Topics builds the request, so rejected input is ours; a trace over the size limit or unusable output from the customer's model is the customer's. */
export function topicFailureOwner(
  reason: string,
): "platform" | "upstream" | "customer" {
  if (
    [
      "authentication",
      "configuration",
      "rate_limit",
      "content_filter",
      "input_too_large",
      "invalid_output",
    ].includes(reason)
  )
    return "customer";
  if (["timeout", "provider_error"].includes(reason)) return "upstream";
  return "platform";
}

/** The failure reason of an error, from its type; unrecognized errors keep the fallback. */
function topicErrorReason(
  error: unknown,
  fallbackReason: TopicErrorReason = "unknown",
): TopicErrorReason {
  let reason: TopicErrorReason =
    error instanceof TopicsProviderUnavailable ? error.reason : fallbackReason;
  if (!(error instanceof Error)) return reason;
  if (
    [
      "AI_NoObjectGeneratedError",
      "AI_NoOutputGeneratedError",
      "ZodError",
    ].includes(error.name)
  )
    reason = "invalid_output";
  if (["AbortError", "TimeoutError"].includes(error.name)) reason = "timeout";
  if (error.name === "TopicInputTooLarge") reason = "input_too_large";
  if (error.name === "TopicDefinitionReadbackError")
    reason = "definition_readback";
  if (error.name === "TopicAssignmentVisibilityError")
    reason = "assignment_visibility";
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
  if (ClickHouseResourceError.is(error))
    reason = error.errorType === "TIMEOUT" ? "timeout" : "storage";
  return reason;
}

/** Provider errors and model output decide by reason; any other error, such as our own timeout, is ours. */
function topicErrorOwner(
  error: unknown,
  reason: TopicErrorReason,
): "platform" | "upstream" | "customer" {
  return error instanceof TopicsProviderUnavailable ||
    reason === "input_too_large" ||
    reason === "invalid_output"
    ? topicFailureOwner(reason)
    : "platform";
}

// Statuses with their own operational meaning; exact codes are on the span.
const COUNTED_HTTP_STATUSES = new Set([400, 401, 403, 429]);

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
  const { httpStatus = 0, reason } = outcome;
  let status = reason ?? "ok";
  if (COUNTED_HTTP_STATUSES.has(httpStatus)) status = String(httpStatus);
  else if (httpStatus >= 400 && httpStatus < 500) status = "4xx";
  else if (httpStatus >= 500 && httpStatus < 600) status = "5xx";
  recordIncrement("langfuse.topics.llm_calls", 1, { stage, adapter, status });
}

/** Request body size of one model call, counted when it is sent, whether or not it succeeds. */
export function recordTopicRequestBytes(
  stage: "summary" | "embedding" | "naming",
  adapter: string,
  bytes: number,
): void {
  recordDistribution("langfuse.topics.llm_request_bytes", bytes, {
    stage,
    adapter,
    unit: "bytes",
  });
}

/** One cost estimate from the user's click to its end, queue wait included; the count per outcome is the success rate. */
/** Estimates are rare, so per-project and per-org tags stay low-cardinality. */
export function recordTopicCostEstimate(
  outcome: "done" | "failed" | "superseded",
  startedAt: number,
  tenant: { projectId: string; orgId: string | undefined },
  per1000TracesUsd?: number,
): void {
  const tags = {
    projectId: tenant.projectId,
    ...(tenant.orgId && { orgId: tenant.orgId }),
  };
  recordDistribution(
    "langfuse.topics.cost_estimate_duration_ms",
    Date.now() - startedAt,
    { ...tags, outcome, unit: "milliseconds" },
  );
  if (per1000TracesUsd !== undefined)
    recordDistribution(
      "langfuse.topics.cost_estimate_per_1000_traces_usd",
      per1000TracesUsd,
      tags,
    );
}

/** One instance per execution attempt prevents nested catches counting an error twice. */
export class TopicMetrics {
  private readonly reportedErrors = new WeakSet<object>();

  /** `tags` go on every stage metric, e.g. first attempt versus retry. */
  constructor(private readonly tags: Record<string, string> = {}) {}

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
        ...this.tags,
        stage,
        result,
        ...tags,
      });
  }

  /** Summary input size per format: the rendered text sent, and the JSON projection it replaced. */
  summaryInputCharacters(
    format: "text" | "json",
    characters: number,
    overLimit?: boolean,
  ): void {
    recordDistribution("langfuse.topics.summary_input_characters", characters, {
      ...this.tags,
      format,
      ...(overLimit !== undefined && { over_limit: String(overLimit) }),
    });
  }

  /** Approximate tokens of the text sent, from the cost estimate's characters-per-token ratio. */
  summaryInputEstimatedTokens(tokens: number): void {
    recordDistribution(
      "langfuse.topics.summary_input_estimated_tokens",
      tokens,
      this.tags,
    );
  }

  /** One fit of a rule's map, whether nightly, from setup or a manual refresh. */
  ruleFit(
    outcome: string,
    trigger: "automatic" | "manual",
    durationMs?: number,
    failure?: unknown,
  ): void {
    const tags = {
      outcome,
      trigger,
      // An interrupted fit has no failure, so it is ours.
      ...(outcome === "failed" || outcome === "interrupted"
        ? { owner: topicErrorOwner(failure, topicErrorReason(failure)) }
        : {}),
    };
    recordIncrement("langfuse.topics.rule_fits", 1, tags);
    if (durationMs === undefined) return;
    recordDistribution("langfuse.topics.rule_fit_duration_ms", durationMs, {
      outcome,
      trigger,
      unit: "milliseconds",
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
        { ...this.tags, stage, outcome, unit: "milliseconds" },
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
    const reason = topicErrorReason(error, fallbackReason);
    recordIncrement("langfuse.topics.errors", 1, {
      ...this.tags,
      stage,
      reason,
      owner: topicErrorOwner(error, reason),
    });
  }
}
