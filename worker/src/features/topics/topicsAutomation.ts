import type { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import {
  getTopicProcessingMapIds,
  getTopicRun,
  listTopicSummaries,
  readTopicAssignments,
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
