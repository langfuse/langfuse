import { DelayedError, type Processor } from "bullmq";
import {
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import {
  TOPIC_RULE_SETUP_TICK_MS,
  tickTopicRuleSetup,
} from "../features/topics/ruleSetup";
import { tickTopicSnapshotSetup } from "../features/topics/snapshotSetup";

/** The job is only the clock; the rule's setup record or the snapshot's execution holds the state. */
export const topicsSetupQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsSetup]
> = async (job, token) => {
  const { payload } = job.data;
  const active =
    "executionId" in payload
      ? await tickTopicSnapshotSetup(payload.projectId, payload.executionId)
      : await tickTopicRuleSetup(payload.projectId, payload.ruleId);
  if (!active) return;
  await job.moveToDelayed(Date.now() + TOPIC_RULE_SETUP_TICK_MS, token);
  throw new DelayedError();
};
