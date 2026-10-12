import { createHash } from "node:crypto";
import {
  deleteStagedTopicSummary,
  ensureDefaultTopicFacets,
  isTopicsProjectEnabled,
  listTopicSummaries,
  readStagedTopicSummary,
  stageTopicSummary,
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
  redis,
  type Transcript,
} from "@langfuse/shared/src/server";
import { prepareAssembledTopicTranscript } from "./assembledTranscript";
import { TopicMetrics } from "./metrics";
import { embedTopicSummary, summarizeTopicTraceFacets } from "./models";
import { TopicsProviderUnavailable } from "./provider-error";
import {
  mergeTopicModelUsage,
  topicSummaryOutputError,
  type TopicModelUsage,
} from "./summaryResult";
import { getTopicsModelConfig } from "@langfuse/shared/topics/server";
import { getTraceBatchShard } from "../traceBatching/traceBatchReadiness";

const COMPLETION_TTL_SECONDS = 3 * 60 * 60;

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

type AssembledTraceInput = {
  projectId: string;
  traceId: string;
  traceTimestamp: string;
  environment: string;
  traceName: string;
  transcript: Transcript | null;
  revision?: string;
};

/**
 * Summarizes one trace from the transcript the batch job already assembled,
 * with one model call for all of its pending facets. Does not load
 * observations again.
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
  const scope = input.revision
    ? {
        projectId: input.projectId,
        executionId: `trace-batch:${input.revision}`,
      }
    : undefined;
  const completedKey = scope
    ? `{trace-batch:${getTraceBatchShard(JSON.stringify([input.projectId, input.traceId]))}}:completed:${createHash(
        "sha256",
      )
        .update(
          JSON.stringify([input.projectId, input.traceId, input.revision]),
        )
        .digest("hex")}`
    : undefined;
  if (completedKey && !redis) throw new Error("Topics retries require Redis.");
  const complete = async (rows: TopicSummary[]) => {
    if (!scope || !completedKey || !rows.length || !redis) return;
    // Completion and expiry are atomic; retries do not extend the retention.
    await redis.eval(
      `for i = 2, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
       redis.call('EXPIRE', KEYS[1], ARGV[1], 'NX')`,
      1,
      completedKey,
      COMPLETION_TTL_SECONDS,
      ...rows.flatMap((row) => [
        JSON.stringify([row.facetId, row.facetVersion]),
        Date.parse(row.processedAt),
      ]),
    );
    await Promise.all(
      rows.map((row) =>
        deleteStagedTopicSummary(scope, {
          facetId: row.facetId,
          facetVersion: row.facetVersion,
          traceId: input.traceId,
        }),
      ),
    );
  };
  const timestamp = Date.parse(input.traceTimestamp);
  const timeRange = {
    from: new Date(timestamp),
    to: new Date(timestamp + 1),
  };
  const pending: {
    name: string;
    version: TopicFacetVersion;
    builtIn: boolean;
  }[] = [];
  const restored: TopicSummary[] = [];
  const accepted: TopicSummary[] = [];
  // Built-in facets first, each group in listing order, so the cached prompt prefix stays stable.
  const ordered = [
    ...facets.filter((facet) => facet.isBuiltIn),
    ...facets.filter((facet) => !facet.isBuiltIn),
  ];
  for (const facet of ordered) {
    const version = facet.versions[0];
    if (facet.projectId !== input.projectId || !version) continue;
    if (
      completedKey &&
      (await redis?.hexists(
        completedKey,
        JSON.stringify([version.facetId, version.version]),
      ))
    )
      continue;
    const stored = await listTopicSummaries(
      input.projectId,
      {
        traceIds: [input.traceId],
        facetId: version.facetId,
        facetVersion: version.version,
      },
      timeRange,
    );
    if (!scope) {
      if (!stored.length)
        pending.push({ name: facet.name, version, builtIn: facet.isBuiltIn });
      continue;
    }
    const staged = await readStagedTopicSummary(scope, {
      facetId: version.facetId,
      facetVersion: version.version,
      traceId: input.traceId,
    });
    if (staged) {
      accepted.push(staged.summary);
      // A newer dispatch must not be overwritten when an older batch retries.
      if (
        !stored.some(
          (row) =>
            Date.parse(row.processedAt) >=
            Date.parse(staged.summary.processedAt),
        )
      )
        restored.push(staged.summary);
      continue;
    }
    if (
      !stored.some((row) => row.metadata.traceBatchRevision === input.revision)
    )
      pending.push({ name: facet.name, version, builtIn: facet.isBuiltIn });
  }
  if (restored.length)
    await metrics.measure("storage", () => writeTopicSummaries(restored));
  await complete(accepted);
  if (!pending.length) return "unchanged";

  const prepared = prepareAssembledTopicTranscript(input.transcript);
  const bases = pending.map(({ version }) =>
    baseSummary(input, version, config, embeddingModel),
  );
  let rows = bases;
  let failure: unknown;
  if (prepared.hasContent) {
    const keyed = pending.map(({ name, version, builtIn }, index) => ({
      key: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${index + 1}`,
      facet: version,
      builtIn,
    }));
    const invalidFacets = new Set<string>();
    let generated:
      | Awaited<ReturnType<typeof summarizeTopicTraceFacets>>
      | undefined;
    const result = await metrics
      .measure("summary", async () => {
        generated = await summarizeTopicTraceFacets(
          keyed,
          prepared.text,
          config,
        );
        const outputs = generated.output as Record<string, FacetOutput>;
        for (const { key } of keyed) {
          const message = outputs[key]
            ? topicSummaryOutputError(outputs[key])
            : "The model response is missing a facet.";
          if (!message) continue;
          const error = new TopicsProviderUnavailable(
            message,
            "invalid_output",
          );
          invalidFacets.add(key);
          metrics.error("summary", error);
          if (failure === undefined) failure = error;
        }
        if (failure !== undefined) throw failure;
        return generated;
      })
      .catch((error: unknown) => {
        // Valid facets can still be persisted after summary validation fails.
        if (error !== failure || !generated) throw error;
        return generated;
      });
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
      if (invalidFacets.has(key)) continue;
      try {
        rows.push(
          await finalizeSummary(
            bases[index],
            outputs[key],
            // One call serves every facet of the trace; record its usage once.
            rows.length ? NO_USAGE : usage,
            embeddingConfig.embeddingDimensions,
            embeddingModel,
            metrics,
          ),
        );
      } catch (error) {
        if (failure === undefined) failure = error;
      }
    }
  }
  if (rows.length)
    await metrics.measure("storage", async () => {
      if (scope)
        rows = await Promise.all(
          rows.map((row) => stageTopicSummary(scope, row, embeddingConfig)),
        );
      await writeTopicSummaries(rows);
      await complete(rows);
    });
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
    revision?: string;
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
    metadata: {
      input: "assembled-transcript",
      ...(input.revision ? { traceBatchRevision: input.revision } : {}),
    },
  };
}

async function finalizeSummary(
  base: TopicSummary,
  output: FacetOutput,
  usage: TopicModelUsage,
  dimensions: number,
  embeddingModel: string,
  metrics: TopicMetrics,
): Promise<TopicSummary> {
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
  const embedded = await metrics.measure("embedding", () =>
    embedTopicSummary(summary, dimensions, embeddingModel),
  );
  return {
    ...base,
    state: "complete",
    summary,
    embedding: embedded.embedding,
    ...mergeTopicModelUsage(usage, embedded),
  };
}
