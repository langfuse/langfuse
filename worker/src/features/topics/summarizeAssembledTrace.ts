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
import { recordIncrement, type Transcript } from "@langfuse/shared/src/server";
import { prepareAssembledTopicTranscript } from "./assembledTranscript";
import { embedTopicSummary, summarizeTopicTraceFacets } from "./models";
import { TopicsProviderUnavailable } from "./provider-error";
import {
  mergeTopicModelUsage,
  topicSummaryOutputError,
  type TopicModelUsage,
} from "./summaryResult";
import { getTopicsModelConfig } from "@langfuse/shared/topics/server";

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

/**
 * Summarizes one trace from the transcript the batch job already assembled,
 * with one model call for all of its pending facets. Does not load
 * observations again.
 */
export async function summarizeAssembledTrace(input: {
  projectId: string;
  traceId: string;
  traceTimestamp: string;
  environment: string;
  traceName: string;
  transcript: Transcript | null;
}): Promise<"disabled" | "unchanged" | "summarized"> {
  if (!isTopicsProjectEnabled(input.projectId)) return "disabled";
  const models = getTopicsModelConfig();
  if (!models.summaryModel || !models.embeddingModel)
    throw new TopicsProviderUnavailable(
      "Configure LANGFUSE_TOPICS_SUMMARY_MODEL and LANGFUSE_TOPICS_EMBEDDING_MODEL before processing Topics traces.",
      "authentication",
    );
  const { embeddingModel } = models;
  const facets = await ensureDefaultTopicFacets(input.projectId);
  const config = topicProcessingConfigSchema.parse({
    summaryModel: models.summaryModel,
  });
  const embeddingConfig = topicEmbeddingConfigSchema.parse({
    embeddingModel,
  });
  const timestamp = Date.parse(input.traceTimestamp);
  const timeRange = {
    from: new Date(timestamp),
    to: new Date(timestamp + 1),
  };
  const pending: { name: string; version: TopicFacetVersion }[] = [];
  for (const facet of facets) {
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
    if (!stored.length) pending.push({ name: facet.name, version });
  }
  if (!pending.length) return "unchanged";

  const prepared = prepareAssembledTopicTranscript(input.transcript);
  const bases = pending.map(({ version }) =>
    baseSummary(input, version, config, embeddingModel),
  );
  let rows = bases;
  let failure: unknown;
  if (prepared.hasContent) {
    const keyed = pending.map(({ name, version }, index) => ({
      key: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${index + 1}`,
      facet: version,
    }));
    const result = await summarizeTopicTraceFacets(
      keyed,
      prepared.text,
      config,
    );
    const outputs = result.output as Record<string, FacetOutput>;
    const usage: TopicModelUsage = {
      providedUsageDetails: result.providedUsageDetails,
      usageDetails: result.usageDetails,
      providedCostDetails: result.providedCostDetails,
      costDetails: result.costDetails,
    };
    rows = [];
    // A failed facet (invalid output, embedding error) must not discard the others.
    for (const [index, { key }] of keyed.entries()) {
      try {
        rows.push(
          await finalizeSummary(
            bases[index],
            outputs[key],
            // One call serves every facet of the trace; record its usage once.
            rows.length ? NO_USAGE : usage,
            embeddingConfig.embeddingDimensions,
            embeddingModel,
          ),
        );
      } catch (error) {
        if (failure === undefined) failure = error;
      }
    }
  }
  if (rows.length) await writeTopicSummaries(rows);
  for (const row of rows)
    recordIncrement("langfuse.topics.facet_summaries", 1, { state: row.state });
  if (failure) throw failure;
  return "summarized";
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
    transcriptId: "trace-batch",
    transcriptVersion: TOPICS_TRANSCRIPT_VERSION,
    summaryModel: config.summaryModel!,
    embeddingModel,
    ...NO_USAGE,
    processedAt: new Date().toISOString(),
    metadata: { input: "assembled-transcript" },
  };
}

async function finalizeSummary(
  base: TopicSummary,
  output: FacetOutput | undefined,
  usage: TopicModelUsage,
  dimensions: number,
  embeddingModel: string,
): Promise<TopicSummary> {
  if (!output)
    throw new TopicsProviderUnavailable(
      "The model response is missing a facet.",
      "invalid_output",
    );
  const error = topicSummaryOutputError(output);
  if (error) throw new TopicsProviderUnavailable(error, "invalid_output");
  if (output.status !== "applicable")
    return {
      ...base,
      state:
        output.status === "not_applicable"
          ? "not_applicable"
          : "insufficient_input",
      ...usage,
    };
  const summary = output.summary.trim();
  const embedded = await embedTopicSummary(summary, dimensions, embeddingModel);
  return {
    ...base,
    state: "complete",
    summary,
    embedding: embedded.embedding,
    ...mergeTopicModelUsage(usage, embedded),
  };
}
