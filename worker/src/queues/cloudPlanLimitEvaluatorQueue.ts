import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleCloudPlanLimitEvaluatorJob } from "../ee/cloudPlanLimitEvaluator/handleCloudPlanLimitEvaluatorJob";

export const cloudPlanLimitEvaluatorQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.CloudPlanLimitEvaluatorJob) {
    logger.info("Executing Cloud Plan Limit Evaluator Job", job.data);
    try {
      return await handleCloudPlanLimitEvaluatorJob(job);
    } catch (error) {
      logger.error("Error executing Cloud Plan Limit Evaluator Job", error);
      throw error;
    }
  }
};
