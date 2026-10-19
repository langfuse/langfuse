import { createHash } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import { InvalidRequestError } from "@langfuse/shared";
import {
  logger,
  QueueJobs,
  recordIncrement,
  redis,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getTopicProcessingMapIds,
  getTopicRun,
  getTopicClusteringSummaryStats,
  getEnabledTopicsModels,
  listTopicSummaries,
  readTopicAssignments,
  readTopicExecutionForRequest,
  TOPICS_SYSTEM_USER_ID,
  TOPICS_TRACE_BATCH_SIZE,
  TOPIC_CLUSTERING_CAPACITY_ERROR,
  TopicsAutomationQueue,
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
import { env } from "../../env";

type AutomationBatch = TQueueJobTypes[QueueName.TopicsAutomation]["payload"];

const DISCOVERY_WINDOW_MS = 7 * 24 * 60 * 60_000;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Queues assignment for the complete summaries a trace batch stored, one job per project,
 * vector space and 100 traces. Job IDs repeat for a retried batch, so it queues nothing twice.
 */
export async function enqueueTopicsAutomation(
  batchId: string,
  rows: TopicSummary[],
): Promise<void> {
  const queue = TopicsAutomationQueue.getInstance();
  if (!queue) return;
  for (const batch of groupStoredSummaries(rows).flatMap(splitTraces)) {
    // Facets belong in the ID: a retry can store a facet the first attempt failed.
    const id = hash([
      batchId,
      batch.projectId,
      batch.embeddingConfig,
      batch.facets,
      batch.traceIds,
    ]);
    await queue.add(
      QueueJobs.TopicsAutomation,
      {
        id,
        timestamp: new Date(),
        name: QueueJobs.TopicsAutomation,
        payload: batch,
      },
      { jobId: id },
    );
  }
}

/**
 * Assigns the batch's current complete summaries to each facet's compatible serving map,
 * skipping ones already assigned, or starts the facet's first discovery once enough exist.
 */
export async function processTopicsAutomation(
  batch: AutomationBatch,
): Promise<void> {
  const { projectId, embeddingConfig } = batch;
  for (const facet of batch.facets) {
    const [map] = await getTopicProcessingMapIds(
      projectId,
      [facet],
      embeddingConfig,
    );
    const run = map?.runId ? await getTopicRun(projectId, map.runId) : null;
    if (run?.status === "completed") {
      const summaries = await currentSummaries(batch, facet);
      if (summaries.length) await assign(batch, facet, summaries, run);
    } else await startDiscovery(batch, facet);
  }
}

/** One batch per project and vector space, spanning its summaries' unit start times. */
function groupStoredSummaries(rows: TopicSummary[]): AutomationBatch[] {
  const groups = new Map<string, AutomationBatch>();
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
      traceIds: [],
      facets: [],
    };
    if (start < group.timeRange.from) group.timeRange.from = start;
    if (end > group.timeRange.to) group.timeRange.to = end;
    if (!group.traceIds.includes(row.traceId)) group.traceIds.push(row.traceId);
    if (
      !group.facets.some(
        (facet) =>
          facet.facetId === row.facetId && facet.version === row.facetVersion,
      )
    )
      group.facets.push({ facetId: row.facetId, version: row.facetVersion });
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    facets: group.facets.sort(
      (a, b) => a.facetId.localeCompare(b.facetId) || a.version - b.version,
    ),
  }));
}

function splitTraces(batch: AutomationBatch): AutomationBatch[] {
  const batches: AutomationBatch[] = [];
  for (
    let index = 0;
    index < batch.traceIds.length;
    index += TOPICS_TRACE_BATCH_SIZE
  )
    batches.push({
      ...batch,
      traceIds: batch.traceIds.slice(index, index + TOPICS_TRACE_BATCH_SIZE),
    });
  return batches;
}

async function currentSummaries(batch: AutomationBatch, facet: TopicFacetRef) {
  const { embeddingConfig } = batch;
  const rows = await listTopicSummaries(
    batch.projectId,
    {
      traceIds: batch.traceIds,
      facetId: facet.facetId,
      facetVersion: facet.version,
    },
    batch.timeRange,
  );
  return rows.filter(
    (row) =>
      row.state === "complete" &&
      row.traceId !== null &&
      row.embeddingModel === embeddingConfig.embeddingModel &&
      row.embedding.length === embeddingConfig.embeddingDimensions,
  );
}

async function assign(
  batch: AutomationBatch,
  facet: TopicFacetRef,
  summaries: TopicSummary[],
  run: TopicRun,
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
          batch.timeRange,
        )
      ).map((row) => JSON.stringify([row.traceId, row.summaryProcessedAt])),
    );
    const pending = summaries.filter(
      (row) => !assigned.has(JSON.stringify([row.traceId, row.processedAt])),
    );
    if (pending.length === 0) return;
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

/** Discovery and its single capacity recovery use deterministic requests. */
async function startDiscovery(batch: AutomationBatch, facet: TopicFacetRef) {
  const { projectId, embeddingConfig } = batch;
  if (!(await usesCurrentEmbedding(projectId, embeddingConfig))) return;
  let requestId = hash(["topics-discovery", facet, embeddingConfig]);
  let existing = await readTopicExecutionForRequest(
    projectId,
    requestId,
    requestId,
  );
  const capacityFailure =
    existing && ["failed", "completed_with_errors"].includes(existing.status)
      ? existing.facets.find(
          (progress) =>
            progress.facetId === facet.facetId &&
            progress.facetVersion === facet.version &&
            progress.outcome === "failed" &&
            progress.error === TOPIC_CLUSTERING_CAPACITY_ERROR,
        )
      : undefined;
  if (capacityFailure) {
    // Admission can fail before a precreated run enters the fitting lifecycle.
    if (capacityFailure.runId)
      await prisma.topicClusteringRun.updateMany({
        where: {
          projectId,
          id: capacityFailure.runId,
          facetId: facet.facetId,
          facetVersion: facet.version,
          status: "pending",
        },
        data: {
          status: "failed",
          error: TOPIC_CLUSTERING_CAPACITY_ERROR,
          finishedAt: new Date(),
        },
      });
    requestId = hash([requestId, "bounded-window-v1"]);
    existing = await readTopicExecutionForRequest(
      projectId,
      requestId,
      requestId,
    );
  }
  // Checked before the fit guard, which this execution's own pending run would trip.
  if (existing) {
    // Like the web trigger: a queued execution may have lost its job; failed ones resume from History.
    if (existing.status === "queued")
      await enqueueTopicExecution(projectId, existing.id);
    return;
  }
  if (await hasMapOrFit(projectId, facet)) return;
  // Bound concurrent searches and repeated probes when no admissible window exists.
  const gateKey = `langfuse:topics:discovery:${projectId}:${requestId}`;
  if (redis && (await redis.set(gateKey, "1", "EX", 60, "NX")) !== "OK") {
    const queue = TopicsAutomationQueue.getInstance();
    if (!queue)
      throw new Error("Topics discovery requires its automation queue.");
    const timestamp = new Date();
    const delay = 60_000;
    // One deferred check per minute; its ID differs from the currently active check.
    const id = hash([
      projectId,
      requestId,
      Math.floor((timestamp.getTime() + delay) / delay),
    ]);
    await queue.add(
      QueueJobs.TopicsAutomation,
      {
        id,
        timestamp,
        name: QueueJobs.TopicsAutomation,
        payload: { ...batch, facets: [facet] },
      },
      { jobId: id, delay },
    );
    return;
  }
  const timeRange = await selectDiscoveryWindow(
    projectId,
    facet,
    embeddingConfig,
  ).catch(async (error: unknown) => {
    await redis?.del(gateKey);
    throw error;
  });
  if (!timeRange) return;
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

/** Keep a complete recent cohort; only aggregate counts and byte estimates are loaded. */
async function selectDiscoveryWindow(
  projectId: string,
  facet: TopicFacetRef,
  embeddingConfig: TopicEmbeddingConfig,
): Promise<TopicTimeRange | null> {
  const to = new Date();
  let earliest = to.getTime() - DISCOVERY_WINDOW_MS;
  let latest = to.getTime();
  const minimumCount = topicClusterSettings(false).minimumCount;
  // A seven-day range has fewer than 2^30 millisecond boundaries.
  for (let check = 0; check < 32 && earliest < latest; check++) {
    const from = check === 0 ? earliest : Math.floor((earliest + latest) / 2);
    const timeRange = { from: new Date(from), to };
    const { count, bytes } = await getTopicClusteringSummaryStats(
      projectId,
      facet.facetId,
      facet.version,
      embeddingConfig,
      timeRange,
      {
        maxRows: env.LANGFUSE_TOPICS_MAX_CLUSTERING_ROWS,
        maxBytes: env.LANGFUSE_TOPICS_MAX_CLUSTERING_BYTES,
      },
    );
    if (count < minimumCount) {
      if (check === 0) return null;
      latest = from;
    } else if (
      count > env.LANGFUSE_TOPICS_MAX_CLUSTERING_ROWS ||
      bytes > env.LANGFUSE_TOPICS_MAX_CLUSTERING_BYTES
    ) {
      earliest = from + 1;
    } else {
      return timeRange;
    }
  }
  return null;
}

/** Automatic processing is on with the embedding model these summaries used. */
async function usesCurrentEmbedding(
  projectId: string,
  embeddingConfig: TopicEmbeddingConfig,
) {
  const models = (await getEnabledTopicsModels([projectId])).get(projectId);
  return (
    models !== undefined &&
    models.embedding.model === embeddingConfig.embeddingModel &&
    models.embedding.dimensions === embeddingConfig.embeddingDimensions
  );
}

/** A map or fit, finished or in progress, exists for this or a newer facet version. */
async function hasMapOrFit(projectId: string, facet: TopicFacetRef) {
  const run = await prisma.topicClusteringRun.findFirst({
    where: {
      projectId,
      facetId: facet.facetId,
      facetVersion: { gte: facet.version },
      status: { in: ["pending", "running", "completed"] },
    },
    select: { id: true },
  });
  return run !== null;
}
