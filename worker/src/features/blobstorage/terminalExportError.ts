// Terminal failure handling for a blob export run: persists the error, disables
// the integration on customer faults, and sends the failure notification.

import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  recordIncrement,
  dispatchProjectNotification,
} from "@langfuse/shared/src/server";
import {
  BLOB_INTEGRATION_DISABLED_METRIC,
  type CustomerFaultReason,
} from "./isCustomerFaultError";
import { setLastError } from "./planDisable";
import { isRecordNotFoundError } from "../integrations/prismaErrors";
import { env } from "../../env";

// What the terminal bookkeeping for a failed run did. Each case is a situation
// some earlier revision guarded against, named so the notification decision can
// switch over them instead of recombining flags.
type TerminalExportErrorOutcome =
  | { kind: "integration-deleted" } // deleted mid-run: job is obsolete
  | { kind: "persist-failed" } // write failed, so the row's state is unknown
  // No disable attempted: not a customer fault, or retries remain. stillEnabled
  // false means a concurrent disable or user toggle landed mid-run.
  | { kind: "error-recorded"; stillEnabled: boolean }
  | { kind: "disabled-by-us" }
  | { kind: "lost-disable-race" };

// Persists the failure and, when asked, makes the atomic enabled true→false
// claim. That claim is what keeps the terminal email exactly-once across runs
// racing the same fault (distinct jobIds, so not queue-deduped) and stops it
// claiming a state we failed to write.
export async function recordTerminalExportError({
  projectId,
  errorMessage,
  disableReason,
}: {
  projectId: string;
  errorMessage: string;
  disableReason: CustomerFaultReason | undefined;
}): Promise<TerminalExportErrorOutcome> {
  try {
    const updated = await prisma.blobStorageIntegration.update({
      where: { projectId },
      data: { runStartedAt: null },
    });
    await setLastError(projectId, errorMessage);

    if (disableReason === undefined) {
      return { kind: "error-recorded", stillEnabled: updated.enabled };
    }

    const { count } = await prisma.blobStorageIntegration.updateMany({
      where: { projectId, enabled: true },
      data: { enabled: false },
    });
    if (count !== 1) return { kind: "lost-disable-race" };

    // Tag by reason so SSRF/abuse disables (ssrf_blocked_endpoint) can be
    // separated from customer misconfig, and a mass-disable regression is
    // visible as a spike in the non-SSRF buckets after rollout.
    recordIncrement(BLOB_INTEGRATION_DISABLED_METRIC, 1, {
      reason: disableReason,
    });
    logger.warn(
      `[BLOB INTEGRATION] Disabled blob storage integration for project ${projectId} after a customer fault (reason=${disableReason}): ${errorMessage}`,
      { blobStorageDisableReason: disableReason, projectId },
    );
    return { kind: "disabled-by-us" };
  } catch (persistError) {
    if (isRecordNotFoundError(persistError)) {
      logger.info(
        `[BLOB INTEGRATION] Blob storage integration for project ${projectId} was deleted mid-run; dropping obsolete job after error: ${errorMessage}`,
      );
      return { kind: "integration-deleted" };
    }
    logger.error(
      `[BLOB INTEGRATION] Failed to persist blob storage error for project ${projectId}`,
      persistError,
    );
    return { kind: "persist-failed" };
  }
}

// Logs and swallows every failure: notification trouble must not turn a
// deliberate resolve back into a job failure. Delivery is therefore best-effort
// even on the awaited path; the persisted lastError is the durable signal.
export async function notifyBlobStorageExportFailed(
  projectId: string,
  {
    disabledMessage,
    bypassCooldown = disabledMessage !== undefined,
  }: {
    // Set when the integration was disabled: says why and how to restore it.
    disabledMessage?: (projectName: string) => string;
    bypassCooldown?: boolean;
  } = {},
): Promise<void> {
  const disabled = disabledMessage !== undefined;
  try {
    // Called once per exhausted run. The cooldown gates across scheduled
    // runs (the scheduler re-enqueues every frequency period, and each
    // failing run would otherwise email again). The disable notice bypasses
    // it: that is a one-shot terminal event and a cooldown claim could
    // silently drop the single email saying the integration was turned off.
    // Recurring failures stay gated so they alert once per window, not per run.
    if (!bypassCooldown) {
      const cooldownMs =
        env.LANGFUSE_BLOB_STORAGE_FAILURE_NOTIFICATION_COOLDOWN_HOURS *
        60 *
        60 *
        1000;

      // Atomic claim: set timestamp before sending to prevent duplicate emails on concurrent retries.
      // If the email send subsequently fails, the cooldown still applies — the next failure
      // after cooldown expiry will retry the notification.
      const claimed = await prisma.blobStorageIntegration.updateMany({
        where: {
          projectId,
          OR: [
            { lastFailureNotificationSentAt: null },
            {
              lastFailureNotificationSentAt: {
                lt: new Date(Date.now() - cooldownMs),
              },
            },
          ],
        },
        data: { lastFailureNotificationSentAt: new Date() },
      });

      if (claimed.count === 0) {
        logger.info(
          `[BLOB INTEGRATION] Skipping failure notification for project ${projectId}, cooldown still active`,
        );
        return;
      }
    }

    const [project, integration] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      }),
      prisma.blobStorageIntegration.findUnique({
        where: { projectId },
        select: { bucketName: true },
      }),
    ]);
    const projectName = project?.name ?? projectId;
    const settingsPath = `/project/${projectId}/settings/integrations/blobstorage`;

    // Route to configured notification channels and admin emails. The
    // cooldown claim above already deduped, so no extra throttle is needed.
    // `disabled` marks the terminal "export turned off" notification, which
    // selects the disabled email/subject variant downstream.
    await dispatchProjectNotification({
      projectId,
      event: {
        eventType: "blob-export-failed",
        severity: "ALERT",
        projectId,
        projectName,
        // The integration is keyed by projectId (1:1); the bucket name is
        // the most useful human label for the failing export destination.
        resourceId: projectId,
        resourceName: integration?.bucketName ?? "Blob storage integration",
        message: disabledMessage
          ? disabledMessage(projectName)
          : `Blob storage export failed for project "${projectName}".`,
        url: env.NEXTAUTH_URL
          ? `${env.NEXTAUTH_URL}${settingsPath}`
          : undefined,
        disabled,
      },
    });
  } catch (error) {
    logger.error(
      `[BLOB INTEGRATION] Failed to send failure notification for project ${projectId}`,
      error,
    );
  }
}

export function extractStorageErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 1000);

  // handleStorageError wraps SDK errors via { cause: sdkError }
  // Unwrap to get the raw SDK message (S3/Azure/GCS)
  const cause = error.cause;
  const message = cause instanceof Error ? cause.message : error.message;

  // GCS returns a <Details> XML element with the real rejection reason
  // (e.g. "Multipart upload is not supported in Rapid storage class.").
  // handleStorageError preserves it as an enumerable property.
  const errorDetails = (error as unknown as { Details?: unknown }).Details;
  const causeDetails = (cause as unknown as { Details?: unknown } | undefined)
    ?.Details;
  const details = (() => {
    if (typeof errorDetails === "string") {
      return errorDetails;
    }
    if (typeof causeDetails === "string") {
      return causeDetails;
    }
    return undefined;
  })();

  const full = details ? `${message} Details: ${details}` : message;
  return full.slice(0, 1000);
}
