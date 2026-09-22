import { DelayedError, UnrecoverableError, type Processor } from "bullmq";
import {
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  getTopicEmbeddingBatchState,
  isTopicsProjectEnabled,
  recordTopicProcessBatchProgress,
} from "@langfuse/shared/topics/server";
import type { TopicProcessBatchState } from "@langfuse/shared/topics";
import { processTopicsExecution } from "../features/topics/processTopicsExecution";

export const topicsQueueProcessor: Processor<
  TQueueJobTypes[QueueName.Topics]
> = async (job) => {
  if (job.name !== QueueJobs.Topics) return;
  if (!isTopicsProjectEnabled(job.data.payload.projectId))
    throw new UnrecoverableError(
      "Topics processing is not enabled for this project.",
    );
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
    // Accepted references remain in the processing job when an embedding job fails.
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
  let batchState = job.data.batchState;
  let lastProgress = batchState
    ? `${batchState.execution.status}:${batchState.execution.phase}`
    : null;
  let waiting;
  try {
    waiting = await processTopicsExecution({
      ...job.data.payload,
      batchState,
      saveBatchState: async (state: TopicProcessBatchState) => {
        await job.updateData({ ...job.data, batchState: state });
        batchState = state;
        const progress = `${state.execution.status}:${state.execution.phase}`;
        if (
          progress !== lastProgress &&
          job.data.payload.batchId !== undefined
        ) {
          await recordTopicProcessBatchProgress(
            job.data.payload.batchId,
            state,
          );
          lastProgress = progress;
        }
      },
    });
  } finally {
    if (batchState && job.data.payload.batchId !== undefined)
      await recordTopicProcessBatchProgress(
        job.data.payload.batchId,
        batchState,
      );
  }
  if (
    batchState &&
    (batchState.execution.status === "failed" ||
      batchState.execution.facets.some((facet) => facet.outcome === "failed"))
  )
    throw new Error(
      batchState.execution.error ??
        "Topics batch failed. Resume to retry unfinished work.",
    );
  if (waiting) {
    await job.updateData({
      ...job.data,
      pendingEmbeddingBatchIds: waiting.pendingEmbeddingBatchIds,
    });
    return delay();
  }
};
