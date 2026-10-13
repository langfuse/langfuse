import { logger } from "@langfuse/shared/src/server";
import {
  isTopicsEnabled,
  readTopicExecutionSummary,
  writeTopicExecution,
  getTopicFacetVersion,
  listTopicSummaries,
  writeTopicAssignments,
  readTopicAssignments,
  readTopicRunTraceIds,
  createTopicRun,
  getTopicRun,
  getPublishedTopicRun,
  readTopicMapAssignments,
  getTopicClusteringSummaries,
  saveTopicRun,
  loadTopicTranscript,
  stageTopicSummary,
  deleteStagedTopicSummary,
  readStagedTopicSummaries,
  readStagedTopicSummary,
  enqueueTopicEmbeddingBatch,
  TOPIC_EMBEDDING_EXPIRED_ERROR,
  TOPICS_TRANSCRIPT_VERSION,
  getTopicsModels,
  type TopicEmbeddingRef,
  type TopicsModels,
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
  type TopicTimeRange,
  sameTopicGeometry,
  topicTimeRangeSchema,
} from "@langfuse/shared/topics";
import { summarizeTopicTrace, nameTopicGroup } from "./models";
import {
  isRejectedConnection,
  pauseForRejectedConnection,
  TopicsProviderUnavailable,
} from "./provider-error";
import {
  buildTopicPrototypes,
  buildNamingEvidence,
  classifyTopic,
  retainPopulatedTopics,
  topicHash,
} from "./classifier";
import {
  runTopicClustering,
  topicClusterSettings,
  TOPICS_NUMERIC_VERSION,
} from "./numeric";
import { matchTopicContinuity } from "./continuity";
import { TopicMetrics } from "./metrics";
import { topicSummaryOutputError } from "./summaryResult";

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

async function summarizeTrace(
  metrics: TopicMetrics,
  models: TopicsModels,
  execution: ProcessExecution,
  facet: TopicFacetVersion,
  traceId: string,
  staged: TopicSummary[],
  getTranscript: () => ReturnType<typeof loadTopicTranscript>,
): Promise<TopicSummary> {
  const accepted = staged.find((row) => row.traceId === traceId);
  if (accepted) {
    metrics.result("summary", "cached");
    // An accepted payload may expire after the cache read; never renew its TTL.
    return accepted;
  }
  const { unitStartTime, sessionId, environment, traceName, transcript } =
    await getTranscript();
  const source = {
    projectId: execution.projectId,
    facetId: facet.facetId,
    facetVersion: facet.version,
    traceId,
    sessionId,
  };
  let summary: TopicSummary = {
    ...source,
    triggerType: "manual_poc",
    unitStartTime,
    environment,
    traceName,
    state: "insufficient_input",
    summary: "",
    embedding: [],
    transcriptId: "poc",
    transcriptVersion: TOPICS_TRANSCRIPT_VERSION,
    summaryModel: execution.input.processingConfig.summaryModel!,
    embeddingModel: execution.input.embeddingConfig.embeddingModel!,
    providedUsageDetails: {},
    usageDetails: {},
    providedCostDetails: {},
    costDetails: {},
    processedAt: new Date().toISOString(),
    metadata: {},
  };
  const reusable = execution.input.reuseExistingSummaries
    ? (
        await listTopicSummaries(
          execution.projectId,
          {
            facetId: facet.facetId,
            facetVersion: facet.version,
            traceIds: [traceId],
          },
          summaryTimeRange([summary]),
        )
      ).find(
        (row) =>
          row.summaryModel === execution.input.processingConfig.summaryModel &&
          row.transcriptVersion === TOPICS_TRANSCRIPT_VERSION,
      )
    : undefined;
  if (reusable) {
    metrics.result("summary", "cached");
    const reuseEmbedding =
      reusable.state === "complete" &&
      reusable.embeddingModel ===
        execution.input.embeddingConfig.embeddingModel &&
      reusable.embedding.length ===
        execution.input.embeddingConfig.embeddingDimensions;
    summary = {
      ...summary,
      state:
        reusable.state === "complete" && !reuseEmbedding
          ? "summarized"
          : reusable.state,
      summary: reusable.summary,
      embedding: reuseEmbedding ? reusable.embedding : [],
      metadata: {
        summaryReusedFromProcessedAt: reusable.processedAt,
        ...(reuseEmbedding
          ? { embeddingReusedFromProcessedAt: reusable.processedAt }
          : {}),
      },
    };
  } else if (transcript !== null) {
    const result = await metrics.measure("summary", async () => {
      const result = await summarizeTopicTrace(
        models,
        facet,
        JSON.stringify(transcript),
        execution.input.processingConfig,
      );
      const error = topicSummaryOutputError(result.output);
      if (error) throw invalidOutput(metrics, "summary", error);
      return result;
    });
    metrics.result(
      "summary",
      result.output.status === "applicable"
        ? "generated"
        : result.output.status,
    );
    summary = {
      ...summary,
      state:
        result.output.status === "applicable"
          ? "summarized"
          : result.output.status,
      summary:
        result.output.status === "applicable"
          ? result.output.summary.trim()
          : "",
      providedUsageDetails: result.providedUsageDetails,
      usageDetails: result.usageDetails,
      providedCostDetails: result.providedCostDetails,
      costDetails: result.costDetails,
    };
  } else {
    metrics.result("summary", "insufficient_input");
  }
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
      () =>
        stageTopicSummary(
          { projectId: execution.projectId, executionId: execution.id },
          summary,
          execution.input.embeddingConfig,
        ),
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
): Promise<void> {
  if (!summaries.length) return;
  const scope = { projectId: execution.projectId, executionId: execution.id };
  try {
    const status = await enqueueTopicEmbeddingBatch(
      { ...scope, batchId, summaries },
      { retryFailed },
    );
    if (status === "pending") throw new PendingTopicEmbeddings();
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

function summaryTimeRange(summaries: TopicSummary[]): TopicTimeRange {
  let from = Infinity;
  let to = -Infinity;
  for (const summary of summaries) {
    const timestamp = Date.parse(summary.unitStartTime);
    from = Math.min(from, timestamp);
    to = Math.max(to, timestamp + 1);
  }
  return topicTimeRangeSchema.parse({ from: new Date(from), to: new Date(to) });
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
      run.facetId !== facet.facetId ||
      run.facetVersion !== facet.version ||
      run.topics.some(
        (topic) =>
          topic.centroid.length !==
          execution.input.embeddingConfig.embeddingDimensions,
      ) ||
      run.config.embeddingModel !==
        execution.input.embeddingConfig.embeddingModel
    )
      throw new Error("Target map is incompatible with this facet version.");
    const prototypes = run.topics.map((topic) => ({
      id: topic.topicVersionId,
      centroid: topic.centroid,
      radius: topic.radius,
    }));
    const rows = summaries.map<TopicAssignment>((summary) => {
      if (summary.traceId === null)
        throw new Error("Topics processing requires a trace summary.");
      const assigned = classifyTopic(summary.embedding, prototypes);
      const topic = run.topics.find(
        (candidate) => candidate.topicVersionId === assigned.topicId,
      );
      const origin =
        execution.input.operation === "process" ? "online" : "initial";
      return {
        coordinates: coordinates.get(summary.traceId) ?? null,
        projectId: execution.projectId,
        facetId: facet.facetId,
        facetVersion: facet.version,
        sessionId: summary.sessionId,
        traceId: summary.traceId,
        environment: summary.environment,
        traceName: summary.traceName,
        unitStartTime: summary.unitStartTime,
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
    await metrics.measure(
      "storage",
      () => writeTopicAssignments(rows),
      "storage",
    );
    const visible =
      execution.input.operation === "update" && rows.length
        ? await readTopicAssignments(
            execution.projectId,
            { facetId: facet.facetId, version: facet.version },
            summaries,
            run.id,
            summaryTimeRange(summaries),
          )
        : [];
    const visibleByTrace = new Map(visible.map((row) => [row.traceId, row]));
    if (
      execution.input.operation === "update" &&
      rows.some((row) => {
        const persisted = visibleByTrace.get(row.traceId);
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
  models: TopicsModels,
  execution: UpdateExecution,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  summaries: TopicSummary[],
  attempt: TopicRun | null,
  previous: TopicRun | null,
) {
  const numericConfig = {
    ...topicClusterSettings(
      execution.input.exploratory,
      execution.input.minimumTraceCount,
    ),
    numericVersion: TOPICS_NUMERIC_VERSION,
  };
  const config = {
    ...numericConfig,
    exploratory: execution.input.exploratory,
    embeddingModel: execution.input.embeddingConfig.embeddingModel!,
    dimensions: execution.input.embeddingConfig.embeddingDimensions,
    classifierVersion: "original-cosine-loo95-rival05-eps1e-12-v2",
    timeRange: {
      from: execution.input.timeRange.from.toISOString(),
      to: execution.input.timeRange.to.toISOString(),
    },
  };
  let run =
    attempt?.status === "pending"
      ? await saveTopicRun({ ...attempt, config })
      : await createTopicRun({
          projectId: execution.projectId,
          facetId: facet.facetId,
          facetVersion: facet.version,
          config,
        });
  progress.runId = run.id;
  // Persist the attempt and selected cohort before any terminal result or inference.
  await saveProgress(metrics, execution, "clustering");
  if (summaries.length < numericConfig.minimumCount) {
    progress.outcome = summaries.length
      ? "insufficient_data"
      : "no_applicable_summaries";
    await saveTopicRun({
      ...run,
      status: "skipped",
      finishedAt: new Date().toISOString(),
    });
    metrics.result("clustering", progress.outcome);
    return;
  }
  run = await saveTopicRun({
    ...run,
    status: "running",
    startedAt: run.startedAt ?? new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
  try {
    metrics.clusteringWorkload(
      summaries.length,
      execution.input.embeddingConfig.embeddingDimensions,
    );
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
        .map((row, index) => [row.traceId, numeric.coordinates[index]])
        .filter(
          (entry): entry is [string, [number, number]] =>
            typeof entry[0] === "string" && Array.isArray(entry[1]),
        ),
    );
    const prototypes =
      numeric.status === "no_topics"
        ? []
        : retainPopulatedTopics(
            summaries,
            buildTopicPrototypes(summaries, numeric.labels).map(
              (prototype) => ({
                ...prototype,
                id: topicHash([run.id, prototype.id]).slice(0, 48),
              }),
            ),
          );
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
        finishedAt: new Date().toISOString(),
      });
      progress.outcome = "no_topics";
      return;
    }
    metrics.result("clustering", "topics_found");
    let candidates = prototypes.map((prototype) => ({
      topicVersionId: prototype.id,
      topicId: prototype.id,
      centroid: prototype.centroid,
      radius: prototype.radius,
      metadata: {},
    }));
    const compatiblePrevious =
      previous !== null && compatibleMap(execution, facet, previous);
    if (previous) {
      const facetRef = { facetId: facet.facetId, version: facet.version };
      const previousTimeRange = topicTimeRangeSchema.parse(
        previous.config.timeRange,
      );
      const previousTraceIds = await readTopicRunTraceIds(
        execution.projectId,
        facetRef,
        previous.id,
        previousTimeRange,
      );
      const [previousSummaries, previousAssignments] = await Promise.all([
        listTopicSummaries(
          execution.projectId,
          {
            facetId: facet.facetId,
            facetVersion: facet.version,
            traceIds: previousTraceIds,
          },
          previousTimeRange,
        ),
        readTopicAssignments(
          execution.projectId,
          facetRef,
          previousTraceIds.map((traceId) => ({ traceId, sessionId: null })),
          previous.id,
          previousTimeRange,
        ),
      ]);
      const byTrace = new Map(
        previousSummaries.map((row) => [row.traceId, row]),
      );
      candidates = matchTopicContinuity({
        previousTopics: previous.topics,
        candidateTopics: candidates,
        previousMemberships: previousAssignments.flatMap((row) => {
          const summary = byTrace.get(row.traceId);
          return summary && summary.traceId !== null
            ? [
                {
                  traceId: summary.traceId,
                  topicVersionId: row.topicVersionId,
                },
              ]
            : [];
        }),
        candidateMemberships: summaries.map((summary) => {
          if (summary.traceId === null)
            throw new Error("Topics processing requires a trace summary.");
          return {
            traceId: summary.traceId,
            topicVersionId: classifyTopic(summary.embedding, prototypes)
              .topicId,
          };
        }),
        exploratory: execution.input.exploratory,
        compatibleEmbeddingSpace: compatiblePrevious,
      });
    }
    const reused = new Map<string, TopicDefinition>();
    candidates = candidates.map((candidate) => {
      const old = previous?.topics.find(
        (topic) => topic.topicId === candidate.topicId,
      );
      if (compatiblePrevious && old && sameTopicGeometry(old, candidate)) {
        reused.set(old.topicVersionId, old);
        return {
          ...candidate,
          topicVersionId: old.topicVersionId,
          centroid: old.centroid,
          radius: old.radius,
        };
      }
      return candidate;
    });
    // Final version IDs also determine the serving classifier's distance ties.
    const evidence = buildNamingEvidence(
      summaries,
      retainPopulatedTopics(
        summaries,
        candidates.map((candidate) => ({
          id: candidate.topicVersionId,
          centroid: candidate.centroid,
          radius: candidate.radius,
        })),
      ),
    );
    await saveProgress(metrics, execution, "naming");
    const topics: TopicDefinition[] = [];
    const names = new Set(
      evidence.flatMap((group) => {
        const retained = reused.get(group.id);
        return retained ? [retained.name.trim().toLowerCase()] : [];
      }),
    );
    for (const group of evidence) {
      const retained = reused.get(group.id);
      if (retained) {
        topics.push(retained);
        continue;
      }
      const label = await metrics.measure("naming", async () => {
        const members = new Map(
          group.members.map((summary, index) => [`m${index + 1}`, summary]),
        );
        const { output: label } = await nameTopicGroup(models, {
          members: Array.from(members, ([id, { summary }]) => ({
            id,
            summary,
          })),
          contrasts: group.contrasts.map((member, index) => ({
            id: `c${index + 1}`,
            summary: member.summary,
          })),
        });
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
        return {
          ...label,
          representativeSummaries: label.evidenceSummaryIds.map((id) => {
            const { facetId, facetVersion, traceId, sessionId } =
              members.get(id)!;
            return {
              facetId,
              facetVersion,
              traceId,
              sessionId: traceId === null ? sessionId : null,
            };
          }),
        };
      });
      names.add(label.name.trim().toLowerCase());
      const candidate = candidates.find(
        (topic) => topic.topicVersionId === group.id,
      )!;
      topics.push({
        ...candidate,
        projectId: execution.projectId,
        createdByRunId: run.id,
        createdAt: run.createdAt,
        tags: [],
        name: label.name.trim(),
        description: label.description.trim(),
        representativeSummaries: label.representativeSummaries,
        metadata: {
          ...candidate.metadata,
          effectiveMemberCount: group.count,
          namingModel: models.clustering.model,
        },
      });
      metrics.result("naming", "generated");
    }
    run = await saveTopicRun({ ...run, topics });
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
      finishedAt: new Date().toISOString(),
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
    run.facetId === facet.facetId &&
    run.facetVersion === facet.version &&
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
      progress.facetId,
      progress.facetVersion,
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
  models: TopicsModels,
  execution: ProcessExecution,
  state: TopicProcessBatchState,
  batchId: string,
  retryFailed: boolean,
  save: (phase: string) => Promise<void>,
) {
  const facets: (PendingFacet & {
    run: TopicRun | null;
  })[] = [];
  for (const { facet, progress } of await pendingFacets(execution)) {
    progress.counts.failed =
      state.failedTraceIds.find(
        (entry) =>
          entry.facetId === facet.facetId &&
          entry.facetVersion === facet.version,
      )?.traceIds.length ?? 0;
    const runId = progress.runId;
    const run = runId ? await getTopicRun(execution.projectId, runId) : null;
    if (
      runId &&
      (run?.status !== "completed" || !compatibleMap(execution, facet, run))
    )
      throw new Error("The selected topic map is unavailable or incompatible.");
    facets.push({ facet, progress, run });
  }
  if (!facets.length) return;
  if (!state.summarized) {
    const cached = new Map<TopicFacetVersion, TopicSummary[]>();
    for (const { facet } of facets)
      cached.set(
        facet,
        await readStagedTopicSummaries(
          execution.projectId,
          execution.id,
          facet.facetId,
          facet.version,
          execution.input.traceIds,
        ),
      );
    for (const { facet } of facets) {
      const available = new Set(cached.get(facet)!.map((row) => row.traceId));
      if (
        state.summaries.some(
          (ref) =>
            ref.facetId === facet.facetId &&
            ref.facetVersion === facet.version &&
            !available.has(ref.traceId),
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
            (ref) =>
              ref.facetId === facet.facetId &&
              ref.facetVersion === facet.version &&
              ref.traceId === traceId,
          ) ||
          state.failedTraceIds.some(
            (entry) =>
              entry.facetId === facet.facetId &&
              entry.facetVersion === facet.version &&
              entry.traceIds.includes(traceId),
          )
        )
          continue;
        try {
          await summarizeTrace(
            metrics,
            models,
            execution,
            facet,
            traceId,
            cached.get(facet)!,
            getTranscript,
          );
          state.summaries.push({
            facetId: facet.facetId,
            facetVersion: facet.version,
            traceId,
          });
          await save("summarizing");
        } catch (error) {
          metrics.error("summary", error);
          if (isExecutionFailure(error)) throw error;
          let failed = state.failedTraceIds.find(
            (entry) =>
              entry.facetId === facet.facetId &&
              entry.facetVersion === facet.version,
          );
          if (!failed) {
            failed = {
              facetId: facet.facetId,
              facetVersion: facet.version,
              traceIds: [],
            };
            state.failedTraceIds.push(failed);
          }
          failed.traceIds.push(traceId);
          progress.counts.failed = failed.traceIds.length;
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
    await awaitEmbeddingBatch(execution, batchId, state.summaries, retryFailed);
    // This saved timestamp acknowledges the summary insert and fixes assignment
    // ordering across retries, even if the completed embedding job is removed.
    state.assignedAt = new Date().toISOString();
    await save("assigning");
  }
  const summaries = await Promise.all(
    state.summaries
      .filter((ref) =>
        facets.some(
          ({ facet }) =>
            ref.facetId === facet.facetId && ref.facetVersion === facet.version,
        ),
      )
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
        (row) =>
          row.facetId === facet.facetId && row.facetVersion === facet.version,
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
async function updateTopics(
  metrics: TopicMetrics,
  models: TopicsModels,
  execution: UpdateExecution,
) {
  for (const { facet, progress } of await pendingFacets(execution)) {
    try {
      const accepted = progress.runId
        ? await getTopicRun(execution.projectId, progress.runId)
        : null;
      if (
        accepted &&
        (accepted.projectId !== execution.projectId ||
          accepted.facetId !== facet.facetId ||
          accepted.facetVersion !== facet.version)
      )
        throw new Error("Clustering run does not match this facet version.");
      if (accepted?.status === "completed") {
        const assignments = await readTopicMapAssignments(
          execution.projectId,
          { facetId: facet.facetId, version: facet.version },
          accepted.id,
          topicTimeRangeSchema.parse(accepted.config.timeRange),
        );
        progress.counts.requested = assignments.length;
        progress.counts.complete = assignments.length;
        progress.counts.assigned = assignments.filter(
          (row) => row.topicId !== null,
        ).length;
        progress.counts.outlier = assignments.length - progress.counts.assigned;
        progress.outcome = accepted.topics.length ? "published" : "no_topics";
        await saveProgress(metrics, execution, "processing");
        continue;
      }
      if (accepted?.status === "skipped") {
        progress.outcome = progress.counts.requested
          ? "insufficient_data"
          : "no_applicable_summaries";
        await saveProgress(metrics, execution, "processing");
        continue;
      }
      const current = await getPublishedTopicRun(
        execution.projectId,
        facet.facetId,
      );
      const previous = current?.facetVersion === facet.version ? current : null;
      const summaries = await getTopicClusteringSummaries(
        execution.projectId,
        facet.facetId,
        facet.version,
        execution.input.embeddingConfig,
        execution.input.timeRange,
      );
      countSummaries(progress, summaries);
      progress.counts.requested = summaries.length;
      await clusterFacet(
        metrics,
        models,
        execution,
        facet,
        progress,
        summaries,
        accepted,
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
}): Promise<void> {
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
    failedTraceIds: [],
    summarized: false,
  };
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
    const models = await getTopicsModels(projectId);
    if (!models)
      throw new TopicsProviderUnavailable(
        "Choose Topics models for this project before running Topics.",
        "configuration",
      );
    if (
      execution.input.embeddingConfig.embeddingModel !== models.embedding.model
    )
      throw new TopicsProviderUnavailable(
        "The project's embedding model changed after this execution was created; start a new Topics execution.",
        "configuration",
      );
    if (execution.input.operation === "process") {
      if (
        execution.input.processingConfig.summaryModel !== models.summary.model
      )
        throw new TopicsProviderUnavailable(
          "The project's summary model changed after this execution was created; start a new Topics execution.",
          "configuration",
        );
      await processTraces(
        metrics,
        models,
        execution as ProcessExecution,
        state,
        batchId!,
        retryFailed,
        save,
      );
    } else {
      await updateTopics(metrics, models, execution as UpdateExecution);
    }
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
      return;
    }
    if (isRejectedConnection(error))
      await pauseForRejectedConnection(projectId, error);
    metrics.error("execution", error);
    metrics.execution("failed");
    execution.status = "failed";
    execution.error = errorMessage(error);
    await save("failed");
  }
}
