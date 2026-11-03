import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import {
  getCurrentSpan,
  instrumentAsync,
  isInternalEvalEnvironment,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import {
  isTopicsEnabled,
  readTopicExecutionSummary,
  writeTopicExecution,
  getTopicFacetVersion,
  listTopicFacets,
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
  type TopicFacetProgress,
  type TopicDefinition,
  type TopicProcessBatchState,
  type TopicTimeRange,
  sameTopicGeometry,
  topicTimeRangeSchema,
} from "@langfuse/shared/topics";
import pLimit from "p-limit";
import { env } from "../../env";
import { nameTopicGroup, prepareTopicNamingGroup } from "./models";
import {
  ASSEMBLED_TRANSCRIPT_ID,
  baseTopicSummary,
  summarizeTraceFacets,
  type TraceFacet,
} from "./summarizeAssembledTrace";
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
import { topicAssignmentRows } from "./assignments";
import {
  runTopicClustering,
  topicClusterSettings,
  TOPICS_NUMERIC_VERSION,
} from "./numeric";
import { matchTopicContinuity } from "./continuity";
import { createEventLoopYielder } from "./event-loop";
import { TopicMetrics } from "./metrics";
import { splitTopicModelUsage } from "./summaryResult";

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
// Like trace-batch, a rejected input or unusable output fails only that trace.
const isTraceModelFailure = (error: unknown) =>
  error instanceof TopicsProviderUnavailable &&
  (error.reason === "invalid_output" ||
    error.reason === "invalid_input" ||
    error.reason === "content_filter");

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

type TraceResults = Map<TraceFacet, TopicSummary | Error>;
type TraceInput = Awaited<ReturnType<typeof loadTopicTranscript>>;

/**
 * Summarizes a trace's pending facets with the trace-batch request: one call for
 * every facet that has no accepted or reusable summary. Results follow `facets`;
 * a trace-level failure applies only to unresolved facets, execution-level failures throw.
 */
async function summarizeTrace(
  metrics: TopicMetrics,
  models: TopicsModels,
  execution: ProcessExecution,
  facets: TraceFacet[],
  traceId: string,
  staged: Map<TopicFacetVersion, TopicSummary[]>,
  getTranscript: () => Promise<TraceInput>,
): Promise<(TopicSummary | Error)[]> {
  const results = acceptedSummaries(metrics, facets, traceId, staged);
  const unresolved = () => facets.filter((facet) => !results.has(facet));
  if (unresolved().length > 0) {
    try {
      const input = await getTranscript();
      if (isInternalEvalEnvironment(input.environment))
        throw new Error("Topics does not process internal Langfuse traces.");
      const base = (facet: TraceFacet) =>
        baseTopicSummary({
          projectId: execution.projectId,
          traceId,
          sessionId: input.sessionId,
          unitStartTime: input.unitStartTime,
          environment: input.environment,
          traceName: input.traceName,
          facet: facet.version,
          summaryModel: execution.input.processingConfig.summaryModel!,
          embeddingModel: execution.input.embeddingConfig.embeddingModel!,
          triggerType: "manual",
          metadata: { executionId: execution.id },
        });
      // Each step records a facet as soon as it is staged, so a later failure keeps it.
      await reuseSummaries(metrics, execution, unresolved(), base, results);
      await summarizePending(
        metrics,
        models,
        execution,
        traceId,
        unresolved(),
        base,
        input,
        results,
      );
    } catch (error) {
      if (isExecutionFailure(error) && !isTraceModelFailure(error)) throw error;
      metrics.error("summary", error);
      logger.warn("Topics summary failed for trace", {
        "langfuse.trace.id": traceId,
        "langfuse.topics.execution_id": execution.id,
        "langfuse.topics.error.reason":
          error instanceof TopicsProviderUnavailable ? error.reason : "other",
        error: errorMessage(error),
      });
      for (const facet of unresolved()) results.set(facet, error as Error);
    }
  }
  return facets.map((facet) => results.get(facet)!);
}

/** Summaries an earlier attempt of this execution already staged. */
function acceptedSummaries(
  metrics: TopicMetrics,
  facets: TraceFacet[],
  traceId: string,
  staged: Map<TopicFacetVersion, TopicSummary[]>,
): TraceResults {
  const results: TraceResults = new Map();
  for (const facet of facets) {
    const accepted = staged
      .get(facet.version)!
      .find((row) => row.traceId === traceId);
    if (!accepted) continue;
    if (isInternalEvalEnvironment(accepted.environment))
      throw new Error("Topics does not process internal Langfuse traces.");
    metrics.result("summary", "cached");
    // An accepted payload may expire after the cache read; never renew its TTL.
    results.set(facet, accepted);
  }
  return results;
}

/** Stages compatible stored summaries when the execution opted into reuse. */
async function reuseSummaries(
  metrics: TopicMetrics,
  execution: ProcessExecution,
  facets: TraceFacet[],
  base: (facet: TraceFacet) => TopicSummary,
  results: TraceResults,
): Promise<void> {
  if (!execution.input.reuseExistingSummaries) return;
  for (const facet of facets) {
    const summary = base(facet);
    const reusable = (
      await listTopicSummaries(
        execution.projectId,
        {
          facetId: summary.facetId,
          facetVersion: summary.facetVersion,
          traceIds: [summary.traceId!],
        },
        summaryTimeRange([summary]),
      )
    ).find(
      (row) =>
        row.summaryModel === execution.input.processingConfig.summaryModel &&
        row.transcriptId === ASSEMBLED_TRANSCRIPT_ID &&
        row.transcriptVersion === TOPICS_TRANSCRIPT_VERSION,
    );
    if (!reusable) continue;
    metrics.result("summary", "cached");
    const reuseEmbedding =
      reusable.state === "complete" &&
      reusable.embeddingModel ===
        execution.input.embeddingConfig.embeddingModel &&
      reusable.embedding.length ===
        execution.input.embeddingConfig.embeddingDimensions;
    results.set(
      facet,
      await stageSummary(metrics, execution, {
        ...summary,
        state:
          reusable.state === "complete" && !reuseEmbedding
            ? "summarized"
            : reusable.state,
        summary: reusable.summary,
        embedding: reuseEmbedding ? reusable.embedding : [],
        metadata: {
          ...summary.metadata,
          summaryReusedFromProcessedAt: reusable.processedAt,
          ...(reuseEmbedding
            ? { embeddingReusedFromProcessedAt: reusable.processedAt }
            : {}),
        },
      }),
    );
  }
}

/** Summarizes the remaining facets in one shared call and stages each result. */
async function summarizePending(
  metrics: TopicMetrics,
  models: TopicsModels,
  execution: ProcessExecution,
  traceId: string,
  facets: TraceFacet[],
  base: (facet: TraceFacet) => TopicSummary,
  input: TraceInput,
  results: TraceResults,
): Promise<void> {
  if (facets.length === 0) return;
  const summarized = await summarizeTraceFacets({
    models,
    facets,
    transcript: input.transcript,
    config: execution.input.processingConfig,
    metadata: {
      source_trace_id: traceId,
      source_environment: input.environment,
      execution_id: execution.id,
    },
    metrics,
  });
  const rows: { facet: TraceFacet; summary: TopicSummary }[] = [];
  for (const [index, facet] of facets.entries()) {
    const result = summarized?.results[index];
    if (result && "error" in result) {
      // An invalid facet output fails only this trace, not the execution.
      results.set(facet, new Error(result.error.message));
      continue;
    }
    const output = result?.output;
    rows.push({
      facet,
      summary: {
        ...base(facet),
        ...(output && {
          state: output.status === "applicable" ? "summarized" : output.status,
          summary: output.status === "applicable" ? output.summary.trim() : "",
        }),
      },
    });
  }
  // One call summarized every facet; each staged row carries an equal share of its usage.
  const shares = summarized
    ? splitTopicModelUsage(summarized.usage, rows.length)
    : [];
  for (const [index, { facet, summary }] of rows.entries())
    results.set(
      facet,
      await stageSummary(metrics, execution, { ...summary, ...shares[index] }),
    );
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
    const refs = state.summaries.concat(
      state.failedTraceIds.flatMap(({ facetId, facetVersion, traceIds }) =>
        traceIds.map((traceId) => ({ facetId, facetVersion, traceId })),
      ),
    );
    await Promise.all(
      refs.map((ref) =>
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
  return instrumentAsync(
    { name: "topics.assignment", traceScope: "topics" },
    (span) => {
      span.setAttribute("langfuse.topics.summaries", summaries.length);
      return metrics.measure("assignment", async () => {
        let assignedCount = 0;
        // Keep classification and readback scratch bounded independently of cohort size.
        for (let start = 0; start < summaries.length; start += 1000) {
          const batch = summaries.slice(start, start + 1000);
          const rows: ReturnType<typeof topicAssignmentRows> = [];
          for (let offset = 0; offset < batch.length; offset += 64) {
            rows.push(
              ...topicAssignmentRows({
                projectId: execution.projectId,
                facet: { facetId: facet.facetId, version: facet.version },
                embeddingConfig: execution.input.embeddingConfig,
                summaries: batch.slice(offset, offset + 64),
                run,
                origin:
                  execution.input.operation === "process"
                    ? "online"
                    : "initial",
                assignedAt,
                coordinates,
              }),
            );
            await yieldToEventLoop();
          }
          await metrics.measure(
            "storage",
            () => writeTopicAssignments(rows),
            "storage",
          );
          if (execution.input.operation === "update") {
            const visible = await readTopicAssignments(
              execution.projectId,
              { facetId: facet.facetId, version: facet.version },
              batch,
              run.id,
              summaryTimeRange(batch),
            );
            const visibleByTrace = new Map(
              visible.map((row) => [row.traceId, row]),
            );
            if (
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
          }
          assignedCount += rows.filter((row) => row.topicId !== null).length;
          await yieldToEventLoop();
        }
        progress.counts.assigned = assignedCount;
        progress.counts.outlier = summaries.length - assignedCount;
        metrics.result("assignment", "assigned", progress.counts.assigned);
        metrics.result("assignment", "outlier", progress.counts.outlier);
      });
    },
  );
}

async function clusterFacet(
  metrics: TopicMetrics,
  models: TopicsModels,
  execution: UpdateExecution,
  facet: TopicFacetVersion,
  facetName: string | undefined,
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
    const numeric = await instrumentAsync(
      { name: "topics.clustering", traceScope: "topics" },
      async (span) => {
        span.setAttributes({
          "langfuse.topics.clustering.vectors": summaries.length,
          "langfuse.topics.clustering.dimensions":
            execution.input.embeddingConfig.embeddingDimensions,
        });
        const result = await metrics.measure(
          "clustering",
          () =>
            runTopicClustering(
              summaries.map((row) => row.embedding),
              numericConfig,
            ),
          "numerical",
        );
        span.setAttribute("langfuse.topics.clustering.status", result.status);
        return result;
      },
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
        : await retainPopulatedTopics(
            summaries,
            (await buildTopicPrototypes(summaries, numeric.labels)).map(
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
        env.LANGFUSE_TOPICS_MAX_CLUSTERING_ROWS,
      );
      const previousMemberships: {
        traceId: string;
        topicVersionId: string | null;
      }[] = [];
      for (let start = 0; start < previousTraceIds.length; start += 1000) {
        const traceIds = previousTraceIds.slice(start, start + 1000);
        const [previousSummaries, previousAssignments] = await Promise.all([
          listTopicSummaries(
            execution.projectId,
            { facetId: facet.facetId, facetVersion: facet.version, traceIds },
            previousTimeRange,
          ),
          readTopicAssignments(
            execution.projectId,
            facetRef,
            traceIds.map((traceId) => ({ traceId, sessionId: null })),
            previous.id,
            previousTimeRange,
          ),
        ]);
        const eligible = new Set(previousSummaries.map((row) => row.traceId));
        for (const row of previousAssignments) {
          if (row.traceId !== null && eligible.has(row.traceId))
            previousMemberships.push({
              traceId: row.traceId,
              topicVersionId: row.topicVersionId,
            });
        }
      }
      const candidateMemberships: {
        traceId: string;
        topicVersionId: string | null;
      }[] = [];
      const yieldIfNeeded = createEventLoopYielder();
      for (const summary of summaries) {
        if (summary.traceId === null)
          throw new Error("Topics processing requires a trace summary.");
        candidateMemberships.push({
          traceId: summary.traceId,
          topicVersionId: classifyTopic(summary.embedding, prototypes).topicId,
        });
        const pause = yieldIfNeeded();
        if (pause) await pause;
      }
      candidates = matchTopicContinuity({
        previousTopics: previous.topics,
        candidateTopics: candidates,
        previousMemberships,
        candidateMemberships,
        exploratory: execution.input.exploratory,
        compatibleEmbeddingSpace: compatiblePrevious,
      });
    }
    const reused = new Map<string, TopicDefinition>();
    candidates = candidates.map((candidate) => {
      const old = previous?.topics.find(
        (topic) => topic.topicId === candidate.topicId,
      );
      if (
        compatiblePrevious &&
        old &&
        !old.metadata.namingFailure &&
        sameTopicGeometry(old, candidate)
      ) {
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
    const evidence = await buildNamingEvidence(
      summaries,
      await retainPopulatedTopics(
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
    const named: NamedTopics = new Map();
    for (const group of evidence) {
      const retained = reused.get(group.id);
      if (retained)
        named.set(retained.name.toLowerCase(), {
          name: retained.name,
          description: retained.description,
          summaries: group.members.slice(0, 3).map((member) => member.summary),
        });
    }
    for (const group of evidence) {
      const retained = reused.get(group.id);
      if (retained) {
        topics.push(retained);
        continue;
      }
      const label = await instrumentAsync(
        { name: "topics.naming", traceScope: "topics" },
        (span) => {
          span.setAttributes({
            "langfuse.topics.group_id": group.id,
            "langfuse.topics.group_members": group.members.length,
          });
          return metrics.measure("naming", async () => {
            const prepared = await prepareTopicNamingGroup(
              {
                members: group.members,
                contrasts: group.contrasts.map((member, index) => ({
                  id: `c${index + 1}`,
                  summary: member.summary,
                })),
              },
              topicHash([run.id, group.id]),
            );
            const label = await nameGroupAvoidingConflicts(
              metrics,
              models,
              named,
              { ...prepared, facetName },
              {
                facet_id: facet.facetId,
                facet_name: facetName,
                facet_version: facet.version,
                execution_id: execution.id,
                run_id: run.id,
                group_id: group.id,
                effective_member_count: group.count,
                selected_member_count: prepared.members.length,
              },
            );
            return {
              ...label,
              selectedMemberCount: prepared.members.length,
              namingSampled: prepared.sampled,
              representativeSummaries: label.evidenceSummaryIds.map((id) => {
                const { facetId, facetVersion, traceId, sessionId } =
                  prepared.members.find((member) => member.id === id)!.source;
                return {
                  facetId,
                  facetVersion,
                  traceId,
                  sessionId: traceId === null ? sessionId : null,
                };
              }),
            };
          });
        },
      ).catch((error: unknown) => {
        if (
          error instanceof TopicsProviderUnavailable &&
          error.reason === "content_filter"
        )
          return null;
        throw error;
      });
      const candidate = candidates.find(
        (topic) => topic.topicVersionId === group.id,
      )!;
      topics.push({
        ...candidate,
        projectId: execution.projectId,
        createdByRunId: run.id,
        createdAt: run.createdAt,
        tags: [],
        name: label?.name ?? `Unnamed topic ${topics.length + 1}`,
        description:
          label?.description ??
          "The model's content filter prevented naming this topic. Its traces and assignments were preserved.",
        representativeSummaries: label?.representativeSummaries ?? [],
        metadata: {
          ...candidate.metadata,
          effectiveMemberCount: group.count,
          ...(label && {
            selectedMemberCount: label.selectedMemberCount,
            namingSampled: label.namingSampled,
          }),
          namingModel: models.clustering.model,
          ...(!label && { namingFailure: "content_filter" }),
        },
      });
      if (label) metrics.result("naming", "generated");
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
    const unnamed = run.topics.filter(
      (topic) => topic.metadata.namingFailure === "content_filter",
    ).length;
    run = await saveTopicRun({
      ...run,
      status: "completed",
      error: unnamed
        ? `The model's content filter prevented naming ${unnamed} topic${unnamed === 1 ? "" : "s"}. Traces and assignments were preserved. Choose another clustering model, then run Update topics to retry naming.`
        : null,
      finishedAt: new Date().toISOString(),
    });
    progress.outcome = "published";
    progress.error = run.error;
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

type NamedTopics = Map<
  string,
  { name: string; description: string; summaries: string[] }
>;

/** Groups are named independently, so a name taken in the run gets one conflict-aware retry. */
async function nameGroupAvoidingConflicts(
  metrics: TopicMetrics,
  models: TopicsModels,
  named: NamedTopics,
  group: Parameters<typeof nameTopicGroup>[1],
  metadata: Record<string, unknown>,
) {
  let { output: label } = await nameTopicGroup(models, group, metadata);
  const conflict = named.get(label.name.toLowerCase());
  if (conflict) {
    metrics.result("naming", "name_conflict");
    // The first name is valid, so a failed rename keeps it.
    label = await nameTopicGroup(models, group, metadata, conflict).then(
      ({ output }) => output,
      (error: unknown) => {
        metrics.error("naming", error);
        return label;
      },
    );
  }
  if (named.has(label.name.toLowerCase()))
    metrics.result("naming", "duplicate_name");
  else
    named.set(label.name.toLowerCase(), {
      name: label.name,
      description: label.description,
      summaries: label.evidenceSummaryIds.map(
        (id) => group.members.find((member) => member.id === id)!.summary,
      ),
    });
  return label;
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
  name: string;
  builtIn: boolean;
};

async function pendingFacets(
  execution: TopicExecution,
): Promise<PendingFacet[]> {
  const facets: PendingFacet[] = [];
  const definitions = await listTopicFacets(execution.projectId);
  for (const progress of execution.facets) {
    if (progress.outcome !== "pending") continue;
    const facet = await getTopicFacetVersion(
      execution.projectId,
      progress.facetId,
      progress.facetVersion,
    );
    const definition = definitions.find(({ id }) => id === progress.facetId);
    if (!facet || !definition)
      throw new Error("Facet version not found in this project.");
    progress.counts.failed = 0;
    facets.push({
      facet,
      progress,
      name: definition.name,
      builtIn: definition.isBuiltIn,
    });
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
  for (const pending of await pendingFacets(execution)) {
    const { facet, progress } = pending;
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
    facets.push({ ...pending, run });
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
    // Traces run concurrently; a trace's pending facets share one transcript and summary call.
    const limit = pLimit(env.LANGFUSE_TOPICS_TRACE_CONCURRENCY);
    let saving = Promise.resolve();
    // Saves write the whole state, so they must not land out of order.
    const saveInOrder = () => {
      const saved = saving.then(() => save("summarizing"));
      saving = saved.catch(() => {});
      return saved;
    };
    let aborted = false;
    const results = await Promise.allSettled(
      execution.input.traceIds.map((traceId) =>
        limit(async () => {
          if (aborted) return;
          let input: ReturnType<typeof loadTopicTranscript> | undefined;
          const getTranscript = () => {
            if (!input)
              input = metrics.measure(
                "transcript",
                () =>
                  loadTopicTranscript({
                    projectId: execution.projectId,
                    traceId,
                  }),
                "trace_load",
              );
            return input;
          };
          const todo = facets.filter(
            ({ facet }) =>
              !state.summaries.some(
                (ref) =>
                  ref.facetId === facet.facetId &&
                  ref.facetVersion === facet.version &&
                  ref.traceId === traceId,
              ) &&
              !state.failedTraceIds.some(
                (entry) =>
                  entry.facetId === facet.facetId &&
                  entry.facetVersion === facet.version &&
                  entry.traceIds.includes(traceId),
              ),
          );
          if (todo.length === 0) return;
          let outcomes: (TopicSummary | Error)[];
          try {
            outcomes = await instrumentAsync(
              { name: "topics-trace-summary", traceScope: "topics" },
              async (span) => {
                span.setAttributes({
                  "langfuse.trace.id": traceId,
                  "langfuse.topics.execution_id": execution.id,
                });
                const results = await summarizeTrace(
                  metrics,
                  models,
                  execution,
                  todo.map(({ facet, name, builtIn }) => ({
                    version: facet,
                    name,
                    builtIn,
                  })),
                  traceId,
                  cached,
                  getTranscript,
                );
                span.setAttribute(
                  "langfuse.topics.trace_outcome",
                  results.some((result) => result instanceof Error)
                    ? "failed"
                    : "summarized",
                );
                return results;
              },
            );
          } catch (error) {
            metrics.error("summary", error);
            if (isExecutionFailure(error) && !isTraceModelFailure(error)) {
              aborted = true;
              throw error;
            }
            outcomes = todo.map(() => error as Error);
          }
          for (const [index, { facet, progress }] of todo.entries()) {
            const outcome = outcomes[index];
            const ref = {
              facetId: facet.facetId,
              facetVersion: facet.version,
              traceId,
            };
            // Invalid facet outputs are already counted by the shared summary call.
            if (outcome instanceof Error)
              recordTraceFailure(state, progress, ref, outcome);
            else state.summaries.push(ref);
          }
          await saveInOrder();
        }),
      ),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
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
  const stagedSummaries = await Promise.all(
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
        return { ref, summary: staged.summary };
      }),
  );
  const summaries: TopicSummary[] = [];
  for (const { ref, summary } of stagedSummaries) {
    if (isInternalEvalEnvironment(summary.environment)) {
      const { progress } = facets.find(
        ({ facet }) =>
          facet.facetId === ref.facetId && facet.version === ref.facetVersion,
      )!;
      const error = new Error(
        "Topics does not process internal Langfuse traces.",
      );
      metrics.error("summary", error);
      recordTraceFailure(state, progress, ref, error);
      state.summaries = state.summaries.filter((entry) => entry !== ref);
      continue;
    }
    if (summary.state === "summarized")
      throw new TopicEmbeddingFailure(
        "Topics embedding batch has an unfinished result.",
      );
    summaries.push(summary);
  }
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
      failFacet(metrics, execution, facet, progress, error);
    }
    await save("processing");
  }
}

function recordTraceFailure(
  state: TopicProcessBatchState,
  progress: TopicFacetProgress,
  { facetId, facetVersion, traceId }: TopicEmbeddingRef,
  error: unknown,
) {
  let failed = state.failedTraceIds.find(
    (entry) => entry.facetId === facetId && entry.facetVersion === facetVersion,
  );
  if (!failed) {
    failed = { facetId, facetVersion, traceIds: [] };
    state.failedTraceIds.push(failed);
  }
  if (!failed.traceIds.includes(traceId)) failed.traceIds.push(traceId);
  progress.counts.failed = failed.traceIds.length;
  const message = errorMessage(error);
  if (
    !state.execution.traceErrors.some(
      (item) => item.traceId === traceId && item.error === message,
    )
  )
    state.execution.traceErrors.push({ traceId, error: message });
}

/** Each unpublished attempt fits the current compatible summaries from scratch. */
async function updateTopics(
  metrics: TopicMetrics,
  models: TopicsModels,
  execution: UpdateExecution,
) {
  const facetNames = new Map(
    (await listTopicFacets(execution.projectId)).map((facet) => [
      facet.id,
      facet.name,
    ]),
  );
  for (const { facet, progress } of await pendingFacets(execution)) {
    await instrumentAsync(
      { name: "topics-facet-update", traceScope: "topics" },
      async (span) => {
        span.setAttributes({
          "langfuse.topics.execution_id": execution.id,
          "langfuse.topics.facet_id": facet.facetId,
          "langfuse.topics.facet_version": facet.version,
        });
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
            throw new Error(
              "Clustering run does not match this facet version.",
            );
          if (accepted?.status === "completed") {
            progress.error = accepted.error;
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
            progress.counts.outlier =
              assignments.length - progress.counts.assigned;
            progress.outcome = accepted.topics.length
              ? "published"
              : "no_topics";
            await saveProgress(metrics, execution, "processing");
            return;
          }
          if (accepted?.status === "skipped") {
            progress.outcome = progress.counts.requested
              ? "insufficient_data"
              : "no_applicable_summaries";
            await saveProgress(metrics, execution, "processing");
            return;
          }
          const current = await getPublishedTopicRun(
            execution.projectId,
            facet.facetId,
          );
          const previous =
            current?.facetVersion === facet.version ? current : null;
          const summaries = await getTopicClusteringSummaries(
            execution.projectId,
            facet.facetId,
            facet.version,
            execution.input.embeddingConfig,
            execution.input.timeRange,
            {
              maxRows: env.LANGFUSE_TOPICS_MAX_CLUSTERING_ROWS,
              maxBytes: env.LANGFUSE_TOPICS_MAX_CLUSTERING_BYTES,
            },
          ).catch(async (error: unknown) => {
            if (accepted?.status === "pending")
              await saveTopicRun({
                ...accepted,
                status: "failed",
                error: errorMessage(error),
                finishedAt: new Date().toISOString(),
              });
            throw error;
          });
          countSummaries(progress, summaries);
          progress.counts.requested = summaries.length;
          await clusterFacet(
            metrics,
            models,
            execution,
            facet,
            facetNames.get(facet.facetId),
            progress,
            summaries,
            accepted,
            previous,
          );
        } catch (error) {
          failFacet(metrics, execution, facet, progress, error);
        }
        await saveProgress(metrics, execution, "processing");
        span.setAttribute("langfuse.topics.facet_outcome", progress.outcome);
      },
    );
  }
}

/** Provider and configuration failures are the customer's to fix; anything else is ours. */
function failFacet(
  metrics: TopicMetrics,
  execution: TopicExecution,
  facet: TopicFacetVersion,
  progress: TopicFacetProgress,
  error: unknown,
) {
  metrics.error("execution", error);
  progress.outcome = "failed";
  progress.error = errorMessage(error);
  const log =
    error instanceof TopicsProviderUnavailable ? logger.warn : logger.error;
  log("Topics facet failed", {
    "langfuse.topics.execution_id": execution.id,
    "langfuse.topics.operation": execution.input.operation,
    "langfuse.topics.facet_id": facet.facetId,
    "langfuse.topics.facet_version": facet.version,
    error: progress.error,
  });
  if (isExecutionFailure(error)) throw error;
  // Handled, but still a failed facet for the user; the enclosing span reports it.
  traceException(error);
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
      (facet) =>
        facet.outcome === "failed" ||
        facet.counts.failed > 0 ||
        facet.error !== null,
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
  } finally {
    getCurrentSpan()?.setAttributes({
      "langfuse.project.id": projectId,
      "langfuse.topics.execution_id": executionId,
      "langfuse.topics.operation": execution.input.operation,
      "langfuse.topics.execution_status": execution.status,
      "langfuse.topics.execution_phase": execution.phase,
    });
  }
}
