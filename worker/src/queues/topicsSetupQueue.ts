import { DelayedError, type Processor } from "bullmq";
import {
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
import {
  TOPIC_RULE_SETUP_TICK_MS,
  tickTopicRuleSetup,
} from "../features/topics/ruleSetup";

/** The job is only the clock; the setup record in Redis holds the state. */
export const topicsSetupQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsSetup]
> = async (job, token) => {
  const { projectId, ruleId } = job.data.payload;
  if (!isTopicsProjectEnabled(projectId)) return;
  if (!(await tickTopicRuleSetup(projectId, ruleId))) return;
  await job.moveToDelayed(Date.now() + TOPIC_RULE_SETUP_TICK_MS, token);
  throw new DelayedError();
};
