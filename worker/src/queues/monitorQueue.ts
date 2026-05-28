import { Processor } from "bullmq";
import { v4 } from "uuid";
import {
  instrumentAsync,
  QueueJobs,
  QueueName,
  WebhookQueue,
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
      const webhookQueue = WebhookQueue.getInstance();
      if (!webhookQueue) {
        throw new Error(
          "monitorQueueProcessor: WebhookQueue is unavailable; cannot publish monitor alerts",
        );
      }
      const processor = new MonitorProcessor({
        db: prisma,
        publish: async (input) => {
          await webhookQueue.add(QueueName.WebhookQueue, {
            timestamp: new Date(),
            id: v4(),
            payload: input,
            name: QueueJobs.WebhookJob,
          });
        },
      });
      await processor.process(job.data.payload, new Date());
    },
  );
};
