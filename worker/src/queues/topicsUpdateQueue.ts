import {
  type Job,
  type Processor,
  DelayedError,
  UnrecoverableError,
} from "bullmq";
import {
  QueueJobs,
  QueueName,
  TopicAutomaticPayloadSchema,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  isTopicsProjectEnabled,
  registerTopicExecutionQueueJob,
  AutomaticTopicsQueue,
} from "@langfuse/shared/topics/server";
import { processAutomaticTopics } from "../features/topics/processAutomaticTopics";
import { topicsQueueProcessor } from "./topicsQueue";

export const topicsUpdateQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsUpdate]
> = async (job, token) => {
  if (job.data.name !== QueueJobs.TopicsAutomatic)
    return topicsQueueProcessor(
      job as Job<TQueueJobTypes[QueueName.Topics]>,
      token,
    );
  const data = job.data;
  const payload = TopicAutomaticPayloadSchema.parse(data.payload);
  if (!isTopicsProjectEnabled(payload.projectId))
    throw new UnrecoverableError(
      "Topics processing is not enabled for this project.",
    );
  if (payload.executionId) {
    if (!job.id) throw new Error("Topics discovery requires a queue job ID.");
    const queue = AutomaticTopicsQueue.getInstance();
    if (!queue || !job.deduplicationId)
      throw new Error("Topics discovery requires its queue ownership key.");
    const client = await queue.client;
    // BullMQ retry preserves the job but does not restore its deduplication key.
    const claimed = await client.set(
      queue.toKey(`de:${job.deduplicationId}`),
      job.id,
      "NX",
    );
    if (
      claimed !== "OK" &&
      (await queue.getDeduplicationJobId(job.deduplicationId)) !== job.id
    ) {
      await job.moveToDelayed(Date.now() + 5000, token ?? job.token);
      throw new DelayedError();
    }
    await registerTopicExecutionQueueJob(
      payload.projectId,
      payload.executionId,
      job.id,
    );
  }
  await processAutomaticTopics({ ...data, payload }, async (updateInput) => {
    await job.updateData({ ...data, updateInput });
  });
};
