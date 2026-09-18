import { DelayedError, type Processor } from "bullmq";
import {
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { getTopicEmbeddingBatchState } from "@langfuse/shared/topics/server";
import { processTopicsExecution } from "../features/topics/processTopicsExecution";

export const topicsQueueProcessor: Processor<
  TQueueJobTypes[QueueName.Topics]
> = async (job) => {
  if (job.name !== QueueJobs.Topics) return;
  const delay = async () => {
    await job.moveToDelayed(Date.now() + 5000, job.token);
    throw new DelayedError();
  };
  const pending = job.data.pendingEmbeddingBatchIds ?? [];
  if (pending.length) {
    const states = await Promise.all(
      pending.map(async (batchId) => ({
        batchId,
        state: await getTopicEmbeddingBatchState(job.data.payload, batchId),
      })),
    );
    // Failed or evicted jobs need the coordinator's persisted cohort to recover.
    if (
      !states.some(({ state }) => state === "failed" || state === "missing")
    ) {
      const remaining = states
        .filter(({ state }) => state === "pending")
        .map(({ batchId }) => batchId);
      if (remaining.length !== pending.length)
        await job.updateData({
          ...job.data,
          pendingEmbeddingBatchIds: remaining,
        });
      if (remaining.length) return delay();
    }
  }
  const waiting = await processTopicsExecution(job.data.payload);
  if (waiting) {
    await job.updateData({
      ...job.data,
      pendingEmbeddingBatchIds: waiting.pendingEmbeddingBatchIds,
    });
    return delay();
  }
};
