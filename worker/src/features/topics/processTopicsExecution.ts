import { randomUUID } from "node:crypto";
import { logger } from "@langfuse/shared/src/server";
import {
  isTopicsEnabled,
  readTopicExecutionSummary,
  writeTopicExecution,
  getTopicFacetVersion,
  listTopicSummaries,
  writeTopicAssignments,
  readTopicAssignments,
  readTopicRunSummaryIds,
  readTopicSummaries,
  createTopicRun,
  getTopicRun,
  getPublishedTopicRun,
  getPublishedTopicRunForExecution,
  getTopicClusteringSummaries,
  saveTopicRun,
  loadTopicTranscript,
  stageTopicSummary,
  deleteStagedTopicSummary,
  readStagedTopicSummaries,
  readStagedTopicSummary,
  enqueueTopicEmbeddingBatch,
  topicSummaryId,
  TOPIC_EMBEDDING_EXPIRED_ERROR,
  type TopicEmbeddingRef,
} from "@langfuse/shared/topics/server";
import {
  type TopicExecution,
  type TopicFacetVersion,
  type TopicSummary,
  type TopicRun,
  type TopicAssignment,
  type TopicFacetProgress,
  type TopicDefinition,
  type TopicProcessBatchState,
  TOPICS_SUMMARY_MODEL,
  TOPICS_EMBEDDING_MODEL,
} from "@langfuse/shared/topics";
import {
  summarizeTopicTrace,
  nameTopicGroup,
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
import { TopicMetrics } from "./metrics";

type ProcessExecution = TopicExecution & {
  input: Extract<TopicExecution["input"], { operation: "process" }>;
};
type UpdateExecution = TopicExecution & {
  input: Extract<TopicExecution["input"], { operation: "update" }>;
};

class PendingTopicEmbeddings extends Error {}
class TopicEmbeddingFailure extends Error {}

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
    execution.input.reuseExistingSummaries
      ? listTopicSummaries(execution.projectId, {
          facetId: facet.facetId,
          traceIds,
        })
      : Promise.resolve([]),
  ]);
  const rows = [...staged, ...stored];
  return rows.filter(
    (row) =>
      row.facetVersionId === facet.id &&
      row.summaryModel === execution.input.processingConfig.summaryModel,
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
    return accepted;
  }
  const id = topicSummaryId({
    projectId: execution.projectId,
    facetVersionId: facet.id,
    traceId,
    sessionId: null,
  });
  if (acceptedSummaryIds.has(id))
    throw new TopicEmbeddingFailure(TOPIC_EMBEDDING_EXPIRED_ERROR);
  const summary = await (async (): Promise<TopicSummary> => {
    const { unitStartTime, sessionId, transcript } = await getTranscript();
    const reusable = cached.find((row) => row.traceId === traceId);
    const embeddingMatches = (row: TopicSummary) =>
      row.state === "complete" &&
      row.embeddingModel === TOPICS_EMBEDDING_MODEL &&
      row.embedding.length ===
        execution.input.embeddingConfig.embeddingDimensions;
    const base = {
      id,
      projectId: execution.projectId,
      facetId: facet.facetId,
      facetVersionId: facet.id,
      facetVersion: facet.version,
      traceId,
      sessionId,
      triggerType: "manual_poc" as const,
      unitStartTime,
      executionId: execution.id,
      transcriptId: "poc",
      transcriptVersion: "poc",
      summaryModel: TOPICS_SUMMARY_MODEL,
      embeddingModel: TOPICS_EMBEDDING_MODEL,
      providedUsageDetails: {},
      usageDetails: {},
      providedCostDetails: {},
      costDetails: {},
      processedAt: new Date().toISOString(),
      metadata: {
        coverage: transcript.coverage,
      },
    };
    if (reusable) {
      metrics.result("summary", "cached");
      const reuseEmbedding = embeddingMatches(reusable);
      const state =
        reusable.state === "complete" && !reuseEmbedding
          ? "summarized"
          : reusable.state;
      return {
        ...base,
        state,
        summary: reusable.summary,
        embedding: reuseEmbedding ? reusable.embedding : [],
        metadata: {
          ...base.metadata,
          summaryReusedFromProcessedAt: reusable.processedAt,
          ...(reuseEmbedding
            ? { embeddingReusedFromProcessedAt: reusable.processedAt }
            : {}),
        },
      };
    }
    if (!transcript.hasContent) {
      metrics.result("summary", "insufficient_input");
      return {
        ...base,
        state: "insufficient_input",
        summary: "",
        embedding: [],
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
    metrics.result(
      "summary",
      result.output.status === "applicable"
        ? "generated"
        : result.output.status,
    );
    return {
      ...base,
      state:
        result.output.status === "applicable"
          ? "summarized"
          : result.output.status,
      summary: result.output.summary.trim(),
      embedding: [],
      providedUsageDetails: result.providedUsageDetails,
      usageDetails: result.usageDetails,
      providedCostDetails: result.providedCostDetails,
      costDetails: result.costDetails,
    };
  })();
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
async function awaitEmbeddingBatch(
  execution: TopicExecution,
  batchId: string,
  summaries: TopicEmbeddingRef[],
  retryFailed: boolean,
  pendingEmbeddingBatchIds: Set<string>,
): Promise<void> {
  if (!summaries.length) return;
  const scope = { projectId: execution.projectId, executionId: execution.id };
  try {
    const status = await enqueueTopicEmbeddingBatch(
      { ...scope, batchId, summaries },
      { retryFailed },
    );
    if (status === "pending") {
      pendingEmbeddingBatchIds.add(batchId);
      throw new PendingTopicEmbeddings();
    }
  } catch (error) {
    if (error instanceof PendingTopicEmbeddings) throw error;
    throw new TopicEmbeddingFailure(errorMessage(error));
  }
}

/** Terminal BullMQ state is the completion receipt; Redis payload cleanup is best effort. */
async function releaseCompletedSummaries(state: TopicProcessBatchState) {
  if (
    state.execution.facets.some(
      (facet) => facet.outcome === "pending" || facet.outcome === "failed",
    )
  )
    return;
  try {
    await Promise.all(
      state.summaries.map((ref) =>
        deleteStagedTopicSummary(
          {
            projectId: state.execution.projectId,
            executionId: state.execution.id,
          },
          ref,
        ),
      ),
    );
  } catch (error) {
    logger.warn(
      "Topics completed payload cleanup failed; Redis TTL will expire it.",
      { error },
    );
  }
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
  assignedAt = new Date().toISOString(),
): Extract<TopicAssignment, { traceId: string }>[] {
  const prototypes = run.topics.map((topic) => ({
    id: topic.topicVersionId,
    centroid: topic.centroid,
    radius: topic.radius,
  }));
  return summaries.map((summary) => {
    if (summary.traceId === null)
      throw new Error("Topics processing requires a trace summary.");
    const assigned = classifyTopic(summary.embedding, prototypes);
    const topic = run.topics.find(
      (candidate) => candidate.topicVersionId === assigned.topicId,
    );
    const origin =
      execution.input.operation === "process" ? "online" : "initial";
    return {
      coordinates: coordinates.get(summary.id) ?? null,
      projectId: execution.projectId,
      facetId: facet.facetId,
      facetVersionId: facet.id,
      facetVersion: facet.version,
      sessionId: summary.sessionId,
      traceId: summary.traceId,
      unitStartTime: summary.unitStartTime,
      summaryId: summary.id,
      summaryProcessedAt: summary.processedAt,
      runId: run.id,
      topicId: topic?.topicId ?? null,
      topicVersionId: topic?.topicVersionId ?? null,
      distance: assigned.distance,
      runnerUpDistance: assigned.runnerUpDistance,
      origin,
      assignedAt,
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
  assignedAt = new Date().toISOString(),
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
    const rows = assignmentRows(
      execution,
      facet,
      summaries,
      run,
      coordinates,
      assignedAt,
    );
    await metrics.measure(
      "storage",
      () => writeTopicAssignments(rows),
      "storage",
    );
    const visible =
      execution.input.operation === "update" && rows.length
        ? await readTopicAssignments(
            execution.projectId,
            summaries.map((summary) => summary.id),
            run.id,
          )
        : [];
    const visibleBySummary = new Map(
      visible.map((row) => [row.summaryId, row]),
    );
    if (
      execution.input.operation === "update" &&
      rows.some((row) => {
        const persisted = visibleBySummary.get(row.summaryId);
        return (
          !persisted ||
          persisted.topicId !== row.topicId ||
          persisted.topicVersionId !== row.topicVersionId ||
          persisted.summaryProcessedAt !== row.summaryProcessedAt
        );
      })
    )
      throw new Error(
        "Topic assignments are not fully visible; map publication is deferred.",
      );
    progress.counts.assigned = rows.filter(
      (row) => row.topicId !== null,
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
    id: randomUUID(),
    projectId: execution.projectId,
    executionId: execution.id,
    facetVersionId: facet.id,
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
    await saveTopicRun({
      ...run,
      status: "completed",
      finishedAt: new Date().toISOString(),
    });
    metrics.result("clustering", "no_applicable_summaries");
    return;
  }
  if (summaries.length < numericConfig.minimumCount) {
    progress.outcome = "insufficient_data";
    await saveTopicRun({
      ...run,
      status: "completed",
      finishedAt: new Date().toISOString(),
    });
    metrics.result("clustering", "insufficient_data");
    return;
  }
  run = await saveTopicRun({
    ...run,
    status: "running",
    startedAt: run.startedAt ?? new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
  await saveProgress(metrics, execution, "clustering");
  try {
    const numeric = await metrics.measure(
      "clustering",
      () =>
        runTopicClustering(
          summaries.map((row) => row.embedding),
          numericConfig,
        ),
      "numerical",
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
      run = await saveTopicRun({ ...run, topics });
      metrics.result("naming", "generated");
    }
    if (previous) {
      topics = await (async () => {
        const previousSummaryIds = await readTopicRunSummaryIds(
          execution.projectId,
          previous.id,
        );
        const [previousSummaries, previousAssignments] = await Promise.all([
          readTopicSummaries(execution.projectId, previousSummaryIds),
          readTopicAssignments(
            execution.projectId,
            previousSummaryIds,
            previous.id,
          ),
        ]);
        const bySummary = new Map(
          previousSummaries.map((row) => [row.id, row]),
        );
        return matchTopicContinuity({
          previousTopics: previous.topics,
          candidateTopics: topics,
          previousMemberships: previousAssignments.flatMap((row) => {
            const summary = bySummary.get(row.summaryId);
            return summary && summary.traceId !== null
              ? [
                  {
                    traceId: summary.traceId,
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

/** Processes one bounded queue batch; the job owns retry state until completion. */
async function processTraces(
  metrics: TopicMetrics,
  execution: ProcessExecution,
  state: TopicProcessBatchState,
  batchId: string,
  retryFailed: boolean,
  pendingEmbeddingBatchIds: Set<string>,
  save: (phase: string) => Promise<void>,
) {
  const facets: (PendingFacet & {
    run: TopicRun | null;
  })[] = [];
  for (const { facet, progress } of await pendingFacets(execution)) {
    progress.counts.failed = state.failedTraceIds[facet.id]?.length ?? 0;
    const runId = progress.runId;
    const run = runId ? await getTopicRun(execution.projectId, runId) : null;
    if (runId && (!run?.publishedAt || !compatibleMap(execution, facet, run)))
      throw new Error("The selected topic map is unavailable or incompatible.");
    facets.push({ facet, progress, run });
  }
  if (!facets.length) return;
  if (!state.summarized) {
    const cached = new Map<string, TopicSummary[]>();
    for (const { facet } of facets)
      cached.set(
        facet.id,
        await loadCachedSummaries(execution, facet, execution.input.traceIds),
      );
    for (const { facet } of facets) {
      const available = new Set(cached.get(facet.id)!.map((row) => row.id));
      if (
        state.summaries.some(
          (ref) =>
            ref.facetVersionId === facet.id && !available.has(ref.summaryId),
        )
      )
        throw new TopicEmbeddingFailure(TOPIC_EMBEDDING_EXPIRED_ERROR);
    }
    for (const traceId of execution.input.traceIds) {
      let input: ReturnType<typeof loadTopicTranscript> | undefined;
      const getTranscript = () => {
        if (!input)
          input = metrics.measure(
            "transcript",
            () =>
              loadTopicTranscript({ projectId: execution.projectId, traceId }),
            "trace_load",
          );
        return input;
      };
      for (const { facet, progress } of facets) {
        if (
          state.summaries.some(
            (ref) => ref.facetVersionId === facet.id && ref.traceId === traceId,
          ) ||
          state.failedTraceIds[facet.id]?.includes(traceId)
        )
          continue;
        try {
          const summary = await summarizeTrace(
            metrics,
            execution,
            facet,
            traceId,
            cached.get(facet.id)!,
            new Set(progress.summaryIds),
            getTranscript,
          );
          state.summaries.push({
            summaryId: summary.id,
            facetVersionId: facet.id,
            traceId,
          });
          progress.summaryIds.push(summary.id);
          await save("summarizing");
        } catch (error) {
          metrics.error("summary", error);
          if (isExecutionFailure(error)) throw error;
          const failed = state.failedTraceIds[facet.id] ?? [];
          failed.push(traceId);
          state.failedTraceIds[facet.id] = failed;
          progress.counts.failed = failed.length;
          const message = errorMessage(error);
          if (
            !execution.traceErrors.some(
              (item) => item.traceId === traceId && item.error === message,
            )
          )
            execution.traceErrors.push({ traceId, error: message });
          await save("summarizing");
        }
      }
    }
    state.summarized = true;
    await save("embedding");
  }
  if (!state.assignedAt) {
    await awaitEmbeddingBatch(
      execution,
      batchId,
      state.summaries,
      retryFailed,
      pendingEmbeddingBatchIds,
    );
    // This saved timestamp acknowledges the summary insert and fixes assignment
    // ordering across retries, even if the completed embedding job is removed.
    state.assignedAt = new Date().toISOString();
    await save("assigning");
  }
  const pendingFacetIds = new Set(facets.map(({ facet }) => facet.id));
  const summaries = await Promise.all(
    state.summaries
      .filter((ref) => pendingFacetIds.has(ref.facetVersionId))
      .map(async (ref) => {
        const staged = await readStagedTopicSummary(
          { projectId: execution.projectId, executionId: execution.id },
          ref,
        );
        if (!staged)
          throw new TopicEmbeddingFailure(TOPIC_EMBEDDING_EXPIRED_ERROR);
        if (staged.summary.state === "summarized")
          throw new TopicEmbeddingFailure(
            "Topics embedding batch has an unfinished result.",
          );
        return staged.summary;
      }),
  );
  for (const { facet, progress, run } of facets) {
    try {
      const selected = summaries.filter(
        (row) => row.facetVersionId === facet.id,
      );
      countSummaries(progress, selected);
      const complete = selected.filter((row) => row.state === "complete");
      if (!complete.length) progress.outcome = "no_applicable_summaries";
      else if (!run) {
        progress.outcome = "awaiting_topics";
        metrics.result("assignment", "awaiting_topics", complete.length);
      } else {
        progress.runId = run.id;
        await save("assigning");
        await assignSummaries(
          metrics,
          execution,
          facet,
          progress,
          complete,
          run,
          undefined,
          state.assignedAt,
        );
        progress.outcome = "assigned";
      }
    } catch (error) {
      metrics.error("execution", error);
      progress.outcome = "failed";
      progress.error = errorMessage(error);
      if (isExecutionFailure(error)) throw error;
    }
    await save("processing");
  }
}

/** Each unpublished attempt fits the current compatible summaries from scratch. */
async function updateTopics(metrics: TopicMetrics, execution: UpdateExecution) {
  for (const { facet, progress } of await pendingFacets(execution)) {
    try {
      const accepted = await getPublishedTopicRunForExecution(
        execution.projectId,
        execution.id,
        facet.id,
      );
      if (accepted?.publishedAt) {
        const summaryIds = await readTopicRunSummaryIds(
          execution.projectId,
          accepted.id,
        );
        progress.runId = accepted.id;
        progress.summaryIds = summaryIds;
        progress.counts.requested = summaryIds.length;
        progress.counts.complete = summaryIds.length;
        progress.counts.assigned = Number(accepted.metrics.assigned ?? 0);
        progress.counts.outlier = Number(
          accepted.metrics.outlier ?? summaryIds.length,
        );
        progress.outcome = accepted.topics.length ? "published" : "no_topics";
        await saveProgress(metrics, execution, "processing");
        continue;
      }
      const current = await getPublishedTopicRun(
        execution.projectId,
        facet.facetId,
      );
      const previous = current?.facetVersionId === facet.id ? current : null;
      const summaries = await getTopicClusteringSummaries(
        execution.projectId,
        facet.facetId,
        facet.id,
        execution.input.embeddingConfig,
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

/** Queue batches own trace retry state; Postgres owns compact update progress. */
export async function processTopicsExecution({
  projectId,
  executionId,
  traceIds,
  batchId,
  batchState,
  saveBatchState,
}: {
  projectId: string;
  executionId: string;
  traceIds?: string[];
  batchId?: string;
  batchState?: TopicProcessBatchState;
  saveBatchState?: (state: TopicProcessBatchState) => Promise<void>;
}): Promise<{ pendingEmbeddingBatchIds: string[] } | void> {
  if (!isTopicsEnabled()) throw new Error("Topics processing is not enabled.");
  const metadata = await readTopicExecutionSummary(projectId, executionId);
  if (!metadata) throw new Error("Topics execution not found.");
  const processing = metadata.input.operation === "process";
  if (
    processing &&
    (!traceIds?.length || traceIds.length > 100 || !batchId || !saveBatchState)
  )
    throw new Error(
      "Trace processing requires a queue batch of 1–100 trace IDs and its retry-state writer.",
    );
  if (
    batchState &&
    (batchState.execution.projectId !== projectId ||
      batchState.execution.id !== executionId ||
      batchState.execution.input.operation !== "process" ||
      JSON.stringify(batchState.execution.input.traceIds) !==
        JSON.stringify(traceIds))
  )
    throw new Error("Topics batch state does not match its queue payload.");
  const execution: TopicExecution = batchState?.execution ?? {
    ...metadata,
    input:
      metadata.input.operation === "process"
        ? { ...metadata.input, traceIds: traceIds! }
        : metadata.input,
    status: processing ? "queued" : metadata.status,
    phase: processing ? "queued" : metadata.phase,
    facets: metadata.facets.map((facet) => ({
      ...facet,
      summaryIds: [],
      ...(processing
        ? {
            outcome: "pending" as const,
            error: null,
            counts: {
              requested: traceIds!.length,
              complete: 0,
              nonApplicable: 0,
              insufficientInput: 0,
              failed: 0,
              assigned: 0,
              outlier: 0,
            },
          }
        : {}),
    })),
    traceErrors: [],
    error: processing ? null : metadata.error,
  };
  if (
    ["completed", "completed_with_errors"].includes(execution.status) &&
    !execution.facets.some(
      (facet) => facet.outcome === "pending" || facet.outcome === "failed",
    )
  ) {
    if (batchState) await releaseCompletedSummaries(batchState);
    return;
  }
  const state: TopicProcessBatchState = batchState ?? {
    execution,
    summaries: [],
    failedTraceIds: {},
    summarized: false,
  };
  const pendingEmbeddingBatchIds = new Set<string>();
  const metrics = new TopicMetrics();
  const save = async (phase: string) => {
    execution.phase = phase;
    if (!processing) return saveProgress(metrics, execution, phase);
    try {
      await saveBatchState!(state);
    } catch (error) {
      throw new TopicEmbeddingFailure(errorMessage(error));
    }
  };
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
  const phase = execution.phase === "embedding" ? "embedding" : "summarizing";
  await save(processing ? phase : "selecting");
  try {
    if (execution.input.operation === "process")
      await processTraces(
        metrics,
        execution as ProcessExecution,
        state,
        batchId!,
        retryFailed,
        pendingEmbeddingBatchIds,
        save,
      );
    else await updateTopics(metrics, execution as UpdateExecution);
    execution.status = execution.facets.some(
      (facet) => facet.outcome === "failed" || facet.counts.failed > 0,
    )
      ? "completed_with_errors"
      : "completed";
    await save("completed");
    if (processing) await releaseCompletedSummaries(state);
    metrics.execution(execution.status);
  } catch (error) {
    if (error instanceof PendingTopicEmbeddings) {
      await save("embedding");
      return { pendingEmbeddingBatchIds: [...pendingEmbeddingBatchIds] };
    }
    metrics.error("execution", error);
    metrics.execution("failed");
    execution.status = "failed";
    execution.error = errorMessage(error);
    await save("failed");
  }
}
