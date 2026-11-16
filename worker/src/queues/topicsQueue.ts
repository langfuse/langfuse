import { UnrecoverableError, type Processor } from "bullmq";
import {
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
import {
  processTopicRuleRefit,
  processTopicUpdateExecution,
} from "../features/topics/processTopicsExecution";

/** Snapshot fits and rule refits share the update queue and its concurrency. */
export const topicsUpdateQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsUpdate]
> = async (job) => {
  const { data } = job;
  if (!isTopicsProjectEnabled(data.payload.projectId))
    throw new UnrecoverableError(
      "Topics processing is not enabled for this project.",
    );
  switch (data.name) {
    case QueueJobs.Topics:
      return processTopicUpdateExecution(data.payload);
    case QueueJobs.TopicsRuleRefit:
      return processTopicRuleRefit(data.payload);
  }
};
