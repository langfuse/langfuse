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
import { embedTopicSummary, summarizeTopicTraceFacets } from "./models";
import { TopicsProviderUnavailable } from "./provider-error";

type FacetOutput = {
  summary: string;
  status: "applicable" | "not_applicable" | "insufficient_input";
};
type Usage = Pick<
  TopicSummary,
  | "providedUsageDetails"
  | "usageDetails"
  | "providedCostDetails"
  | "costDetails"
>;
const NO_USAGE: Usage = {
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
}): Promise<void> {
  if (!isTopicsProjectEnabled(input.projectId)) return;
  const prepared = prepareAssembledTopicTranscript(input.transcript);
  const facets = (await ensureDefaultTopicFacets(input.projectId)).filter(
    (facet) => facet.projectId === input.projectId && facet.versions.length,
  );
  const pending: { name: string; version: TopicFacetVersion }[] = [];
  for (const facet of facets) {
    const version = facet.versions[0];
    const stored = await listTopicSummaries(input.projectId, {
      traceIds: [input.traceId],
      facetId: version.facetId,
      facetVersion: version.version,
    });
    if (
      !stored.some(
        (row) => row.traceId === input.traceId && row.state !== "summarized",
      )
    )
      pending.push({ name: facet.name, version });
  }
  if (!pending.length) return;
  const bases = pending.map(({ version }) => baseSummary(input, version));
  if (!prepared.hasContent) {
    await writeTopicSummaries(bases);
    return;
  }

  const keyed = pending.map(({ name, version }, index) => ({
    key: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${index + 1}`,
    facet: version,
  }));
  const result = await summarizeTopicTraceFacets(
    keyed,
    prepared.text,
    topicProcessingConfigSchema.parse({}),
  );
  const outputs = result.output as Record<string, FacetOutput>;
  const dimensions = topicEmbeddingConfigSchema.parse({}).embeddingDimensions;
  const rows: TopicSummary[] = [];
  for (const [index, { key }] of keyed.entries())
    rows.push(
      await finalizeSummary(
        bases[index],
        outputs[key],
        // One call serves every facet of the trace; record its usage once.
        index === 0 ? result : NO_USAGE,
        dimensions,
      ),
    );
  await writeTopicSummaries(rows);
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
    summaryModel: TOPICS_SUMMARY_MODEL,
    embeddingModel: TOPICS_EMBEDDING_MODEL,
    ...NO_USAGE,
    processedAt: new Date().toISOString(),
    metadata: { input: "assembled-transcript" },
  };
}

async function finalizeSummary(
  base: TopicSummary,
  output: FacetOutput,
  usage: Usage,
  dimensions: number,
): Promise<TopicSummary> {
  const applicable = output.status === "applicable";
  const summary = output.summary.trim();
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
  if (!applicable)
    return {
      ...base,
      state:
        output.status === "not_applicable"
          ? "not_applicable"
          : "insufficient_input",
      providedUsageDetails: usage.providedUsageDetails,
      usageDetails: usage.usageDetails,
      providedCostDetails: usage.providedCostDetails,
      costDetails: usage.costDetails,
    };
  const embedded = await embedTopicSummary(summary, dimensions);
  return {
    ...base,
    state: "complete",
    summary,
    embedding: embedded.embedding,
    providedUsageDetails: {
      ...usage.providedUsageDetails,
      ...embedded.providedUsageDetails,
    },
    usageDetails: { ...usage.usageDetails, ...embedded.usageDetails },
    providedCostDetails: {
      ...usage.providedCostDetails,
      ...embedded.providedCostDetails,
    },
    costDetails: { ...usage.costDetails, ...embedded.costDetails },
  };
}
