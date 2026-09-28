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
import { env } from "../../env";
import { prepareAssembledTopicTranscript } from "./assembledTranscript";
import {
  countTopicTokens,
  embedTopicSummary,
  summarizeTopicTrace,
  summarizeTopicTraceFacets,
} from "./models";
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
  /** Topics text the batch job rendered from the same transcript. */
  topicsText?: string;
}): Promise<void> {
  if (!isTopicsProjectEnabled(input.projectId)) return;
  // Experiment switch: the rendered Topics text instead of the JSON projection.
  const format: "json" | "text" =
    env.LANGFUSE_TOPICS_TRANSCRIPT_FORMAT === "text" &&
    input.topicsText !== undefined
      ? "text"
      : "json";
  const prepared =
    format === "text"
      ? { text: input.topicsText ?? "", hasContent: Boolean(input.topicsText) }
      : prepareAssembledTopicTranscript(input.transcript);
  const transcriptMetrics = {
    transcriptCharacters: prepared.text.length,
    transcriptTokensO200k: countTopicTokens(prepared.text),
  };
  const facets = await ensureDefaultTopicFacets(input.projectId);
  const versions = facets.flatMap((facet) =>
    facet.projectId === input.projectId ? facet.versions.slice(0, 1) : [],
  );
  const config = topicProcessingConfigSchema.parse({});
  const dimensions = topicEmbeddingConfigSchema.parse({}).embeddingDimensions;
  const pending: TopicFacetVersion[] = [];
  for (const facet of versions) {
    const stored = await listTopicSummaries(input.projectId, {
      traceIds: [input.traceId],
      facetId: facet.facetId,
      facetVersion: facet.version,
    });
    if (
      !stored.some(
        (row) => row.traceId === input.traceId && row.state !== "summarized",
      )
    )
      pending.push(facet);
  }
  const shared = {
    ...input,
    text: prepared.text,
    hasContent: prepared.hasContent,
    format,
    transcriptMetrics,
    config,
    dimensions,
  };
  // Experiment switch: one model call for all pending facets of the trace.
  if (
    env.LANGFUSE_TOPICS_BUNDLE_FACETS === "true" &&
    pending.length > 1 &&
    prepared.hasContent
  ) {
    const names = new Map(facets.map((facet) => [facet.id, facet.name]));
    const keyed = pending.map((facet, index) => ({
      facet,
      key: `${(names.get(facet.facetId) ?? "facet").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${index + 1}`,
    }));
    const result = await summarizeTopicTraceFacets(
      keyed,
      prepared.text,
      config,
      format,
    );
    const rows: TopicSummary[] = [];
    for (const [index, { facet, key }] of keyed.entries()) {
      const base = baseSummary({ ...shared, facet });
      // The call's usage belongs to the trace; record it on the first row only.
      const usage =
        index === 0
          ? result
          : {
              providedUsageDetails: {},
              usageDetails: {},
              providedCostDetails: {},
              costDetails: {},
            };
      rows.push(
        await finalizeSummary(
          {
            ...base,
            metadata: {
              ...base.metadata,
              bundledFacets: keyed.length,
              bundleVariant: env.LANGFUSE_TOPICS_BUNDLE_VARIANT,
            },
          },
          {
            providedUsageDetails: usage.providedUsageDetails,
            usageDetails: usage.usageDetails,
            providedCostDetails: usage.providedCostDetails,
            costDetails: usage.costDetails,
            output: (result.output as Record<string, SummaryOutput>)[key],
          },
          dimensions,
        ),
      );
    }
    await writeTopicSummaries(rows);
    return;
  }
  for (const facet of pending)
    await writeTopicSummaries([await summarizeFacet({ ...shared, facet })]);
}

type SummaryOutput = {
  summary: string;
  status: "applicable" | "not_applicable" | "insufficient_input";
};
type SummaryResult = Pick<
  TopicSummary,
  | "providedUsageDetails"
  | "usageDetails"
  | "providedCostDetails"
  | "costDetails"
> & { output: SummaryOutput };

type FacetInput = {
  projectId: string;
  traceId: string;
  traceTimestamp: string;
  environment: string;
  traceName: string;
  facet: TopicFacetVersion;
  text: string;
  hasContent: boolean;
  format: "json" | "text";
  transcriptMetrics: Record<string, number>;
  config: ReturnType<typeof topicProcessingConfigSchema.parse>;
  dimensions: number;
};

async function summarizeFacet(input: FacetInput): Promise<TopicSummary> {
  const base = baseSummary(input);
  if (!input.hasContent) return base;
  const result = await summarizeTopicTrace(
    input.facet,
    input.text,
    input.config,
    input.format,
  );
  return finalizeSummary(base, result, input.dimensions);
}

function baseSummary(input: FacetInput): TopicSummary {
  const source = {
    projectId: input.projectId,
    facetId: input.facet.facetId,
    facetVersion: input.facet.version,
    traceId: input.traceId,
    sessionId: null,
  };
  return {
    ...source,
    triggerType: "manual_poc",
    unitStartTime: input.traceTimestamp,
    environment: input.environment,
    traceName: input.traceName,
    state: "insufficient_input",
    summary: "",
    embedding: [],
    transcriptId: "trace-batch",
    transcriptVersion:
      input.format === "text" ? "topics-text-v1" : TOPICS_TRANSCRIPT_VERSION,
    summaryModel:
      env.LANGFUSE_TOPICS_SUMMARY_MODEL_OVERRIDE ?? TOPICS_SUMMARY_MODEL,
    embeddingModel: TOPICS_EMBEDDING_MODEL,
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    processedAt: new Date().toISOString(),
    metadata: {
      input: input.format === "text" ? "topics-text" : "assembled-transcript",
      reasoningEffort: env.LANGFUSE_TOPICS_REASONING_EFFORT,
      ...input.transcriptMetrics,
    },
  };
}

async function finalizeSummary(
  base: TopicSummary,
  result: SummaryResult,
  dimensions: number,
): Promise<TopicSummary> {
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
  const embedded = await embedTopicSummary(summary, dimensions);
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
