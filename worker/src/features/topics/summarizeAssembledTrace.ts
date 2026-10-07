import {
  ensureDefaultTopicFacets,
  isTopicsProjectEnabled,
  listTopicSummaries,
  TOPICS_TRANSCRIPT_VERSION,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import {
  topicEmbeddingConfigSchema,
  topicProcessingConfigSchema,
  type TopicFacetVersion,
  type TopicSummary,
} from "@langfuse/shared/topics";
import {
  instrumentAsync,
  recordIncrement,
  type Transcript,
} from "@langfuse/shared/src/server";
import { prepareAssembledTopicTranscript } from "./assembledTranscript";
import { TopicMetrics } from "./metrics";
import { embedTopicSummary, summarizeTopicTrace } from "./models";
import { TopicsProviderUnavailable } from "./provider-error";
import { mergeTopicModelUsage, topicSummaryOutputError } from "./summaryResult";
import { getTopicsModelConfig } from "@langfuse/shared/topics/server";

type AssembledTraceInput = {
  projectId: string;
  traceId: string;
  traceTimestamp: string;
  environment: string;
  traceName: string;
  transcript: Transcript | null;
};

/**
 * Summarizes one trace from the transcript the batch job already assembled.
 * Does not load observations again.
 */
export async function summarizeAssembledTrace(
  input: AssembledTraceInput,
): Promise<"disabled" | "unchanged" | "summarized"> {
  if (!isTopicsProjectEnabled(input.projectId)) return "disabled";
  return instrumentAsync(
    { name: "topics-trace-summary", traceScope: "topics" },
    async (span) => {
      span.setAttributes({
        "langfuse.project.id": input.projectId,
        "langfuse.trace.id": input.traceId,
      });
      const metrics = new TopicMetrics();
      try {
        const outcome = await metrics.measure("trace", () =>
          summarizeEnabledTrace(input, metrics),
        );
        span.setAttribute("langfuse.topics.trace_outcome", outcome);
        return outcome;
      } catch (error) {
        span.setAttribute("langfuse.topics.trace_outcome", "failed");
        throw error;
      }
    },
  );
}

async function summarizeEnabledTrace(
  input: AssembledTraceInput,
  metrics: TopicMetrics,
): Promise<"unchanged" | "summarized"> {
  let prepared: ReturnType<typeof prepareAssembledTopicTranscript> | undefined;
  const models = getTopicsModelConfig();
  if (!models.summaryModel || !models.embeddingModel)
    throw new TopicsProviderUnavailable(
      "Configure LANGFUSE_TOPICS_SUMMARY_MODEL and LANGFUSE_TOPICS_EMBEDDING_MODEL before processing Topics traces.",
      "authentication",
    );
  const facets = await ensureDefaultTopicFacets(input.projectId);
  const versions = facets.flatMap((facet) =>
    facet.projectId === input.projectId ? facet.versions.slice(0, 1) : [],
  );
  const config = topicProcessingConfigSchema.parse({
    summaryModel: models.summaryModel,
  });
  const embeddingConfig = topicEmbeddingConfigSchema.parse({
    embeddingModel: models.embeddingModel,
  });
  const dimensions = embeddingConfig.embeddingDimensions;
  const timestamp = Date.parse(input.traceTimestamp);
  const timeRange = {
    from: new Date(timestamp),
    to: new Date(timestamp + 1),
  };
  let written = 0;
  for (const facet of versions) {
    const stored = await listTopicSummaries(
      input.projectId,
      {
        traceIds: [input.traceId],
        facetId: facet.facetId,
        facetVersion: facet.version,
      },
      timeRange,
    );
    if (stored.length) continue;
    if (!prepared) prepared = prepareAssembledTopicTranscript(input.transcript);
    const summary = await summarizeFacet({
      ...input,
      facet,
      text: prepared.text,
      hasContent: prepared.hasContent,
      config,
      dimensions,
      embeddingModel: embeddingConfig.embeddingModel,
      metrics,
    });
    await metrics.measure("storage", () => writeTopicSummaries([summary]));
    recordIncrement("langfuse.topics.facet_summaries", 1, {
      state: summary.state,
    });
    written++;
  }
  return written ? "summarized" : "unchanged";
}

async function summarizeFacet(input: {
  projectId: string;
  traceId: string;
  traceTimestamp: string;
  environment: string;
  traceName: string;
  facet: TopicFacetVersion;
  text: string;
  hasContent: boolean;
  config: ReturnType<typeof topicProcessingConfigSchema.parse>;
  dimensions: number;
  embeddingModel?: string;
  metrics: TopicMetrics;
}): Promise<TopicSummary> {
  const source = {
    projectId: input.projectId,
    facetId: input.facet.facetId,
    facetVersion: input.facet.version,
    traceId: input.traceId,
    sessionId: null,
  };
  const base: TopicSummary = {
    ...source,
    triggerType: "manual_poc",
    unitStartTime: input.traceTimestamp,
    environment: input.environment,
    traceName: input.traceName,
    state: "insufficient_input",
    summary: "",
    embedding: [],
    transcriptId: "trace-batch",
    transcriptVersion: TOPICS_TRANSCRIPT_VERSION,
    summaryModel: input.config.summaryModel!,
    embeddingModel: input.embeddingModel!,
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    processedAt: new Date().toISOString(),
    metadata: { input: "assembled-transcript" },
  };
  if (!input.hasContent) return base;
  const result = await input.metrics.measure("summary", async () => {
    const result = await summarizeTopicTrace(
      input.facet,
      input.text,
      input.config,
    );
    const error = topicSummaryOutputError(result.output);
    if (error) throw new TopicsProviderUnavailable(error, "invalid_output");
    return result;
  });
  const applicable = result.output.status === "applicable";
  const summary = result.output.summary.trim();
  if (!applicable) {
    return {
      ...base,
      state:
        result.output.status === "not_applicable"
          ? "not_applicable"
          : "insufficient_input",
      providedUsageDetails: result.providedUsageDetails,
      usageDetails: result.usageDetails,
      providedCostDetails: result.providedCostDetails,
      costDetails: result.costDetails,
    };
  }
  const embedded = await input.metrics.measure("embedding", () =>
    embedTopicSummary(summary, input.dimensions, input.embeddingModel!),
  );
  return {
    ...base,
    state: "complete",
    summary,
    embedding: embedded.embedding,
    ...mergeTopicModelUsage(result, embedded),
  };
}
