import { createHash } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import { InvalidRequestError } from "@langfuse/shared";
import {
  logger,
  QueueJobs,
  recordIncrement,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getTopicProcessingMapIds,
  getTopicRun,
  getTopicSummaryCounts,
  getTopicsModels,
  listTopicSummaries,
  readTopicAssignments,
  readTopicExecutionForRequest,
  TOPICS_SYSTEM_USER_ID,
  TOPICS_TRACE_BATCH_SIZE,
  TopicsAutomaticQueue,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import type {
  TopicEmbeddingConfig,
  TopicFacetRef,
  TopicRun,
  TopicSummary,
  TopicTimeRange,
} from "@langfuse/shared/topics";
import { topicAssignmentRows } from "./assignments";
import { TopicMetrics } from "./metrics";
import { topicClusterSettings } from "./numeric";

type AutomaticBatch = TQueueJobTypes[QueueName.TopicsAutomatic]["payload"];

const DISCOVERY_WINDOW_MS = 7 * 24 * 60 * 60_000;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Queues assignment for the complete summaries a trace batch stored, one job per project,
 * vector space and 100 traces. Job IDs repeat for a retried batch, so it queues nothing twice.
 */
export async function enqueueAutomaticTopicAssignments(
  batchId: string,
  rows: TopicSummary[],
): Promise<void> {
  const queue = TopicsAutomaticQueue.getInstance();
  if (!queue) return;
  const groups = new Map<
    string,
    Omit<AutomaticBatch, "traceIds" | "facets"> & {
      traceIds: Set<string>;
      facets: Map<string, TopicFacetRef>;
    }
  >();
  for (const row of rows) {
    if (row.state !== "complete" || row.traceId === null) continue;
    const embeddingConfig = {
      embeddingModel: row.embeddingModel,
      embeddingDimensions: row.embedding.length,
    };
    const key = JSON.stringify([row.projectId, embeddingConfig]);
    const start = new Date(row.unitStartTime);
    const end = new Date(start.getTime() + 1);
    const group = groups.get(key) ?? {
      projectId: row.projectId,
      embeddingConfig,
      timeRange: { from: start, to: end },
      traceIds: new Set<string>(),
      facets: new Map<string, TopicFacetRef>(),
    };
    if (start < group.timeRange.from) group.timeRange.from = start;
    if (end > group.timeRange.to) group.timeRange.to = end;
    group.traceIds.add(row.traceId);
    group.facets.set(JSON.stringify([row.facetId, row.facetVersion]), {
      facetId: row.facetId,
      version: row.facetVersion,
    });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const traceIds = [...group.traceIds];
    for (
      let index = 0;
      index < traceIds.length;
      index += TOPICS_TRACE_BATCH_SIZE
    ) {
      const payload: AutomaticBatch = {
        ...group,
        traceIds: traceIds.slice(index, index + TOPICS_TRACE_BATCH_SIZE),
        facets: [...group.facets.values()],
      };
      const id = hash([
        batchId,
        payload.projectId,
        payload.embeddingConfig,
        payload.traceIds,
      ]);
      await queue.add(
        QueueJobs.TopicsAutomatic,
        { id, timestamp: new Date(), name: QueueJobs.TopicsAutomatic, payload },
        { jobId: id },
      );
    }
  }
}

/**
 * Assigns the batch's current complete summaries to each facet's compatible serving map,
 * skipping ones already assigned, or starts the facet's first discovery once enough exist.
 */
export async function processAutomaticTopicAssignments(
  batch: AutomaticBatch,
): Promise<void> {
  const { projectId, traceIds, embeddingConfig, timeRange } = batch;
  for (const facet of batch.facets) {
    const summaries = (
      await listTopicSummaries(
        projectId,
        { traceIds, facetId: facet.facetId, facetVersion: facet.version },
        timeRange,
      )
    ).filter(
      (row) =>
        row.state === "complete" &&
        row.traceId !== null &&
        row.embeddingModel === embeddingConfig.embeddingModel &&
        row.embedding.length === embeddingConfig.embeddingDimensions,
    );
    if (!summaries.length) continue;
    const [map] = await getTopicProcessingMapIds(
      projectId,
      [facet],
      embeddingConfig,
    );
    const run = map?.runId ? await getTopicRun(projectId, map.runId) : null;
    if (run?.status === "completed")
      await assign(batch, facet, summaries, run, timeRange);
    else await startDiscovery(projectId, facet, embeddingConfig);
  }
}

async function assign(
  batch: AutomaticBatch,
  facet: TopicFacetRef,
  summaries: TopicSummary[],
  run: TopicRun,
  timeRange: TopicTimeRange,
) {
  const metrics = new TopicMetrics();
  await metrics.measure("assignment", async () => {
    const assigned = new Set(
      (
        await readTopicAssignments(
          batch.projectId,
          facet,
          summaries,
          run.id,
          timeRange,
        )
      ).map((row) => JSON.stringify([row.traceId, row.summaryProcessedAt])),
    );
    const pending = summaries.filter(
      (row) => !assigned.has(JSON.stringify([row.traceId, row.processedAt])),
    );
    if (!pending.length) return;
    const rows = topicAssignmentRows({
      projectId: batch.projectId,
      facet,
      embeddingConfig: batch.embeddingConfig,
      summaries: pending,
      run,
      origin: "online",
      assignedAt: new Date().toISOString(),
    });
    await writeTopicAssignments(rows);
    const topics = rows.filter((row) => row.topicId !== null).length;
    metrics.result("assignment", "assigned", topics);
    metrics.result("assignment", "outlier", rows.length - topics);
  });
}

/** One deterministic execution per facet version and vector space; History keeps its outcome. */
async function startDiscovery(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
) {
  // Any map for this or a newer version, even an incompatible one, is replaced only by Update topics.
  if (
    await prisma.topicClusteringRun.findFirst({
      where: {
        projectId,
        facetId: facet.facetId,
        facetVersion: { gte: facet.version },
        status: "completed",
      },
      select: { id: true },
    })
  )
    return;
  // Summaries from before an embedding model change would fail the execution's model check.
  const models = await getTopicsModels(projectId);
  if (
    !models ||
    models.embedding.model !== embeddingConfig.embeddingModel ||
    models.embedding.dimensions !== embeddingConfig.embeddingDimensions
  )
    return;
  const requestId = hash(["topics-discovery", facet, embeddingConfig]);
  // Started before, in any state; failed or interrupted runs are resumed from History.
  if (await readTopicExecutionForRequest(projectId, requestId, requestId))
    return;
  const to = new Date();
  const timeRange = { from: new Date(to.getTime() - DISCOVERY_WINDOW_MS), to };
  const [counts] = await getTopicSummaryCounts(
    projectId,
    [facet],
    embeddingConfig,
    timeRange,
  );
  if (!counts || counts.count < topicClusterSettings(false).minimumCount)
    return;
  let execution;
  try {
    execution = await createTopicExecution(
      {
        projectId,
        requestId,
        operation: "update",
        facets: [facet],
        embeddingConfig,
        timeRange,
        exploratory: false,
      },
      requestId,
      TOPICS_SYSTEM_USER_ID,
    );
  } catch (error) {
    // A concurrent job created it first with its own time range.
    if (error instanceof InvalidRequestError) return;
    throw error;
  }
  await enqueueTopicExecution(projectId, execution.id);
  recordIncrement("langfuse.topics.automatic_discoveries", 1);
  logger.info("Started automatic Topics discovery", {
    projectId,
    facetId: facet.facetId,
    facetVersion: facet.version,
  });
}
