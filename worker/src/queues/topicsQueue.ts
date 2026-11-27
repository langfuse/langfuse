import type { Processor } from "bullmq";
import {
  QueueJobs,
  QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  processTopicRuleRefit,
  processTopicUpdateExecution,
} from "../features/topics/processTopicsExecution";
import { withTopicsOrg } from "../features/topics/orgContext";

/** Snapshot fits and rule refits share the update queue and its concurrency. */
export const topicsUpdateQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsUpdate]
> = async (job) => {
  const { data } = job;
  return withTopicsOrg(data.payload.projectId, async () => {
    switch (data.name) {
      case QueueJobs.Topics:
        return processTopicUpdateExecution(data.payload);
      case QueueJobs.TopicsRuleRefit:
        return processTopicRuleRefit(data.payload);
    }
  });
};
