import {
  listTopicSummaries,
  TOPICS_TRANSCRIPT_VERSION,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import {
  DEFAULT_TOPIC_FACETS,
  topicProcessingConfigSchema,
  type TopicFacet,
  type TopicProcessingConfig,
  type TopicFacetVersion,
  type TopicSummary,
} from "@langfuse/shared/topics";
import {
  contextWithLangfuseProps,
  getCurrentSpan,
  instrumentAsync,
  isInternalEvalEnvironment,
  type Transcript,
} from "@langfuse/shared/src/server";
import { context as otelContext } from "@opentelemetry/api";
import { prepareAssembledTopicTranscript } from "./assembledTranscript";
import { TopicMetrics, type TopicResult } from "./metrics";
import {
  embedTopicSummaries,
  summarizeTopicTraceFacets,
  TopicInputTooLarge,
} from "./models";
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

// Rows from this transcript producer are interchangeable between trace-batch and manual processing.
export const ASSEMBLED_TRANSCRIPT_ID = "trace-batch";

export type TraceFacet = {
  name: string;
  version: TopicFacetVersion;
  builtIn: boolean;
};

type TraceFacetResult =
  | { output: FacetOutput }
  | { error: TopicsProviderUnavailable };

type AssembledTraceInput = {
  projectId: string;
  traceId: string;
  sessionId: string | null;
  traceTimestamp: string;
  jobEnqueuedAt: Date;
  environment: string;
  traceName: string;
  transcript: Transcript | null;
  models: TopicsModels;
  facets: TopicFacet[];
};

type AssembledTraceResult = {
  outcome: "disabled" | "unchanged" | "summarized";
  rows: TopicSummary[];
  // Set when some facets failed; rows still holds the valid ones.
  failure?: unknown;
};

/**
 * Summarizes one trace from the transcript the batch job already assembled,
 * with one model call for all of its configured facets. Does not load
 * observations again or write; the batch job stores the returned rows.
 */
export async function summarizeAssembledTrace(
  input: AssembledTraceInput,
): Promise<AssembledTraceResult> {
  if (isInternalEvalEnvironment(input.environment))
    return { outcome: "disabled", rows: [] };
  // Trace-batch jobs span projects; the baggage tags this trace's spans and logs.
  const projectContext = contextWithLangfuseProps({
    projectId: input.projectId,
  });
  return otelContext.with(projectContext, () =>
    instrumentAsync(
      { name: "topics-trace-summary", traceScope: "topics" },
      async (span) => {
        span.setAttribute("langfuse.trace.id", input.traceId);
        const metrics = new TopicMetrics();
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
  const config = topicProcessingConfigSchema.parse({
    summaryModel: models.summary.model,
  });
  const pending: TraceFacet[] = [];
  // Built-in facets first, each group in listing order, so the cached prompt prefix stays stable.
  const ordered = [
    ...facets.filter((facet) => facet.isBuiltIn),
    ...facets.filter((facet) => !facet.isBuiltIn),
  ];
  const timestamp = Date.parse(input.traceTimestamp);
  const timeRange = {
    from: new Date(timestamp),
    to: new Date(timestamp + 1),
  };
  for (const facet of ordered) {
    const version = facet.versions[0];
    if (facet.projectId !== input.projectId || !version) continue;
    const stored = await listTopicSummaries(
      input.projectId,
      {
        traceIds: [input.traceId],
        facetId: version.facetId,
        facetVersion: version.version,
      },
      timeRange,
    );
    if (
      stored.some(
        (summary) =>
          Date.parse(summary.processedAt) >= input.jobEnqueuedAt.getTime(),
      )
    )
      continue;
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
      facet: version,
      summaryModel: config.summaryModel!,
      embeddingModel,
      triggerType: "automatic",
      metadata: { input: "assembled-transcript" },
    }),
  );
  const summarized = await summarizeTraceFacets({
    models,
    facets: pending,
    transcript: input.transcript,
    config,
    metadata: {
      source_trace_id: input.traceId,
      source_environment: input.environment,
    },
    metrics,
  });
  let rows = bases;
  let failure: unknown;
  if (summarized) {
    const usage = summarized.usage;
    const accepted = summarized.results.flatMap((result, index) => {
      if ("error" in result) {
        if (failure === undefined) failure = result.error;
        return [];
      }
      return [{ base: bases[index], output: result.output }];
    });
    const applicable = accepted
      .filter(({ output }) => output.status === "applicable")
      .map(({ output }) => output.summary.trim());
    let embedded: Awaited<ReturnType<typeof embedTopicSummaries>> | undefined;
    if (applicable.length > 0) {
      try {
        embedded = await metrics.measure("embedding", () =>
          embedTopicSummaries(
            models.embedding,
            applicable,
            models.embedding.dimensions,
            models.projectId,
          ),
        );
      } catch (error) {
        // Non-applicable facets are still persisted when the embedding fails.
        if (failure === undefined) failure = error;
      }
    }
    // One call summarizes and one embeds every facet of the trace; each row carries an equal share.
    const traceUsage = embedded ? mergeTopicModelUsage(usage, embedded) : usage;
    const generated: TopicSummary[] = [];
    let embeddingIndex = 0;
    for (const { base, output } of accepted) {
      if (output.status !== "applicable")
        generated.push({
          ...base,
          state:
            output.status === "not_applicable"
              ? "not_applicable"
              : "insufficient_input",
        });
      else if (embedded)
        generated.push({
          ...base,
          state: "complete",
          summary: output.summary.trim(),
          embedding: embedded.embeddings[embeddingIndex++],
        });
    }
    const shares = splitTopicModelUsage(traceUsage, generated.length);
    rows = generated.map((row, index) => ({ ...row, ...shares[index] }));
  }
  return { outcome: "summarized", rows, failure };
}

/**
 * Summarizes the given facets of one trace in a single model call on the
 * projected transcript. Trace-batch and manual processing share this request.
 * Returns undefined without a call when the transcript has no content; results
 * follow the order of `facets`, with an error for each invalid facet output.
 */
export async function summarizeTraceFacets(params: {
  models: TopicsModels;
  facets: TraceFacet[];
  transcript: Transcript | null;
  config: TopicProcessingConfig;
  metadata: Record<string, unknown>;
  metrics: TopicMetrics;
}): Promise<
  { results: TraceFacetResult[]; usage: TopicModelUsage } | undefined
> {
  const { models, facets, config, metrics } = params;
  const outcome = (
    facet: TraceFacet,
    result: TopicResult,
    source: "model" | "rule",
  ) => metrics.result("summary", result, 1, { source, facet: facetTag(facet) });
  const prepared = prepareAssembledTopicTranscript(params.transcript);
  if (!prepared.hasContent) {
    for (const facet of facets) outcome(facet, "insufficient_input", "rule");
    return undefined;
  }
  // Built-in facets first, each group in listing order, so the cached prompt prefix stays stable.
  const ordered = [
    ...facets.filter((facet) => facet.builtIn),
    ...facets.filter((facet) => !facet.builtIn),
  ];
  const keyed = ordered.map(({ name, version, builtIn }, index) => ({
    key: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${index + 1}`,
    facet: version,
    builtIn,
  }));
  const errors = new Map<string, TopicsProviderUnavailable>();
  let generated:
    | Awaited<ReturnType<typeof summarizeTopicTraceFacets>>
    | undefined;
  await metrics
    .measure("summary", async () => {
      generated = await summarizeTopicTraceFacets(
        models,
        keyed,
        prepared.text,
        config,
        params.metadata,
      );
      const outputs = generated.output as Record<string, FacetOutput>;
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
  const outputs = result.output as Record<string, FacetOutput>;
  const results = facets.map((facet): TraceFacetResult => {
    const { key } = keyed[ordered.indexOf(facet)];
    const error = errors.get(key);
    if (error) outcome(facet, "invalid_output", "rule");
    else outcome(facet, outputs[key].status, "model");
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

/** The summary row both processing paths start from, before any model call. */
export function baseTopicSummary(params: {
  projectId: string;
  traceId: string;
  sessionId: string | null;
  unitStartTime: string;
  environment: string;
  traceName: string;
  facet: TopicFacetVersion;
  summaryModel: string;
  embeddingModel: string;
  triggerType: "automatic" | "manual";
  metadata: Record<string, unknown>;
}): TopicSummary {
  return {
    projectId: params.projectId,
    facetId: params.facet.facetId,
    facetVersion: params.facet.version,
    traceId: params.traceId,
    sessionId: params.sessionId,
    triggerType: params.triggerType,
    unitStartTime: params.unitStartTime,
    environment: params.environment,
    traceName: params.traceName,
    state: "insufficient_input",
    summary: "",
    embedding: [],
    transcriptId: ASSEMBLED_TRANSCRIPT_ID,
    transcriptVersion: TOPICS_TRANSCRIPT_VERSION,
    summaryModel: params.summaryModel,
    embeddingModel: params.embeddingModel,
    ...NO_USAGE,
    processedAt: new Date().toISOString(),
    metadata: params.metadata,
  };
}
