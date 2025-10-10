import { Processor } from "bullmq";
import { logger, QueueJobs } from "@langfuse/shared/src/server";
import { handleEventPropagationJob } from "../features/eventPropagation/handleEventPropagationJob";

export const eventPropagationProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.EventPropagationJob) {
    logger.info("Executing Event Propagation Job");
    try {
      return await handleEventPropagationJob(job);
    } catch (error) {
      logger.error("Error executing EventPropagationJob", error);
      throw error;
    }
  }
};
