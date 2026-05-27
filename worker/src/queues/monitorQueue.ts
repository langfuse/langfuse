import { Processor } from "bullmq";
import {
  instrumentAsync,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { MonitorProcessor } from "@langfuse/shared/monitors/server";
import { prisma } from "@langfuse/shared/src/db";
import { SpanKind } from "@opentelemetry/api";

export const monitorQueueProcessor: Processor = async (job) => {
  if (job.name !== QueueJobs.MonitorJob) return;
  return await instrumentAsync(
    {
      name: "process monitor",
      startNewTrace: true,
      spanKind: SpanKind.CONSUMER,
    },
    async () => {
      const processor = new MonitorProcessor({
        db: prisma,
        // TODO(LFE-9817): publish into WebhookQueue; for now just log.
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
