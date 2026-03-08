import { Processor } from "bullmq";
import {
  MetricAlertQueue,
  QueueJobs,
  logger,
} from "@langfuse/shared/src/server";
import { evaluateAllMetricTriggers } from "../features/metricTriggers/metricTriggerEvaluator";

export const metricAlertQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.MetricAlertJob) {
    logger.info("[MetricAlertQueue] Executing metric alert evaluation job");
    await evaluateAllMetricTriggers();
  }
};

export { MetricAlertQueue };
