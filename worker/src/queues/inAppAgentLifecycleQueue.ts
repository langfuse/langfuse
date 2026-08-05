import { Processor } from "bullmq";
import { SpanKind } from "@opentelemetry/api";

import {
  instrumentAsync,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";

import { runInAppAgentCredentialMaintenance } from "../features/in-app-agent/credentialMaintenance";
import { runInAppAgentLifecycleRecovery } from "../features/in-app-agent/lifecycleRecovery";

export const inAppAgentLifecycleQueueProcessor: Processor = async (job) => {
  if (job.name === QueueJobs.InAppAgentLifecycleRecoveryJob) {
    return instrumentAsync(
      {
        name: "in-app-agent-lifecycle-recovery",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        try {
          await runInAppAgentLifecycleRecovery();
        } catch (error) {
          logger.error("In-app agent lifecycle recovery sweep failed", error);
          throw error;
        }
      },
    );
  }

  if (job.name === QueueJobs.InAppAgentCredentialMaintenanceJob) {
    return instrumentAsync(
      {
        name: "in-app-agent-credential-maintenance",
        startNewTrace: true,
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        try {
          await runInAppAgentCredentialMaintenance();
        } catch (error) {
          logger.error("In-app agent credential maintenance failed", error);
          throw error;
        }
      },
    );
  }
};
