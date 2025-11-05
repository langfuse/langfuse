import { Processor } from "bullmq";
import {
  logger,
  QueueJobs,
  instrumentAsync,
} from "@langfuse/shared/src/server";
import { handleEventPropagationJob } from "../features/eventPropagation/handleEventPropagationJob";
import { runExperimentBackfill } from "../features/eventPropagation/handleExperimentBackfill";
import { SpanKind } from "@opentelemetry/api";

export const eventPropagationProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.EventPropagationJob) {
    return await instrumentAsync(
      {
        name: "process event-propagation",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        logger.info("Executing Event Propagation Job");
        try {
          // Step 1: Execute the main partition processing
          await handleEventPropagationJob(job);
          // Step 2: Execute experiment backfill with 5-minute throttle
          await runExperimentBackfill();
        } catch (error) {
          logger.error("Error executing EventPropagationJob", error);
          throw error;
        }
      },
    );
  }
};
