import { createHash } from "node:crypto";
import {
  QueueJobs,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  getTopicProcessingMapIds,
  getTopicRun,
  listTopicSummaries,
  readTopicAssignments,
  TOPICS_TRACE_BATCH_SIZE,
  TopicsAutomationQueue,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import type {
  TopicFacetRef,
  TopicRun,
  TopicSummary,
} from "@langfuse/shared/topics";
import { topicAssignmentRows } from "./assignments";
import { TopicMetrics } from "./metrics";

type AutomationBatch = TQueueJobTypes[QueueName.TopicsAutomation]["payload"];

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
 * skipping ones already assigned. A facet without a map waits for the nightly refit.
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
    if (run?.status !== "completed") continue;
    const summaries = await currentSummaries(batch, facet);
    if (summaries.length > 0) await assign(batch, facet, summaries, run);
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
