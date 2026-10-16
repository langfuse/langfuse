import {
  listTopicSummaries,
  TOPICS_TRANSCRIPT_VERSION,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import {
  topicProcessingConfigSchema,
  type TopicFacet,
  type TopicProcessingConfig,
  type TopicFacetVersion,
  type TopicSummary,
} from "@langfuse/shared/topics";
import {
  instrumentAsync,
  isInternalEvalEnvironment,
  type Transcript,
} from "@langfuse/shared/src/server";
import { prepareAssembledTopicTranscript } from "./assembledTranscript";
import { TopicMetrics } from "./metrics";
import { embedTopicSummaries, summarizeTopicTraceFacets } from "./models";
import { TopicsProviderUnavailable } from "./provider-error";
import {
  mergeTopicModelUsage,
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
  return instrumentAsync(
    { name: "topics-trace-summary", traceScope: "topics" },
    async (span) => {
      span.setAttributes({
        "langfuse.project.id": input.projectId,
        "langfuse.trace.id": input.traceId,
      });
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
    baseSummary(input, version, config, embeddingModel),
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
          ),
        );
      } catch (error) {
        // Non-applicable facets are still persisted when the embedding fails.
        if (failure === undefined) failure = error;
      }
    }
    // One call summarizes and one embeds every facet of the trace; record their usage once.
    const traceUsage = embedded ? mergeTopicModelUsage(usage, embedded) : usage;
    rows = [];
    let embeddingIndex = 0;
    for (const { base, output } of accepted) {
      const rowUsage = rows.length > 0 ? NO_USAGE : traceUsage;
      if (output.status !== "applicable")
        rows.push({
          ...base,
          state:
            output.status === "not_applicable"
              ? "not_applicable"
              : "insufficient_input",
          ...rowUsage,
        });
      else if (embedded)
        rows.push({
          ...base,
          state: "complete",
          summary: output.summary.trim(),
          embedding: embedded.embeddings[embeddingIndex++],
          ...rowUsage,
        });
    }
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
  const prepared = prepareAssembledTopicTranscript(params.transcript);
  if (!prepared.hasContent) return undefined;
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
      // Valid facets can still be persisted after summary validation fails.
      if (!generated || ![...errors.values()].includes(error as never))
        throw error;
    });
  const result = generated!;
  const outputs = result.output as Record<string, FacetOutput>;
  return {
    results: facets.map((facet) => {
      const { key } = keyed[ordered.indexOf(facet)];
      const error = errors.get(key);
      return error ? { error } : { output: outputs[key] };
    }),
    usage: {
      providedUsageDetails: result.providedUsageDetails,
      usageDetails: result.usageDetails,
      providedCostDetails: result.providedCostDetails,
      costDetails: result.costDetails,
    },
  };
}

function baseSummary(
  input: {
    projectId: string;
    traceId: string;
    traceTimestamp: string;
    environment: string;
    traceName: string;
  },
  facet: TopicFacetVersion,
  config: ReturnType<typeof topicProcessingConfigSchema.parse>,
  embeddingModel: string,
): TopicSummary {
  return {
    projectId: input.projectId,
    facetId: facet.facetId,
    facetVersion: facet.version,
    traceId: input.traceId,
    sessionId: null,
    triggerType: "manual_poc",
    unitStartTime: input.traceTimestamp,
    environment: input.environment,
    traceName: input.traceName,
    state: "insufficient_input",
    summary: "",
    embedding: [],
    transcriptId: ASSEMBLED_TRANSCRIPT_ID,
    transcriptVersion: TOPICS_TRANSCRIPT_VERSION,
    summaryModel: config.summaryModel!,
    embeddingModel,
    ...NO_USAGE,
    processedAt: new Date().toISOString(),
    metadata: { input: "assembled-transcript" },
  };
}
