import {
  isTopicsEnabled,
  readTopicExecution,
  writeTopicExecution,
  readTopicArtifact,
  writeTopicArtifact,
  getTopicFacetVersion,
  listTopicSummaries,
  writeTopicAssignments,
  readTopicAssignments,
  readTopicSummaries,
  createTopicRun,
  getTopicRun,
  getPublishedTopicRun,
  getTopicClusteringSummaryIds,
  saveTopicRun,
  loadTopicTranscript,
  stageTopicSummary,
  readStagedTopicSummaries,
  readStagedTopicSummary,
  enqueueTopicEmbeddingBatch,
  TOPIC_EMBEDDING_EXPIRED_ERROR,
  type TopicEmbeddingRef,
} from "@langfuse/shared/topics/server";
import {
  type TopicExecution,
  type TopicFacetVersion,
  type TopicProcessingConfig,
  type TopicSummary,
  type TopicRun,
  type TopicAssignment,
  type TopicFacetProgress,
  type TopicDefinition,
  TOPICS_SUMMARY_MODEL,
  TOPICS_EMBEDDING_MODEL,
} from "@langfuse/shared/topics";
import {
  summarizeTopicTrace,
  nameTopicGroup,
  TOPICS_SUMMARY_PROMPT_VERSION,
  TOPICS_NAMING_MODEL,
} from "./models";
import { TopicsProviderUnavailable } from "./provider-error";
import {
  buildTopicPrototypes,
  buildNamingEvidence,
  classifyTopic,
  topicHash,
} from "./classifier";
import {
  runTopicClustering,
  topicClusterSettings,
  TOPICS_NUMERIC_VERSION,
} from "./numeric";
import { matchTopicContinuity } from "./continuity";
import { chunk } from "lodash";
import { TopicMetrics } from "./metrics";

type ProcessExecution = TopicExecution & {
  input: Extract<TopicExecution["input"], { operation: "process" }>;
};
type UpdateExecution = TopicExecution & {
  input: Extract<TopicExecution["input"], { operation: "update" }>;
};

const TRACE_BATCH_SIZE = 100;
class PendingTopicEmbeddings extends Error {}
class TopicEmbeddingFailure extends Error {}

type SummaryBatch = {
  summaries: TopicEmbeddingRef[];
  failedCounts: Record<string, number>;
};
const summaryRef = (row: TopicSummary): TopicEmbeddingRef => ({
  summaryId: row.id,
  facetVersionId: row.facetVersionId,
  traceId: row.traceId,
});

const artifactKey = (kind: string, value: unknown) =>
  `${kind}-${topicHash(value).slice(0, 48)}`;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Topics processing failed.";
const isExecutionFailure = (error: unknown) =>
  error instanceof TopicsProviderUnavailable ||
  error instanceof TopicEmbeddingFailure;

function invalidOutput(
  metrics: TopicMetrics,
  stage: "summary" | "naming",
  message: string,
) {
  const error = new Error(message);
  metrics.error(stage, error, "invalid_output");
  return error;
}

async function checkpoint<T>(
  metrics: TopicMetrics,
  execution: TopicExecution,
  key: string,
  create: () => Promise<T>,
): Promise<T> {
  const accepted = await metrics.measure(
    "storage",
    () => readTopicArtifact<T>(execution.projectId, execution.id, key),
    "storage",
  );
  if (accepted !== null) return accepted;
  const value = await create();
  await metrics.measure(
    "storage",
    () => writeTopicArtifact(execution.projectId, execution.id, key, value),
    "storage",
  );
  return value;
}

async function saveProgress(
  metrics: TopicMetrics,
  execution: TopicExecution,
  phase: string,
) {
  execution.phase = phase;
  await metrics.measure(
    "storage",
    () => writeTopicExecution(execution),
    "storage",
  );
}

const summaryInvocationHash = (
  inputHash: string,
  facet: TopicFacetVersion,
  config: TopicProcessingConfig,
) =>
  topicHash({
    inputHash,
    prompt: facet.prompt,
    summaryModel: config.summaryModel,
    maxInputTokens: config.maxInputTokens,
    maxOutputTokens: config.maxOutputTokens,
    summaryPromptVersion: TOPICS_SUMMARY_PROMPT_VERSION,
  });

async function loadCachedSummaries(
  execution: ProcessExecution,
  facet: TopicFacetVersion,
  traceIds: string[],
): Promise<TopicSummary[]> {
  const [staged, stored] = await Promise.all([
    readStagedTopicSummaries(
      execution.projectId,
      execution.id,
      facet.id,
      traceIds,
    ),
    listTopicSummaries(execution.projectId, {
      facetId: facet.facetId,
      traceIds,
    }),
  ]);
  const rows = [...staged, ...stored];
  return rows.filter(
    (row) =>
      row.facetId === facet.facetId &&
      row.summaryModel === execution.input.processingConfig.summaryModel &&
      row.invocationHash ===
        summaryInvocationHash(
          row.inputHash,
          facet,
          execution.input.processingConfig,
        ),
  );
}

async function summarizeTrace(
  metrics: TopicMetrics,
  execution: ProcessExecution,
  facet: TopicFacetVersion,
  traceId: string,
  cached: TopicSummary[],
  acceptedSummaryIds: ReadonlySet<string>,
  getTranscript: () => ReturnType<typeof loadTopicTranscript>,
): Promise<TopicSummary> {
  const accepted = cached.find(
    (row) =>
      row.traceId === traceId &&
      row.facetVersionId === facet.id &&
      row.executionId === execution.id,
  );
  if (accepted) {
    metrics.result("summary", "cached");
    // An accepted payload may expire after the cache read; never renew its TTL.
    if (accepted.state === "summarized") return accepted;
    return ensureEmbedding(metrics, execution, accepted);
  }
  const id = topicHash([execution.id, traceId, facet.id]).slice(0, 48);
  if (acceptedSummaryIds.has(id))
    throw new TopicEmbeddingFailure(TOPIC_EMBEDDING_EXPIRED_ERROR);
  const summary = await (async (): Promise<TopicSummary> => {
    const { traceTimestamp, transcript } = await getTranscript();
    const invocationHash = summaryInvocationHash(
      transcript.inputHash,
      facet,
      execution.input.processingConfig,
    );
    const candidates = cached.filter(
      (row) =>
        row.traceId === traceId && row.inputHash === transcript.inputHash,
    );
    const embeddingMatches = (row: TopicSummary) =>
      row.state === "complete" &&
      row.embeddingModel === TOPICS_EMBEDDING_MODEL &&
      row.embedding.length ===
        execution.input.embeddingConfig.embeddingDimensions;
    const reusable =
      candidates.find(
        (row) =>
          row.facetVersionId === facet.id &&
          (row.state !== "complete" || embeddingMatches(row)),
      ) ??
      candidates.find(embeddingMatches) ??
      candidates[0];
    const base = {
      id,
      projectId: execution.projectId,
      facetId: facet.facetId,
      facetVersionId: facet.id,
      facetVersion: facet.version,
      traceId,
      unitType: "trace" as const,
      triggerType: "manual_poc" as const,
      traceTimestamp,
      revision: execution.revision,
      executionId: execution.id,
      inputHash: transcript.inputHash,
      invocationHash,
      summaryModel: TOPICS_SUMMARY_MODEL,
      embeddingModel: TOPICS_EMBEDDING_MODEL,
      processedAt: new Date().toISOString(),
      metadata: {
        coverage: transcript.coverage,
      },
    };
    if (reusable) {
      metrics.result("summary", "cached");
      const superseded = cached.some(
        (row) =>
          row.traceId === traceId &&
          row.facetVersionId === facet.id &&
          row.inputHash !== reusable.inputHash &&
          BigInt(row.revision) > BigInt(reusable.revision),
      );
      if (
        !superseded &&
        reusable.facetVersionId === facet.id &&
        (reusable.state !== "complete" || embeddingMatches(reusable))
      )
        return reusable;
      const reuseEmbedding = embeddingMatches(reusable);
      const state =
        reusable.state === "complete" && !reuseEmbedding
          ? "summarized"
          : reusable.state;
      return {
        ...base,
        state,
        resultVersion: state === "summarized" ? 1 : 2,
        summary: reusable.summary,
        embedding: reuseEmbedding ? reusable.embedding : [],
        inputTokens: 0,
        outputTokens: 0,
        embeddingTokens: 0,
        summaryCostUsd: 0,
        embeddingCostUsd: 0,
        metadata: {
          ...base.metadata,
          summaryReusedFromId: reusable.id,
          ...(reuseEmbedding ? { embeddingReusedFromId: reusable.id } : {}),
        },
      };
    }
    if (!transcript.hasContent) {
      metrics.result("summary", "insufficient_input");
      return {
        ...base,
        resultVersion: 2,
        state: "insufficient_input",
        summary: "",
        embedding: [],
        inputTokens: 0,
        outputTokens: 0,
        embeddingTokens: 0,
        summaryCostUsd: 0,
        embeddingCostUsd: 0,
      };
    }
    const result = await metrics.measure("summary", async () => {
      const result = await summarizeTopicTrace(
        facet,
        transcript.text,
        execution.input.processingConfig,
      );
      const applicable = result.output.status === "applicable";
      if (
        applicable &&
        (!result.output.summary.trim() || result.output.summary.length > 2000)
      )
        throw invalidOutput(
          metrics,
          "summary",
          "Applicable facet summary must contain a concise summary.",
        );
      if (!applicable && result.output.summary.trim())
        throw invalidOutput(
          metrics,
          "summary",
          "Non-applicable facet result contains a summary.",
        );
      return result;
    });
    const applicable = result.output.status === "applicable";
    metrics.result(
      "summary",
      result.output.status === "applicable"
        ? "generated"
        : result.output.status,
    );
    return {
      ...base,
      resultVersion: applicable ? 1 : 2,
      state:
        result.output.status === "applicable"
          ? "summarized"
          : result.output.status,
      summary: result.output.summary.trim(),
      embedding: [],
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      embeddingTokens: 0,
      summaryCostUsd: result.costUsd,
      embeddingCostUsd: 0,
    };
  })();
  if (
    summary.state !== "summarized" &&
    !cached.some((row) => row.id === summary.id)
  )
    return stageSummary(metrics, execution, summary);
  return ensureEmbedding(metrics, execution, summary);
}

/** Re-embedding stored summaries never reloads traces or repeats summarization. */
async function ensureEmbedding(
  metrics: TopicMetrics,
  execution: TopicExecution,
  source: TopicSummary,
): Promise<TopicSummary> {
  const { embeddingModel, embeddingDimensions } =
    execution.input.embeddingConfig;
  if (
    source.state === "not_applicable" ||
    source.state === "insufficient_input" ||
    (source.state === "complete" &&
      source.embeddingModel === embeddingModel &&
      source.embedding.length === embeddingDimensions)
  ) {
    if (source.state === "complete")
      metrics.embeddingResult(source.id, "cached");
    return source;
  }
  const summary: TopicSummary =
    source.state === "summarized" && source.executionId === execution.id
      ? source
      : {
          ...source,
          id: topicHash([
            execution.id,
            source.id,
            execution.input.embeddingConfig,
          ]).slice(0, 48),
          revision: execution.revision,
          executionId: execution.id,
          state: "summarized",
          resultVersion: 1,
          embedding: [],
          embeddingModel,
          inputTokens: 0,
          outputTokens: 0,
          summaryCostUsd: 0,
          embeddingTokens: 0,
          embeddingCostUsd: 0,
          processedAt: new Date().toISOString(),
          metadata: { ...source.metadata, summaryReusedFromId: source.id },
        };
  return stageSummary(metrics, execution, summary);
}

async function stageSummary(
  metrics: TopicMetrics,
  execution: TopicExecution,
  summary: TopicSummary,
): Promise<TopicSummary> {
  try {
    return await metrics.measure(
      "storage",
      () => stageTopicSummary(summary, execution.input.embeddingConfig),
      "storage",
    );
  } catch (error) {
    throw new TopicEmbeddingFailure(errorMessage(error));
  }
}

/** Frozen references survive payload expiry without silently regenerating paid work. */
async function resumeSummaryBatch(
  metrics: TopicMetrics,
  execution: TopicExecution,
  batchId: string,
  batch: SummaryBatch,
  retryFailed: boolean,
  pendingEmbeddingBatchIds: Set<string>,
): Promise<TopicSummary[]> {
  if (!batch.summaries.length) return [];
  const scope = { projectId: execution.projectId, executionId: execution.id };
  const stored = await metrics.measure(
    "storage",
    () =>
      readTopicSummaries(
        execution.projectId,
        batch.summaries.map((ref) => ref.summaryId),
      ),
    "storage",
  );
  const byId = new Map(stored.map((row) => [row.id, row]));
  if (!batch.summaries.every((ref) => byId.has(ref.summaryId))) {
    try {
      pendingEmbeddingBatchIds.add(batchId);
      await enqueueTopicEmbeddingBatch(
        { ...scope, batchId, summaries: batch.summaries },
        { retryFailed },
      );
    } catch (error) {
      throw new TopicEmbeddingFailure(errorMessage(error));
    }
  }
  const rows = await Promise.all(
    batch.summaries.map(async (ref) => {
      const row =
        byId.get(ref.summaryId) ??
        (await readStagedTopicSummary(scope, ref))?.summary;
      if (
        row &&
        (row.projectId !== scope.projectId ||
          row.facetVersionId !== ref.facetVersionId ||
          row.traceId !== ref.traceId)
      )
        throw new TopicEmbeddingFailure("Topics summary batch scope mismatch.");
      return row;
    }),
  );
  // A worker can acknowledge the insert and remove its payload between these reads.
  // The next attempt reads ClickHouse again, or surfaces the embedding job's failure.
  if (rows.some((row) => !row)) throw new PendingTopicEmbeddings();
  return rows as TopicSummary[];
}

async function completedSummaries(
  execution: TopicExecution,
  summaries: TopicSummary[],
) {
  const visible = summaries.length
    ? await readTopicSummaries(
        execution.projectId,
        summaries.map((summary) => summary.id),
      )
    : [];
  const byId = new Map(visible.map((row) => [row.id, row]));
  if (summaries.some((summary) => !byId.has(summary.id)))
    throw new PendingTopicEmbeddings();
  return summaries.map((summary) => byId.get(summary.id)!);
}

function countSummaries(
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
) {
  progress.summaryIds = [
    ...new Set([...progress.summaryIds, ...summaries.map((row) => row.id)]),
  ];
  progress.counts.complete = summaries.filter(
    (row) => row.state === "complete",
  ).length;
  progress.counts.nonApplicable = summaries.filter(
    (row) => row.state === "not_applicable",
  ).length;
  progress.counts.insufficientInput = summaries.filter(
    (row) => row.state === "insufficient_input",
  ).length;
}

function assignmentRows(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  summaries: TopicSummary[],
  run: TopicRun,
  coordinates: Map<string, [number, number]> = new Map(),
): TopicAssignment[] {
  const prototypes = run.topics.map((topic) => ({
    id: topic.topicVersionId,
    centroid: topic.centroid,
    radius: topic.radius,
  }));
  const time = new Date().toISOString();
  return summaries.map((summary) => {
    const assigned = classifyTopic(summary.embedding, prototypes);
    const topic = run.topics.find(
      (candidate) => candidate.topicVersionId === assigned.topicId,
    );
    return {
      id: topicHash([execution.id, run.id, summary.id]).slice(0, 48),
      executionId: execution.id,
      coordinates: coordinates.get(summary.id) ?? null,
      projectId: execution.projectId,
      facetId: facet.facetId,
      facetVersionId: facet.id,
      facetVersion: facet.version,
      unitType: "trace",
      traceId: summary.traceId,
      traceTimestamp: summary.traceTimestamp,
      summaryId: summary.id,
      summaryRevision: summary.revision,
      runId: run.id,
      runSequence: run.runSequence,
      topicId: topic?.topicId ?? null,
      topicVersionId: topic?.topicVersionId ?? null,
      outcome: topic ? "assigned" : "outlier",
      distance: assigned.distance,
      runnerUpDistance: assigned.runnerUpDistance,
      rejectionReason: assigned.rejectionReason,
      origin: execution.input.operation === "process" ? "online" : "initial",
      assignedAt: time,
    };
  });
}

async function assignSummaries(
  metrics: TopicMetrics,
  execution: TopicExecution,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
  run: TopicRun,
  coordinates: Map<string, [number, number]> = new Map(),
) {
  return metrics.measure("assignment", async () => {
    if (
      run.projectId !== execution.projectId ||
      run.facetVersionId !== facet.id ||
      run.topics.some(
        (topic) =>
          topic.centroid.length !==
          execution.input.embeddingConfig.embeddingDimensions,
      ) ||
      run.config.embeddingModel !==
        execution.input.embeddingConfig.embeddingModel
    )
      throw new Error("Target map is incompatible with this facet version.");
    const existing = summaries.length
      ? await readTopicAssignments(
          execution.projectId,
          summaries.map((summary) => summary.id),
          run.id,
        )
      : [];
    const byId = new Map(existing.map((row) => [row.id, row]));
    const rows = assignmentRows(
      execution,
      facet,
      summaries,
      run,
      coordinates,
    ).map((row) => byId.get(row.id) ?? row);
    await metrics.measure(
      "storage",
      () => writeTopicAssignments(rows),
      "storage",
    );
    const visible = rows.length
      ? await readTopicAssignments(
          execution.projectId,
          summaries.map((summary) => summary.id),
          run.id,
        )
      : [];
    const visibleBySummary = new Map(
      visible.map((row) => [row.summaryId, row]),
    );
    // A retry can read a later equivalent assignment to the same immutable map.
    if (
      rows.some((row) => {
        const persisted = visibleBySummary.get(row.summaryId);
        return (
          !persisted ||
          persisted.topicId !== row.topicId ||
          persisted.topicVersionId !== row.topicVersionId ||
          persisted.outcome !== row.outcome
        );
      })
    )
      throw new Error(
        "Topic assignments are not fully visible; map publication is deferred.",
      );
    progress.counts.assigned = rows.filter(
      (row) => row.outcome === "assigned",
    ).length;
    progress.counts.outlier = rows.length - progress.counts.assigned;
    metrics.result("assignment", "assigned", progress.counts.assigned);
    metrics.result("assignment", "outlier", progress.counts.outlier);
  });
}

async function clusterFacet(
  metrics: TopicMetrics,
  execution: UpdateExecution,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
  previous: TopicRun | null = null,
) {
  const numericConfig = {
    ...topicClusterSettings(
      execution.input.exploratory,
      execution.input.minimumTraceCount,
    ),
    numericVersion: TOPICS_NUMERIC_VERSION,
  };
  let run = await createTopicRun({
    id: topicHash([execution.id, facet.id, "run"]).slice(0, 48),
    projectId: execution.projectId,
    facetVersionId: facet.id,
    manifestPath: artifactKey("cohort", facet.id),
    config: {
      ...numericConfig,
      exploratory: execution.input.exploratory,
      embeddingModel: TOPICS_EMBEDDING_MODEL,
      dimensions: execution.input.embeddingConfig.embeddingDimensions,
      classifierVersion: "original-cosine-loo95-rival05-eps1e-12-v2",
      executionId: execution.id,
      previousRunId: previous?.id ?? null,
    },
  });
  progress.runId = run.id;
  if (!summaries.length) {
    progress.outcome = "no_applicable_summaries";
    metrics.result("clustering", "no_applicable_summaries");
    return;
  }
  if (summaries.length < numericConfig.minimumCount) {
    progress.outcome = "insufficient_data";
    metrics.result("clustering", "insufficient_data");
    return;
  }
  if (run.publishedAt) {
    await assignSummaries(metrics, execution, facet, progress, summaries, run);
    progress.outcome = "published";
    return;
  }
  run = await saveTopicRun({
    ...run,
    status: "running",
    phase: "clustering",
    startedAt: run.startedAt ?? new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
  await saveProgress(metrics, execution, "clustering");
  try {
    const numeric = await checkpoint(
      metrics,
      execution,
      artifactKey("numeric", run.id),
      async () => {
        // An accepted fit retains its original provenance. A pending fit uses
        // the installed backend, including when a run resumes after an upgrade.
        run = await saveTopicRun({
          ...run,
          config: {
            ...run.config,
            ...numericConfig,
          },
        });
        return metrics.measure(
          "clustering",
          () =>
            runTopicClustering(
              summaries.map((row) => row.embedding),
              numericConfig,
            ),
          "numerical",
        );
      },
    );
    const coordinates = new Map(
      summaries
        .map((row, index) => [row.id, numeric.coordinates[index]])
        .filter((entry): entry is [string, [number, number]] =>
          Array.isArray(entry[1]),
        ),
    );
    if (numeric.status !== "complete") {
      metrics.result("clustering", numeric.status);
      if (numeric.status === "no_topics") {
        await assignSummaries(
          metrics,
          execution,
          facet,
          progress,
          summaries,
          run,
          coordinates,
        );
      }
      await saveTopicRun({
        ...run,
        status: "completed",
        phase: numeric.status,
        publishedAt:
          numeric.status === "no_topics" ? new Date().toISOString() : null,
        finishedAt: new Date().toISOString(),
        metrics: { applicable: summaries.length, densityClusters: 0 },
      });
      progress.outcome =
        numeric.status === "insufficient_data"
          ? "insufficient_data"
          : "no_topics";
      return;
    }
    const densityPrototypes = buildTopicPrototypes(summaries, numeric.labels);
    const densityIds = new Map(
      densityPrototypes.map((prototype) => [
        prototype.id,
        topicHash([run.id, prototype.id]).slice(0, 48),
      ]),
    );
    let prototypes = densityPrototypes.map((prototype) => ({
      ...prototype,
      id: densityIds.get(prototype.id)!,
    }));
    // A density cluster can have no population under the serving classifier.
    for (;;) {
      const active = new Set(
        summaries.map(
          (row) => classifyTopic(row.embedding, prototypes).topicId,
        ),
      );
      const retained = prototypes.filter((prototype) =>
        active.has(prototype.id),
      );
      if (retained.length === prototypes.length) break;
      prototypes = retained;
    }
    if (!prototypes.length) {
      metrics.result("clustering", "no_topics");
      await assignSummaries(
        metrics,
        execution,
        facet,
        progress,
        summaries,
        run,
        coordinates,
      );
      await saveTopicRun({
        ...run,
        status: "completed",
        phase: "no_topics",
        publishedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        metrics: { applicable: summaries.length },
      });
      progress.outcome = "no_topics";
      return;
    }
    const evidence = buildNamingEvidence(summaries, prototypes);
    metrics.result("clustering", "topics_found");
    await saveProgress(metrics, execution, "naming");
    let topics: TopicDefinition[] = [];
    const names = new Set<string>();
    for (const group of evidence) {
      const accepted = run.topics.find(
        (topic) => topic.topicVersionId === group.id,
      );
      if (accepted) {
        metrics.result("naming", "reused");
        topics.push(accepted);
        names.add(accepted.name.toLowerCase());
        continue;
      }
      const label = await metrics.measure("naming", async () => {
        const { output: label } = await nameTopicGroup(group);
        if (
          !label.name.trim() ||
          !label.description.trim() ||
          names.has(label.name.trim().toLowerCase())
        )
          throw invalidOutput(
            metrics,
            "naming",
            "Topic names must be concise, non-empty, and distinct.",
          );
        return label;
      });
      names.add(label.name.trim().toLowerCase());
      const prototype = prototypes.find(
        (candidate) => candidate.id === group.id,
      )!;
      const id = prototype.id;
      topics.push({
        topicVersionId: id,
        projectId: execution.projectId,
        topicId: id,
        runId: run.id,
        name: label.name.trim(),
        description: label.description.trim(),
        centroid: prototype.centroid,
        radius: prototype.radius,
        representativeSummaryIds: label.evidenceSummaryIds,
        metadata: {
          effectiveMemberCount: group.count,
          namingModel: TOPICS_NAMING_MODEL,
        },
      });
      run = await saveTopicRun({ ...run, topics, phase: "naming" });
      metrics.result("naming", "generated");
    }
    if (previous) {
      topics = await (async () => {
        const previousSummaries = await readTopicSummaries(
          execution.projectId,
          previous.summaryIds,
        );
        const previousAssignments = await readTopicAssignments(
          execution.projectId,
          previous.summaryIds,
          previous.id,
        );
        const bySummary = new Map(
          previousSummaries.map((row) => [row.id, row]),
        );
        const candidateBySummary = new Map(
          summaries.map((row) => [row.id, row]),
        );
        return matchTopicContinuity({
          previousTopics: previous.topics,
          candidateTopics: topics,
          previousMemberships: previousAssignments.flatMap((row) => {
            const summary = bySummary.get(row.summaryId);
            return summary
              ? [
                  {
                    traceId: summary.traceId,
                    inputHash: summary.inputHash,
                    topicVersionId: row.topicVersionId,
                  },
                ]
              : [];
          }),
          candidateMemberships: assignmentRows(execution, facet, summaries, {
            ...run,
            topics,
          }).map((row) => ({
            traceId: row.traceId,
            inputHash: candidateBySummary.get(row.summaryId)!.inputHash,
            topicVersionId: row.topicVersionId,
          })),
          exploratory: execution.input.exploratory,
          compatibleEmbeddingSpace: compatibleMap(execution, facet, previous),
        });
      })();
    }
    const activeIds = new Set(prototypes.map((prototype) => prototype.id));
    const mismatch = summaries.filter((row, index) => {
      const densityId = densityIds.get(`cluster_${numeric.labels[index]}`);
      return (
        classifyTopic(row.embedding, prototypes).topicId !==
        (densityId && activeIds.has(densityId) ? densityId : null)
      );
    }).length;
    run = await saveTopicRun({
      ...run,
      topics,
      phase: "assigning",
      metrics: {
        applicable: summaries.length,
        densityClusters: new Set(numeric.labels.filter((label) => label >= 0))
          .size,
        effectiveTopics: topics.length,
        discoveryClassifierMismatch: mismatch,
        densityNoise: numeric.labels.filter((label) => label < 0).length,
      },
    });
    // Readback returns the persisted classifier precision before creating any memberships.
    await assignSummaries(
      metrics,
      execution,
      facet,
      progress,
      summaries,
      run,
      coordinates,
    );
    run = await saveTopicRun({
      ...run,
      status: "completed",
      phase: "published",
      publishedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      metrics: {
        ...run.metrics,
        assigned: progress.counts.assigned,
        outlier: progress.counts.outlier,
      },
    });
    progress.outcome = "published";
  } catch (error) {
    await saveTopicRun({
      ...run,
      status: "failed",
      phase: "failed",
      error: errorMessage(error),
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

function compatibleMap(
  execution: TopicExecution,
  facet: TopicFacetVersion,
  run: TopicRun,
): boolean {
  return (
    run.facetVersionId === facet.id &&
    run.config.embeddingModel ===
      execution.input.embeddingConfig.embeddingModel &&
    run.config.dimensions ===
      execution.input.embeddingConfig.embeddingDimensions
  );
}

async function clearNonApplicable(
  metrics: TopicMetrics,
  execution: TopicExecution,
  facet: TopicFacetVersion,
  summaries: TopicSummary[],
) {
  const rows: TopicAssignment[] = summaries.flatMap((summary) => {
    if (
      summary.state !== "not_applicable" &&
      summary.state !== "insufficient_input"
    )
      return [];
    return [
      {
        id: topicHash([execution.id, summary.id, "no-topic"]).slice(0, 48),
        executionId: execution.id,
        coordinates: null,
        projectId: execution.projectId,
        facetId: facet.facetId,
        facetVersionId: facet.id,
        facetVersion: facet.version,
        unitType: "trace" as const,
        traceId: summary.traceId,
        traceTimestamp: summary.traceTimestamp,
        summaryId: summary.id,
        summaryRevision: summary.revision,
        runId: null,
        runSequence: null,
        topicId: null,
        topicVersionId: null,
        outcome: summary.state,
        distance: null,
        runnerUpDistance: null,
        rejectionReason: summary.state,
        origin: "online" as const,
        assignedAt: new Date().toISOString(),
      },
    ];
  });
  if (rows.length)
    await metrics.measure(
      "storage",
      () => writeTopicAssignments(rows),
      "storage",
    );
}

type PendingFacet = {
  facet: TopicFacetVersion;
  progress: TopicFacetProgress;
};

async function pendingFacets(
  execution: TopicExecution,
): Promise<PendingFacet[]> {
  const facets: PendingFacet[] = [];
  for (const progress of execution.facets) {
    if (progress.outcome !== "pending") continue;
    const facet = await getTopicFacetVersion(
      execution.projectId,
      progress.facetVersionId,
    );
    if (!facet) throw new Error("Facet version not found in this project.");
    progress.counts.failed = 0;
    facets.push({ facet, progress });
  }
  return facets;
}

async function pinnedMap(
  metrics: TopicMetrics,
  execution: TopicExecution,
  facet: TopicFacetVersion,
): Promise<TopicRun | null> {
  const baseline = await checkpoint(
    metrics,
    execution,
    artifactKey("baseline", facet.id),
    async () => {
      const current = await getPublishedTopicRun(
        execution.projectId,
        facet.facetId,
      );
      return {
        runId:
          current?.facetVersionId === facet.id &&
          (execution.input.operation === "update" ||
            compatibleMap(execution, facet, current))
            ? current.id
            : null,
      };
    },
  );
  if (!baseline.runId) return null;
  const run = await getTopicRun(execution.projectId, baseline.runId);
  if (
    !run?.publishedAt ||
    run.facetVersionId !== facet.id ||
    (execution.input.operation === "process" &&
      !compatibleMap(execution, facet, run))
  )
    throw new Error("The pinned topic map is unavailable or incompatible.");
  return run;
}

/** Processes only the supplied traces; it never fits or names topics. */
async function processTraces(
  metrics: TopicMetrics,
  execution: ProcessExecution,
  retryFailed: boolean,
  pendingEmbeddingBatchIds: Set<string>,
) {
  const projectId = execution.projectId;
  const acceptedSummaryIds = new Set(
    execution.facets.flatMap((facet) => facet.summaryIds),
  );
  const facets: (PendingFacet & {
    summaries: TopicSummary[];
    cached: TopicSummary[] | null;
    run: TopicRun | null;
  })[] = [];
  for (const { facet, progress } of await pendingFacets(execution)) {
    // Pin the serving map before doing paid work, including the absence of a map.
    const run = await pinnedMap(metrics, execution, facet);
    const cohort = await readTopicArtifact<{
      summaryIds: string[];
      failedCount: number;
    }>(projectId, execution.id, artifactKey("cohort", facet.id));
    let summaries: TopicSummary[] = [];
    if (cohort) {
      summaries = cohort.summaryIds.length
        ? await readTopicSummaries(projectId, cohort.summaryIds)
        : [];
      const byId = new Map(summaries.map((row) => [row.id, row]));
      if (cohort.summaryIds.some((id) => !byId.has(id)))
        throw new Error("The accepted summary cohort is not fully visible.");
      summaries = cohort.summaryIds.map((id) => byId.get(id)!);
      progress.counts.failed = cohort.failedCount;
    }
    facets.push({
      facet,
      progress,
      summaries,
      cached: cohort ? null : [],
      run,
    });
  }
  const extracting = facets.filter((item) => item.cached !== null);
  for (const traceIds of chunk(execution.input.traceIds, TRACE_BATCH_SIZE)) {
    if (!extracting.length) break;
    const key = artifactKey("cohort-summary", [
      traceIds,
      extracting.map((item) => item.facet.id),
    ]);
    let accepted = await readTopicArtifact<SummaryBatch>(
      projectId,
      execution.id,
      key,
    );
    const newBatch = !accepted;
    if (!accepted) {
      for (const item of extracting)
        item.cached = await metrics.measure(
          "storage",
          () => loadCachedSummaries(execution, item.facet, traceIds),
          "storage",
        );
      const batch: TopicSummary[] = [];
      const failedCounts: Record<string, number> = {};
      try {
        for (const traceId of traceIds) {
          // Every facet sees one canonical in-memory transcript per trace.
          let input: ReturnType<typeof loadTopicTranscript> | undefined;
          const prior = extracting
            .flatMap((item) => item.cached ?? [])
            .filter(
              (row) =>
                row.traceId === traceId && row.executionId === execution.id,
            );
          const getTranscript = () => {
            if (input) return input;
            input = (async () => {
              const loaded = await metrics.measure(
                "transcript",
                () => loadTopicTranscript({ projectId, traceId }),
                "trace_load",
              );
              if (
                prior.some(
                  (summary) =>
                    summary.inputHash !== loaded.transcript.inputHash,
                )
              )
                throw new Error(
                  "Trace input changed since an accepted facet summary. Start a new execution to process the updated trace.",
                );
              return loaded;
            })();
            return input;
          };
          for (const { facet, progress, cached } of extracting) {
            try {
              batch.push(
                await summarizeTrace(
                  metrics,
                  execution,
                  facet,
                  traceId,
                  cached!,
                  acceptedSummaryIds,
                  getTranscript,
                ),
              );
            } catch (error) {
              metrics.error("summary", error);
              if (isExecutionFailure(error)) {
                progress.outcome = "failed";
                progress.error = errorMessage(error);
                throw error;
              }
              failedCounts[facet.id] = (failedCounts[facet.id] ?? 0) + 1;
              const message = errorMessage(error);
              if (
                !execution.traceErrors.some(
                  (item) => item.traceId === traceId && item.error === message,
                )
              )
                execution.traceErrors.push({ traceId, error: message });
            }
          }
        }
        accepted = { summaries: batch.map(summaryRef), failedCounts };
        await writeTopicArtifact(projectId, execution.id, key, accepted);
      } finally {
        // Record accepted IDs even if a later provider call interrupts the batch.
        for (const { facet, progress, summaries } of extracting) {
          const partial = batch.filter(
            (row) => row.facetVersionId === facet.id,
          );
          countSummaries(progress, [...summaries, ...partial]);
        }
        await saveProgress(metrics, execution, "summarizing");
      }
    }
    const rows = await resumeSummaryBatch(
      metrics,
      execution,
      key,
      accepted,
      retryFailed,
      pendingEmbeddingBatchIds,
    );
    for (const { facet, progress, summaries } of extracting) {
      summaries.push(...rows.filter((row) => row.facetVersionId === facet.id));
      progress.counts.failed += accepted.failedCounts[facet.id] ?? 0;
      if (newBatch) countSummaries(progress, summaries);
    }
    if (newBatch) await saveProgress(metrics, execution, "summarizing");
  }
  for (const item of facets) {
    item.summaries = await completedSummaries(execution, item.summaries);
    countSummaries(item.progress, item.summaries);
  }
  for (const { facet, progress, summaries, run } of facets) {
    try {
      await checkpoint(
        metrics,
        execution,
        artifactKey("cohort", facet.id),
        async () => ({
          summaryIds: summaries.map((summary) => summary.id),
          failedCount: progress.counts.failed,
        }),
      );
      await clearNonApplicable(metrics, execution, facet, summaries);
      const complete = summaries.filter((row) => row.state === "complete");
      if (!complete.length) progress.outcome = "no_applicable_summaries";
      else if (!run) {
        progress.outcome = "awaiting_topics";
        metrics.result("assignment", "awaiting_topics", complete.length);
      } else {
        progress.runId = run.id;
        await saveProgress(metrics, execution, "assigning");
        await assignSummaries(
          metrics,
          execution,
          facet,
          progress,
          complete,
          run,
        );
        progress.outcome = "assigned";
      }
    } catch (error) {
      metrics.error("execution", error);
      progress.outcome = "failed";
      progress.error = errorMessage(error);
      if (isExecutionFailure(error)) throw error;
    }
    await saveProgress(metrics, execution, "processing");
  }
}

/** Updates topics solely from a frozen cohort of completed, compatible summaries. */
async function updateTopics(metrics: TopicMetrics, execution: UpdateExecution) {
  for (const { facet, progress } of await pendingFacets(execution)) {
    try {
      const previous = await pinnedMap(metrics, execution, facet);
      const cohort = await checkpoint(
        metrics,
        execution,
        artifactKey("cohort", facet.id),
        async () => ({
          summaryIds: await getTopicClusteringSummaryIds(
            execution.projectId,
            facet.facetId,
            facet.id,
            execution.input.embeddingConfig,
          ),
        }),
      );
      const stored = cohort.summaryIds.length
        ? await readTopicSummaries(execution.projectId, cohort.summaryIds)
        : [];
      const summariesById = new Map(stored.map((row) => [row.id, row]));
      // Numerical labels and coordinates use this accepted order on every retry.
      const summaries = cohort.summaryIds.map((id) => summariesById.get(id)!);
      if (
        summariesById.size !== cohort.summaryIds.length ||
        summaries.some(
          (row) =>
            !row ||
            row.projectId !== execution.projectId ||
            row.facetVersionId !== facet.id ||
            row.state !== "complete" ||
            row.embeddingModel !==
              execution.input.embeddingConfig.embeddingModel ||
            row.embedding.length !==
              execution.input.embeddingConfig.embeddingDimensions,
        )
      )
        throw new Error(
          "The accepted clustering cohort is unavailable or incompatible.",
        );
      countSummaries(progress, summaries);
      progress.counts.requested = summaries.length;
      await clusterFacet(
        metrics,
        execution,
        facet,
        progress,
        summaries,
        previous,
      );
    } catch (error) {
      metrics.error("execution", error);
      progress.outcome = "failed";
      progress.error = errorMessage(error);
      if (isExecutionFailure(error)) throw error;
    }
    await saveProgress(metrics, execution, "processing");
  }
}

/** One queue owner advances either trace processing or a topic update. */
export async function processTopicsExecution({
  projectId,
  executionId,
}: {
  projectId: string;
  executionId: string;
}): Promise<{ pendingEmbeddingBatchIds: string[] } | void> {
  if (!isTopicsEnabled())
    throw new Error("Topics PoC runs only in local development.");
  const execution = await readTopicExecution(projectId, executionId);
  if (!execution) throw new Error("Topics execution not found.");
  if (
    ["completed", "completed_with_errors"].includes(execution.status) &&
    !execution.facets.some(
      (facet) => facet.outcome === "pending" || facet.outcome === "failed",
    )
  )
    return;
  const pendingEmbeddingBatchIds = new Set<string>();
  const metrics = new TopicMetrics();
  const retryFailed =
    execution.status === "failed" ||
    execution.status === "completed_with_errors";
  if (execution.status !== "running") metrics.execution("started");
  execution.status = "running";
  execution.error = null;
  for (const progress of execution.facets) {
    if (progress.outcome === "failed") {
      progress.outcome = "pending";
      progress.error = null;
    }
  }
  const processingPhase =
    execution.phase === "embedding" ? "embedding" : "summarizing";
  await saveProgress(
    metrics,
    execution,
    execution.input.operation === "update" ? "selecting" : processingPhase,
  ).catch((error) => {
    metrics.execution("failed");
    throw error;
  });
  try {
    if (execution.input.operation === "process")
      await processTraces(
        metrics,
        execution as ProcessExecution,
        retryFailed,
        pendingEmbeddingBatchIds,
      );
    else await updateTopics(metrics, execution as UpdateExecution);
    execution.status = execution.facets.some(
      (facet) => facet.outcome === "failed" || facet.counts.failed > 0,
    )
      ? "completed_with_errors"
      : "completed";
    await saveProgress(metrics, execution, "completed");
    metrics.execution(execution.status);
  } catch (error) {
    if (error instanceof PendingTopicEmbeddings) {
      await saveProgress(metrics, execution, "embedding");
      return { pendingEmbeddingBatchIds: [...pendingEmbeddingBatchIds] };
    }
    metrics.error("execution", error);
    metrics.execution("failed");
    execution.status = "failed";
    execution.error = errorMessage(error);
    await saveProgress(metrics, execution, execution.status);
  }
}
