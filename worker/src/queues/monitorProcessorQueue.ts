import { Processor } from "bullmq";
import {
  instrumentAsync,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { MonitorProcessor } from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import { SpanKind } from "@opentelemetry/api";

export const monitorProcessorQueueProcessor: Processor = async (job) => {
  if (job.name !== QueueJobs.MonitorProcessorJob) return;
  return await instrumentAsync(
    {
      name: "process monitor-processor",
      startNewTrace: true,
      spanKind: SpanKind.CONSUMER,
    },
    async () => {
      const processor = new MonitorProcessor({
        db: prisma,
        // TODO(LFE-9817): wire MonitorWebhookQueueEvent into WebhookQueue;
        // for now log the alert and rely on the lifecycle stamps for state.
        publish: async (event) => {
          logger.info("[MonitorProcessor] alert", {
            payload: event.payload,
          });
        },
      });
      await processor.process(job.data.payload, new Date());
    },
  );
};
