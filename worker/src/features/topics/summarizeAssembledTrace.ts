import type { TopicsModels } from "@langfuse/shared/topics/server";
import {
  DEFAULT_TOPIC_FACETS,
  topicProcessingConfigSchema,
  type TopicFacet,
  type TopicProcessingConfig,
  type TopicFacetVersion,
  type TopicRule,
  type TopicSummary,
} from "@langfuse/shared/topics";
import {
  contextWithLangfuseProps,
  getCurrentSpan,
  instrumentAsync,
  isInternalEvalEnvironment,
  prepareAssembledTopicTranscript,
  renderStoredTopicText,
  TOPICS_TEXT_VERSION,
  type ExecutionIssue,
  type Transcript,
} from "@langfuse/shared/src/server";
import { context as otelContext } from "@opentelemetry/api";
import { env as workerEnv } from "../../env";
import { TopicMetrics, type TopicResult } from "./metrics";
import {
  charsPerToken,
  embedTopicSummaries,
  summarizeTopicTraceFacets,
  TopicInputTooLarge,
} from "./llm/models";
import { TopicsProviderUnavailable } from "./provider-error";
import {
  mergeTopicModelUsage,
  splitTopicModelUsage,
  topicSummaryOutputError,
  type TopicModelUsage,
} from "./summaryResult";

type FacetOutput = {
  summary: string;
  status: "applicable" | "not_applicable" | "insufficient_input";
};
const NO_USAGE: TopicModelUsage = {
  providedUsageDetails: {},
  usageDetails: {},
  providedCostDetails: {},
  costDetails: {},
};

const BUILT_IN_FACETS = new Set(
  DEFAULT_TOPIC_FACETS.map((facet) => facet.name),
);

type TraceFacet = {
  name: string;
  version: TopicFacetVersion;
  builtIn: boolean;
};

/** Facets as the summary request lists them; pass built-in facets first. */
export function keyTopicTraceFacets(facets: TraceFacet[]) {
  return facets.map(({ name, version, builtIn }, index) => ({
    key: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${index + 1}`,
    facet: version,
    builtIn,
  }));
}

type TraceFacetResult =
  | { output: FacetOutput }
  | { error: TopicsProviderUnavailable };

type AssembledTraceInput = {
  projectId: string;
  traceId: string;
  sessionId: string | null;
  traceTimestamp: string;
  environment: string;
  traceName: string;
  transcript: Transcript | null;
  executionIssues: ExecutionIssue[];
  models: TopicsModels;
  facets: TopicFacet[];
  /** Dispatch revision of the stored transcript; stored as `transcript_id`. */
  revision: string;
  // Tags the attempt's metrics so retries are separable from first attempts.
  attempt?: "first" | "retry";
  /** Matched rules; each summary stores those that select its facet. */
  rules: Pick<TopicRule, "id" | "facetIds">[];
  /** The snapshot that seeded the trace; stored on its summaries. */
  executionId?: string;
};

export type TopicsFailedStage = "summary" | "embedding";

type AssembledTraceResult = {
  outcome: "disabled" | "unchanged" | "summarized";
  rows: TopicSummary[];
  // Set when some facets failed; rows still holds the valid ones.
  failure?: unknown;
  failedStage?: TopicsFailedStage;
};

/**
 * Summarizes one stored transcript with one model call for all given facets.
 * Does not write; rewriting a stored key replaces the row.
 */
export async function summarizeAssembledTrace(
  input: AssembledTraceInput,
): Promise<AssembledTraceResult> {
  if (isInternalEvalEnvironment(input.environment))
    return { outcome: "disabled", rows: [] };
  // The baggage tags this trace's spans and logs with its project.
  const projectContext = contextWithLangfuseProps({
    projectId: input.projectId,
  });
  return otelContext.with(projectContext, () =>
    instrumentAsync(
      { name: "topics-trace-summary", traceScope: "topics" },
      async (span) => {
        span.setAttribute("langfuse.trace.id", input.traceId);
        if (input.attempt)
          span.setAttribute("langfuse.topics.attempt", input.attempt);
        const metrics = new TopicMetrics(
          input.attempt ? { attempt: input.attempt } : {},
        );
        let result: AssembledTraceResult | undefined;
        try {
          await metrics.measure("trace", async () => {
            result = await summarizeEnabledTrace(input, metrics);
            if (result.failure !== undefined) throw result.failure;
          });
          span.setAttribute("langfuse.topics.trace_outcome", result!.outcome);
          return result!;
        } catch (error) {
          span.setAttribute("langfuse.topics.trace_outcome", "failed");
          if (result?.failedStage)
            span.setAttribute(
              "langfuse.topics.failed_stage",
              result.failedStage,
            );
          // A partial failure still returns the valid facets' rows.
          if (result && result.failure === error) return result;
          throw error;
        }
      },
    ),
  );
}

async function summarizeEnabledTrace(
  input: AssembledTraceInput,
  metrics: TopicMetrics,
): Promise<AssembledTraceResult> {
  const { models, facets } = input;
  const embeddingModel = models.embedding.model;
  const config = topicProcessingConfigSchema.parse({});
  const pending: TraceFacet[] = [];
  // Built-in facets first, each group in listing order, so the cached prompt prefix stays stable.
  const ordered = [
    ...facets.filter((facet) => facet.isBuiltIn),
    ...facets.filter((facet) => !facet.isBuiltIn),
  ];
  for (const facet of ordered) {
    const version = facet.versions[0];
    if (facet.projectId !== input.projectId || !version) continue;
    pending.push({ name: facet.name, version, builtIn: facet.isBuiltIn });
  }
  if (pending.length === 0) return { outcome: "unchanged", rows: [] };

  const bases = pending.map(({ version }) =>
    baseTopicSummary({
      projectId: input.projectId,
      traceId: input.traceId,
      sessionId: input.sessionId,
      unitStartTime: input.traceTimestamp,
      environment: input.environment,
      traceName: input.traceName,
      transcriptId: input.revision,
      facet: version,
      summaryModel: models.summary.model,
      embeddingModel,
      ruleIds: input.rules
        .filter((rule) => rule.facetIds.includes(version.facetId))
        .map((rule) => rule.id),
      // A snapshot's summaries carry its ID, for its progress and cost.
      executionId: input.executionId ?? null,
      metadata: { input: "topics-text" },
    }),
  );
  const callMetadata = (rows: TopicSummary[]) => ({
    source_trace_id: input.traceId,
    source_environment: input.environment,
    ...(input.executionId
      ? { execution_id: input.executionId }
      : { rule_ids: [...new Set(rows.flatMap((row) => row.ruleIds))] }),
  });
  let failure: unknown;
  let failedStage: TopicsFailedStage | undefined;
  let summarized: Awaited<ReturnType<typeof summarizeTraceFacets>>;
  try {
    summarized = await summarizeTraceFacets({
      models,
      facets: pending,
      metadata: callMetadata(bases),
      transcript: input.transcript,
      executionIssues: input.executionIssues,
      config,
      metrics,
    });
  } catch (error) {
    if (!(error instanceof TopicInputTooLarge)) throw error;
    return {
      outcome: "summarized",
      rows: bases.map((base) => ({ ...base, state: "input_too_large" })),
      failure: error,
      failedStage: "summary",
    };
  }
  let rows = bases;
  if (summarized) {
    const accepted = summarized.results.flatMap((result, index) => {
      if ("error" in result) {
        if (failure === undefined) {
          failure = result.error;
          failedStage = "summary";
        }
        return [];
      }
      return [{ base: bases[index], output: result.output }];
    });
    const applicable = accepted.filter(
      ({ output }) => output.status === "applicable",
    );
    let embedded: Awaited<ReturnType<typeof embedTopicSummaries>> | undefined;
    if (applicable.length > 0) {
      try {
        embedded = await metrics.measure("embedding", () =>
          embedTopicSummaries(
            models.embedding,
            applicable.map(({ output }) => output.summary.trim()),
            models.embedding.dimensions,
            models.projectId,
            callMetadata(applicable.map(({ base }) => base)),
          ),
        );
      } catch (error) {
        // Outranks invalid facet output so the caller retries the unembedded facets; non-applicable rows still persist.
        failure = error;
        failedStage = "embedding";
      }
    }
    const summaryShares = splitTopicModelUsage(
      summarized.usage,
      accepted.length,
    );
    const embeddingShares = embedded
      ? splitTopicModelUsage(embedded, applicable.length)
      : [];
    const generated: TopicSummary[] = [];
    let embeddingIndex = 0;
    for (const [index, { base, output }] of accepted.entries()) {
      if (output.status !== "applicable")
        generated.push({
          ...base,
          ...summaryShares[index],
          state: output.status,
        });
      else if (embedded)
        generated.push({
          ...base,
          ...mergeTopicModelUsage(
            summaryShares[index],
            embeddingShares[embeddingIndex],
          ),
          state: "complete",
          summary: output.summary.trim(),
          embedding: embedded.embeddings[embeddingIndex++],
        });
    }
    // Split transcript bytes across retained rows, giving the remainder to the first rows.
    const bytes = Math.floor(summarized.transcriptBytes / generated.length);
    const extra = summarized.transcriptBytes - bytes * generated.length;
    rows = generated.map((row, index) => ({
      ...row,
      transcriptBytes: bytes + (index < extra ? 1 : 0),
    }));
  }
  return { outcome: "summarized", rows, failure, failedStage };
}

/**
 * Summarizes the given facets of one trace in a single model call on the
 * projected transcript.
 * Returns undefined without a call when the transcript has no content; results
 * follow the order of `facets`, with an error for each invalid facet output.
 */
async function summarizeTraceFacets(params: {
  models: TopicsModels;
  facets: TraceFacet[];
  transcript: Transcript | null;
  executionIssues: ExecutionIssue[];
  config: TopicProcessingConfig;
  metadata: Record<string, unknown>;
  metrics: TopicMetrics;
}): Promise<
  | {
      results: TraceFacetResult[];
      usage: TopicModelUsage;
      transcriptBytes: number;
    }
  | undefined
> {
  const { models, facets, config, metrics } = params;
  const outcome = (
    facet: TraceFacet,
    result: TopicResult,
    source: "model" | "rule",
  ) => metrics.result("summary", result, 1, { source, facet: facetTag(facet) });
  // The projection's content check gates the text, whose run-facts header is never empty.
  const projection = prepareAssembledTopicTranscript(params.transcript);
  if (!projection.hasContent || !params.transcript) {
    for (const facet of facets) outcome(facet, "empty_input", "rule");
    return undefined;
  }
  const text = renderStoredTopicText(params.transcript, params.executionIssues);
  metrics.summaryInputCharacters(
    "text",
    text.length,
    text.length > workerEnv.LANGFUSE_TOPICS_MAX_INPUT_CHARACTERS,
  );
  metrics.summaryInputEstimatedTokens(
    Math.ceil(text.length / charsPerToken(models.summary.model)),
  );
  metrics.summaryInputCharacters("json", projection.text.length);
  // The caller lists built-in facets first, so the cached prompt prefix stays stable.
  const keyed = keyTopicTraceFacets(facets);
  const errors = new Map<string, TopicsProviderUnavailable>();
  const withoutSummary = new Set<string>();
  let outputs: Record<string, FacetOutput> = {};
  let generated:
    | Awaited<ReturnType<typeof summarizeTopicTraceFacets>>
    | undefined;
  await metrics
    .measure("summary", async () => {
      generated = await summarizeTopicTraceFacets(
        models,
        keyed,
        text,
        config,
        params.metadata,
      );
      // An applicable status without a description says nothing; keep it as insufficient input.
      outputs = Object.fromEntries(
        Object.entries(generated.output as Record<string, FacetOutput>).map(
          ([key, output]): [string, FacetOutput] => {
            if (output.status !== "applicable" || output.summary.trim())
              return [key, output];
            withoutSummary.add(key);
            return [
              key,
              { ...output, status: "insufficient_input", summary: "" },
            ];
          },
        ),
      );
      for (const { key } of keyed) {
        const message = outputs[key]
          ? topicSummaryOutputError(outputs[key])
          : "The model response is missing a facet.";
        if (!message) continue;
        const error = new TopicsProviderUnavailable(message, "invalid_output");
        errors.set(key, error);
        metrics.error("summary", error);
      }
      const [first] = errors.values();
      if (first) throw first;
    })
    .catch((error: unknown) => {
      if (error instanceof TopicInputTooLarge)
        for (const facet of facets) outcome(facet, "input_too_large", "rule");
      // An unusable response fails every facet before the per-facet checks run.
      else if (
        (error instanceof TopicsProviderUnavailable
          ? error.reason === "invalid_output"
          : error instanceof Error && error.name === "ZodError") &&
        ![...errors.values()].includes(error as never)
      )
        for (const facet of facets) outcome(facet, "invalid_output", "rule");
      // Valid facets can still be persisted after summary validation fails.
      if (!generated || ![...errors.values()].includes(error as never))
        throw error;
    });
  const result = generated!;
  const results = facets.map((facet, index): TraceFacetResult => {
    const { key } = keyed[index];
    const error = errors.get(key);
    if (error) outcome(facet, "invalid_output", "rule");
    else
      outcome(
        facet,
        outputs[key].status,
        withoutSummary.has(key) ? "rule" : "model",
      );
    return error ? { error } : { output: outputs[key] };
  });
  const counts: Record<string, number> = {};
  for (const item of results) {
    const key = `langfuse.topics.facets.${"error" in item ? "invalid_output" : item.output.status}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  getCurrentSpan()?.setAttributes(counts);
  return {
    results,
    transcriptBytes: Buffer.byteLength(text, "utf8"),
    usage: {
      providedUsageDetails: result.providedUsageDetails,
      usageDetails: result.usageDetails,
      providedCostDetails: result.providedCostDetails,
      costDetails: result.costDetails,
    },
  };
}

/** Built-in facet names are a fixed set; custom names would be unbounded metric tags. */
function facetTag(facet: TraceFacet): string {
  return facet.builtIn && BUILT_IN_FACETS.has(facet.name)
    ? facet.name.toLowerCase()
    : "custom";
}

/** The summary row processing starts from: written as is when the transcript has nothing for the model. */
function baseTopicSummary(params: {
  projectId: string;
  traceId: string;
  sessionId: string | null;
  unitStartTime: string;
  environment: string;
  traceName: string;
  transcriptId: string;
  facet: TopicFacetVersion;
  summaryModel: string;
  embeddingModel: string;
  ruleIds: string[];
  executionId: string | null;
  metadata: Record<string, unknown>;
}): TopicSummary {
  return {
    projectId: params.projectId,
    facetId: params.facet.facetId,
    facetVersion: params.facet.version,
    traceId: params.traceId,
    sessionId: params.sessionId,
    triggerType: params.executionId ? "snapshot" : "rule",
    ruleIds: params.ruleIds,
    executionId: params.executionId,
    unitStartTime: params.unitStartTime,
    environment: params.environment,
    traceName: params.traceName,
    state: "empty_input",
    summary: "",
    embedding: [],
    transcriptId: params.transcriptId,
    transcriptVersion: TOPICS_TEXT_VERSION,
    transcriptBytes: 0,
    summaryModel: params.summaryModel,
    embeddingModel: params.embeddingModel,
    ...NO_USAGE,
    processedAt: new Date().toISOString(),
    metadata: params.metadata,
  };
}
