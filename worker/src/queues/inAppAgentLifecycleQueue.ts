import { Processor } from "bullmq";
import { SpanKind } from "@opentelemetry/api";

import {
  instrumentAsync,
  logger,
  QueueJobs,
} from "@langfuse/shared/src/server";

import {
  runInAppAgentCredentialMaintenance,
  runInAppAgentLifecycleRecovery,
} from "../features/in-app-agent/lifecycleSweeps";
import { RedisLock } from "../utils/RedisLock";

/**
 * BullMQ gives one delivery per interval, not one execution at a time. It
 * produces the next scheduled job when the current one is picked up for
 * processing, so a tick that outruns its interval overlaps with the next tick
 * on another worker. Every operation in the sweeps is a guarded CAS and would
 * survive that, but the overlap only ever happens when a tick is slow, which is
 * exactly when duplicating its scans is worst. The lease makes it impossible.
 *
 * `fail` rather than `proceed` on an unavailable Redis: without the lease we
 * would rather skip a tick than fan the sweep out across every worker.
 */
const withSweepLease = <T>(
  name: string,
  ttlSeconds: number,
  sweep: () => Promise<T>,
) =>
  new RedisLock(`langfuse:in-app-agent-lifecycle:${name}`, {
    name,
    ttlSeconds,
    onUnavailable: "fail",
  }).withLock(sweep);

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
          await withSweepLease("recovery", 60, runInAppAgentLifecycleRecovery);
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
          await withSweepLease(
            "credentials",
            300,
            runInAppAgentCredentialMaintenance,
          );
        } catch (error) {
          logger.error("In-app agent credential maintenance failed", error);
          throw error;
        }
      },
    );
  }
};
