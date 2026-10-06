import { Job } from "bullmq";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { executeAutomationAction } from "../features/automations/executeAutomationAction";

export const automationExecutionQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.AutomationExecutionQueue]>,
) => {
  await executeAutomationAction(job.data.payload);
};
