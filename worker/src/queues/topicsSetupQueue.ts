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
import { runTopicCostEstimate } from "../features/topics/costEstimate";
import { withTopicsOrg } from "../features/topics/orgContext";

/** The job is only the clock; the rule's setup record, the snapshot's execution, or the estimate record holds the state. */
export const topicsSetupQueueProcessor: Processor<
  TQueueJobTypes[QueueName.TopicsSetup]
> = async (job, token) => {
  const { payload } = job.data;
  // Cost estimates run once; they never reschedule.
  if ("estimateKey" in payload) {
    await withTopicsOrg(payload.projectId, () =>
      runTopicCostEstimate(payload.projectId, payload.estimateKey, job.data.id),
    );
    return;
  }
  const active = await withTopicsOrg(payload.projectId, () =>
    "executionId" in payload
      ? tickTopicSnapshotSetup(payload.projectId, payload.executionId)
      : tickTopicRuleSetup(payload.projectId, payload.ruleId),
  );
  if (!active) return;
  await job.moveToDelayed(Date.now() + TOPIC_RULE_SETUP_TICK_MS, token);
  throw new DelayedError();
};
