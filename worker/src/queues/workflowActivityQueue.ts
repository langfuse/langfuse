import { Processor } from "bullmq";
import { logger } from "@langfuse/shared/src/server";
import { WorkflowEngine } from "../features/workflows/engine";

export const workflowActivityQueueProcessor: Processor = async (job) => {
  try {
    logger.info("Executing Workflow Activity Job");
    const workflowEngine = new WorkflowEngine(job.data.projectId);
    return await workflowEngine.executeActivity(job.data.activityId);
  } catch (error) {
    logger.error("Error executing Workflow Activity Job", error);
    throw error;
  }
};
