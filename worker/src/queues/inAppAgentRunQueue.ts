import { Processor } from "bullmq";
import {
  instrumentAsync,
  InAppAgentRunQueueEventSchema,
  QueueJobs,
} from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

import { executeInAppAgentRun } from "../features/in-app-agent/executeInAppAgentRun";

export const inAppAgentRunQueueProcessor: Processor = async (job) => {
  if (job.name !== QueueJobs.InAppAgentRunJob) return;
  return await instrumentAsync(
    {
      name: "process in-app-agent run",
      startNewTrace: true,
      spanKind: SpanKind.CONSUMER,
    },
    async () => {
      const payload = InAppAgentRunQueueEventSchema.parse(job.data.payload);
      await executeInAppAgentRun(payload);
    },
  );
};
