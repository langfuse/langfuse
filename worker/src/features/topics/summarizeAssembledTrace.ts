import {
  ensureDefaultTopicFacets,
  isTopicsProjectEnabled,
  listTopicSummaries,
  TOPICS_TRANSCRIPT_VERSION,
  writeTopicSummaries,
} from "@langfuse/shared/topics/server";
import {
  TOPICS_EMBEDDING_MODEL,
  TOPICS_SUMMARY_MODEL,
  topicEmbeddingConfigSchema,
  topicProcessingConfigSchema,
  type TopicFacetVersion,
  type TopicSummary,
} from "@langfuse/shared/topics";
import type { Transcript } from "@langfuse/shared/src/server";
import { prepareAssembledTopicTranscript } from "./assembledTranscript";
import { embedTopicSummary, summarizeTopicTrace } from "./models";
import { TopicsProviderUnavailable } from "./provider-error";

/**
 * Summarizes one trace from the transcript the batch job already assembled.
 * Does not load observations again.
 */
export async function summarizeAssembledTrace(input: {
  projectId: string;
  traceId: string;
  traceTimestamp: string;
  environment: string;
  traceName: string;
  transcript: Transcript | null;
}): Promise<void> {
  if (!isTopicsProjectEnabled(input.projectId)) return;
  const prepared = prepareAssembledTopicTranscript(input.transcript);
  const facets = await ensureDefaultTopicFacets(input.projectId);
  const versions = facets.flatMap((facet) =>
    facet.projectId === input.projectId ? facet.versions.slice(0, 1) : [],
  );
  const config = topicProcessingConfigSchema.parse({});
  const dimensions = topicEmbeddingConfigSchema.parse({}).embeddingDimensions;
  for (const facet of versions) {
    const stored = await listTopicSummaries(input.projectId, {
      traceIds: [input.traceId],
      facetId: facet.facetId,
      facetVersion: facet.version,
    });
    if (
      stored.some(
        (row) => row.traceId === input.traceId && row.state !== "summarized",
      )
    )
      continue;
    await writeTopicSummaries([
      await summarizeFacet({
        ...input,
        facet,
        text: prepared.text,
        hasContent: prepared.hasContent,
        config,
        dimensions,
      }),
    ]);
  }
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
    summaryModel: TOPICS_SUMMARY_MODEL,
    embeddingModel: TOPICS_EMBEDDING_MODEL,
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    processedAt: new Date().toISOString(),
    metadata: { input: "assembled-transcript" },
  };
  if (!input.hasContent) return base;
  const result = await summarizeTopicTrace(
    input.facet,
    input.text,
    input.config,
  );
  const applicable = result.output.status === "applicable";
  const summary = result.output.summary.trim();
  if (applicable && (!summary || summary.length > 2000))
    throw new TopicsProviderUnavailable(
      "Applicable facet summary must contain a concise summary.",
      "invalid_output",
    );
  if (!applicable && summary)
    throw new TopicsProviderUnavailable(
      "Non-applicable facet result contains a summary.",
      "invalid_output",
    );
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
  const embedded = await embedTopicSummary(summary, input.dimensions);
  return {
    ...base,
    state: "complete",
    summary,
    embedding: embedded.embedding,
    providedUsageDetails: {
      ...result.providedUsageDetails,
      ...embedded.providedUsageDetails,
    },
    usageDetails: { ...result.usageDetails, ...embedded.usageDetails },
    providedCostDetails: {
      ...result.providedCostDetails,
      ...embedded.providedCostDetails,
    },
    costDetails: { ...result.costDetails, ...embedded.costDetails },
  };
}
