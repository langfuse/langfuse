import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  getTracesForAnalyticsIntegrations,
  getGenerationsForAnalyticsIntegrations,
  getScoresForAnalyticsIntegrations,
  getEventsForAnalyticsIntegrations,
  getCurrentSpan,
  validateWebhookURL,
  recordIncrement,
  dispatchProjectNotification,
  fetchWithSecureRedirects,
} from "@langfuse/shared/src/server";
import {
  buildAnalyticsRedirectOptions,
  hostnameForLog,
  rethrowIfOutboundValidationFailure,
} from "../analyticsIntegrationEgress";
import {
  transformTraceForPostHog,
  transformGenerationForPostHog,
  transformEventForPostHog,
  transformScoreForPostHog,
} from "./transformers";
import { decrypt } from "@langfuse/shared/encryption";
import { PostHog } from "posthog-node";
import { recordExportVolume } from "../../services/exportVolumeMetric";
import { assertExportSourceWritable } from "../exportWriteModeGuard";
import { classifyCustomerFault } from "../integrations/customerFaultClassification";
import { isRecordNotFoundError } from "../integrations/prismaErrors";
import { env, v4WritesToLegacyTables } from "../../env";

// Counter for PostHog integrations auto-disabled after a deterministic
// customer-config fault, tagged by `reason`. A classifier-regression
// mass-disable shows up as a spike in the non-SSRF buckets vs a near-zero
// baseline, separate from expected SSRF/abuse disables (mirrors blob's metric).
export const POSTHOG_INTEGRATION_DISABLED_METRIC =
  "langfuse.posthog.integration_disabled.count";

type PostHogExecutionConfig = {
  projectId: string;
  projectName: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  decryptedPostHogApiKey: string;
  postHogHost: string;
  // First attempt uses ClickHouse `auto` join algorithm. We only fall back to
  // `grace_hash` (slower, but spills to disk) on retries so an OOM on the first
  // attempt recovers without manual intervention while healthy syncs stay fast.
  useGraceHash: boolean;
  // Shared accumulator for gzipped on-wire upload volume, written by the
  // fetch wrapper and read once the run succeeds.
  volume: { bytes: number };
  // Last error emitted by the shared PostHog client. The SDK reports
  // asynchronous delivery failures through this handler.
  sendError?: Error;
};

const postHogSettings = {
  flushAt: 1_000,
  // Keep enough headroom for events captured while an SDK flush is in flight.
  // Older posthog-node releases defaulted this to 1,000 and silently evicted
  // the oldest events when Langfuse produced a burst.
  maxQueueSize: 10_000,
};

const sleep = (ms: number) =>
  ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

const throwIfPostHogSendError = (config: PostHogExecutionConfig) => {
  if (config.sendError) throw config.sendError;
};

const flushPostHog = async (
  posthog: PostHog,
  config: PostHogExecutionConfig,
) => {
  await posthog.flush();
  throwIfPostHogSendError(config);
  await sleep(env.LANGFUSE_POSTHOG_FLUSH_DELAY_MS);
};

type PostHogClientOptions = NonNullable<
  ConstructorParameters<typeof PostHog>[1]
>;

// Wrap the SDK's fetch transport to count gzipped on-wire upload volume for
// the export-volume metric. Capture V0 uses /batch/ and the opt-in Capture V1
// mode uses /i/v1/analytics/events; feature-flag requests are excluded.
export const countingFetch =
  (volume: { bytes: number }): PostHogClientOptions["fetch"] =>
  async (url, options) => {
    // Extend the existing V0 counter to cover the additional capture mode
    // supported by newer posthog-node releases.
    if (url.endsWith("/batch/") || url.endsWith("/i/v1/analytics/events")) {
      const body = options.body;
      if (typeof body === "string") {
        volume.bytes += Buffer.byteLength(body);
      } else if (body instanceof Blob) {
        volume.bytes += body.size;
      } else {
        // The SDK sends gzipped Blob bodies today; warn (rather than silently
        // counting 0) if a future SDK version uses another body type, so the
        // export-volume under-reporting is observable.
        logger.warn(
          `[POSTHOG] Unexpected capture body type "${typeof body}"; export volume under-reported`,
        );
      }
    }
    // Re-resolve and re-validate the destination IP at socket connect time: a
    // host that validated as public in the pre-check can rebind to a
    // private/loopback address before the socket opens (TOCTOU). Redirect
    // targets are re-validated with the same URL validator.
    const { response } = await fetchWithSecureRedirects(
      url,
      options as RequestInit,
      buildAnalyticsRedirectOptions("PostHog integration"),
    );
    return response;
  };

const processPostHogStream = async <T>(
  posthog: PostHog,
  config: PostHogExecutionConfig,
  stream: AsyncIterable<T>,
  streamName: "traces" | "generations" | "scores" | "events",
  transform: (value: T, projectId: string) => Parameters<PostHog["capture"]>[0],
) => {
  logger.info(
    `[POSTHOG] Sending ${streamName} for project ${config.projectId} to PostHog`,
  );

  let count = 0;
  for await (const value of stream) {
    throwIfPostHogSendError(config);
    count++;
    posthog.capture(transform(value, config.projectId));
    if (count % postHogSettings.flushAt === 0) {
      await flushPostHog(posthog, config);
      logger.info(
        `[POSTHOG] Sent ${count} ${streamName} to PostHog for project ${config.projectId}`,
      );
    }
  }
  if (count % postHogSettings.flushAt !== 0) {
    await flushPostHog(posthog, config);
  }
  logger.info(
    `[POSTHOG] Sent ${count} ${streamName} to PostHog for project ${config.projectId}`,
  );
};

const processPostHogTraces = async (
  posthog: PostHog,
  config: PostHogExecutionConfig,
) => {
  const traces = getTracesForAnalyticsIntegrations(
    config.projectId,
    config.projectName,
    config.minTimestamp,
    config.maxTimestamp,
    { useGraceHash: config.useGraceHash },
  );

  await processPostHogStream(
    posthog,
    config,
    traces,
    "traces",
    transformTraceForPostHog,
  );
};

const processPostHogGenerations = async (
  posthog: PostHog,
  config: PostHogExecutionConfig,
) => {
  const generations = getGenerationsForAnalyticsIntegrations(
    config.projectId,
    config.projectName,
    config.minTimestamp,
    config.maxTimestamp,
    { useGraceHash: config.useGraceHash },
  );

  await processPostHogStream(
    posthog,
    config,
    generations,
    "generations",
    transformGenerationForPostHog,
  );
};

const processPostHogScores = async (
  posthog: PostHog,
  config: PostHogExecutionConfig,
) => {
  const scores = getScoresForAnalyticsIntegrations(
    config.projectId,
    config.projectName,
    config.minTimestamp,
    config.maxTimestamp,
    {
      useGraceHash: config.useGraceHash,
      // events_only no longer writes the traces table (LFE-11009)
      traceAttributesSource: v4WritesToLegacyTables(env) ? "traces" : "events",
    },
  );

  await processPostHogStream(
    posthog,
    config,
    scores,
    "scores",
    transformScoreForPostHog,
  );
};

const processPostHogEvents = async (
  posthog: PostHog,
  config: PostHogExecutionConfig,
) => {
  const events = getEventsForAnalyticsIntegrations(
    config.projectId,
    config.projectName,
    config.minTimestamp,
    config.maxTimestamp,
  );

  await processPostHogStream(
    posthog,
    config,
    events,
    "events",
    transformEventForPostHog,
  );
};

export const handlePostHogIntegrationProjectJob = async (
  job: Job<TQueueJobTypes[QueueName.PostHogIntegrationProcessingQueue]>,
) => {
  const projectId = job.data.payload.projectId;

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
    span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
  }

  logger.info(
    `[POSTHOG] Processing PostHog integration for project ${projectId}`,
  );

  // Fetch PostHog integration information for project
  const postHogIntegration = await prisma.posthogIntegration.findFirst({
    where: {
      projectId,
      enabled: true,
    },
    include: {
      project: {
        select: { name: true, createdAt: true },
      },
    },
  });

  if (!postHogIntegration) {
    logger.warn(
      `[POSTHOG] Enabled PostHog integration not found for project ${projectId}`,
    );
    return;
  }

  if (!postHogIntegration.project) {
    logger.warn(
      `[POSTHOG] Project not found for PostHog integration ${projectId}`,
    );
    return;
  }

  try {
    // Validate PostHog hostname to prevent SSRF attacks before sending data.
    // Rewrap preserving { cause } so the single catch below can classify the
    // OutboundUrlValidationError off the chain.
    try {
      await validateWebhookURL(postHogIntegration.posthogHostName);
    } catch (error) {
      logger.error(
        `[POSTHOG] PostHog integration for project ${projectId} has invalid hostname: ${hostnameForLog(postHogIntegration.posthogHostName)}. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Invalid PostHog hostname for project ${projectId}: ${error instanceof Error ? error.message : "Unknown error"}`,
        { cause: error },
      );
    }

    // Resume from lastSyncAt. On first run, fall back to the project's
    // createdAt since no trace data can precede it.
    const minTimestamp =
      postHogIntegration.lastSyncAt || postHogIntegration.project.createdAt;
    const uncappedMaxTimestamp = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    // Cap maxTimestamp at the next UTC day boundary after minTimestamp. Bounds
    // per-run work so a stuck integration (or a backfill on an older project)
    // does not re-scan an ever-growing window on each hourly retry, and aligns
    // with the toDate(...) ClickHouse partition/ordering keys for better
    // pruning. Healthy integrations are unaffected because uncappedMaxTimestamp
    // wins whenever the sync is within one day of present.
    const nextDayBoundary = new Date(
      Date.UTC(
        minTimestamp.getUTCFullYear(),
        minTimestamp.getUTCMonth(),
        minTimestamp.getUTCDate() + 1,
      ),
    );
    const maxTimestamp = new Date(
      Math.min(nextDayBoundary.getTime(), uncappedMaxTimestamp.getTime()),
    );

    if (maxTimestamp <= minTimestamp) {
      logger.info(
        `[POSTHOG] Skipping PostHog integration for project ${projectId}: empty sync window (min: ${minTimestamp.toISOString()}, max: ${maxTimestamp.toISOString()})`,
      );
      return;
    }

    logger.info(
      `[POSTHOG] Syncing project ${projectId} from ${minTimestamp.toISOString()} to ${maxTimestamp.toISOString()}`,
    );

    // Fetch relevant data and send it to PostHog
    const executionConfig: PostHogExecutionConfig = {
      projectId,
      projectName: postHogIntegration.project.name,
      minTimestamp,
      maxTimestamp,
      decryptedPostHogApiKey: decrypt(
        postHogIntegration.encryptedPosthogApiKey,
      ),
      postHogHost: postHogIntegration.posthogHostName,
      useGraceHash: job.attemptsMade > 0,
      volume: { bytes: 0 },
    };

    // Fail loudly before exporting empty data and advancing lastSyncAt
    // (LFE-10148, LFE-11009); the catch below logs and BullMQ retries.
    assertExportSourceWritable(
      postHogIntegration.exportSource,
      "Select the enriched observations export source in the PostHog integration settings.",
    );

    // Reuse one client and process streams sequentially so their aggregate
    // production rate cannot outrun the SDK's bounded queue.
    const posthog = new PostHog(executionConfig.decryptedPostHogApiKey, {
      host: executionConfig.postHogHost,
      ...postHogSettings,
      fetch: countingFetch(executionConfig.volume),
    });

    try {
      posthog.on("error", (error) => {
        logger.error(
          `[POSTHOG] Error sending data to PostHog for project ${projectId}: ${error}`,
        );
        executionConfig.sendError =
          error instanceof Error ? error : new Error(String(error));
      });

      // Always include scores
      await processPostHogScores(posthog, executionConfig);

      // Traces and observations - for TRACES_OBSERVATIONS and TRACES_OBSERVATIONS_EVENTS
      if (
        postHogIntegration.exportSource === "TRACES_OBSERVATIONS" ||
        postHogIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
      ) {
        await processPostHogTraces(posthog, executionConfig);
        await processPostHogGenerations(posthog, executionConfig);
      }

      // Events - for EVENTS and TRACES_OBSERVATIONS_EVENTS
      if (
        postHogIntegration.exportSource === "EVENTS" ||
        postHogIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
      ) {
        await processPostHogEvents(posthog, executionConfig);
      }
    } catch (processingError) {
      try {
        await posthog.shutdown();
      } catch (shutdownError) {
        logger.error(
          `[POSTHOG] Error shutting down PostHog client for project ${projectId} after export failure`,
          shutdownError,
        );
      }
      throw processingError;
    }

    await posthog.shutdown();
    throwIfPostHogSendError(executionConfig);

    // Update the last run information for the postHogIntegration record.
    // Clear any prior error state so a fixed + re-enabled integration reads as
    // healthy.
    await prisma.posthogIntegration.update({
      where: {
        projectId,
      },
      data: {
        lastSyncAt: executionConfig.maxTimestamp,
        lastError: null,
        lastErrorAt: null,
      },
    });
    // Record gzipped on-wire export volume once the run has succeeded.
    recordExportVolume({
      integration: "posthog",
      bytes: executionConfig.volume.bytes,
      projectId,
    });
    logger.info(
      `[POSTHOG] PostHog integration processing complete for project ${projectId}`,
    );
  } catch (error) {
    // A deterministic customer-config fault (a bad/malicious hostname rejected
    // by validateWebhookURL) can't succeed until the customer fixes it.
    // Classify it, disable the integration, persist the error, notify once,
    // and RESOLVE (return) — a throw would increment the BullMQ `type:failed`
    // metric on every attempt and keep the Failures monitor lit for a fault
    // that will never clear on its own. Transient/infra faults stay on the
    // retry+alert path unchanged.
    const reason = classifyCustomerFault(error);
    // Bounded like blob's extractStorageErrorMessage: today's classified
    // messages are short static strings, but persisted error text should not
    // grow unbounded if a future classified path carries a large SDK body.
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, 1000);

    if (reason === undefined) {
      // Defensive fallback: every code today either classifies above and
      // disables (including one raised on a redirect hop, reached through the
      // redirect error's `cause`) or is transient. An unrecognised block stays
      // terminal, but leaves the integration enabled to recover next run.
      rethrowIfOutboundValidationFailure(error, {
        logSubject: `[POSTHOG] Outbound send for project ${projectId}`,
        jobSubject: `PostHog integration for project ${projectId}`,
      });

      logger.error(
        `[POSTHOG] Error processing PostHog integration for project ${projectId}`,
        error,
      );
      throw error;
    }

    try {
      await prisma.posthogIntegration.update({
        where: { projectId },
        data: { lastError: message, lastErrorAt: new Date() },
      });
    } catch (persistError) {
      if (isRecordNotFoundError(persistError)) {
        // Integration deleted mid-run: nothing to persist, nobody to notify.
        // Drop the obsolete job instead of retrying it.
        logger.info(
          `[POSTHOG] PostHog integration for project ${projectId} was deleted mid-run; dropping obsolete job after error: ${message}`,
        );
        return;
      }
      // Persisting failed for an infra reason (e.g. DB unavailable). Don't claim
      // the customer fault as handled — rethrow so BullMQ retries and reclassifies.
      logger.error(
        `[POSTHOG] Failed to persist PostHog integration error for project ${projectId}`,
        persistError,
      );
      throw persistError;
    }

    // Atomic disable: count === 1 means THIS worker flipped enabled true→false,
    // so the terminal notification fires exactly once even if a concurrent run
    // (distinct jobId, not queue-deduped) races the same fault. The host is
    // part of the predicate so a run carrying stale config cannot disable a
    // hostname the customer corrected mid-run — the fault we caught refers to a
    // config that no longer exists, and the next scheduled run re-evaluates.
    const { count } = await prisma.posthogIntegration.updateMany({
      where: {
        projectId,
        enabled: true,
        posthogHostName: postHogIntegration.posthogHostName,
      },
      data: { enabled: false },
    });
    if (count === 0) {
      // Already disabled by a concurrent run, or the host changed under us.
      logger.info(
        `[POSTHOG] Skipped disabling PostHog integration for project ${projectId}: already disabled or host changed mid-run`,
      );
      return;
    }

    recordIncrement(POSTHOG_INTEGRATION_DISABLED_METRIC, 1, { reason });
    logger.warn(
      `[POSTHOG] Disabled PostHog integration for project ${projectId} after a customer fault (reason=${reason}): ${message}`,
      { posthogDisableReason: reason, projectId },
    );
    // Awaited, not fire-and-forget: the job resolves immediately after this and
    // the integration is now disabled, so the scheduler (which only enqueues
    // enabled integrations) never revisits it. An interrupted dispatch would
    // leave the customer silently disabled with no notification and no retry.
    await notifyPostHogExportFailed(
      projectId,
      postHogIntegration.project.name,
      hostnameForLog(postHogIntegration.posthogHostName),
    );
    return;
  }
};

// Terminal "export disabled" notification. Called at most once per broken
// integration, guarded by the atomic enabled true→false claim, so it needs no
// cooldown of its own (matching blob's disabled path, which also bypasses it).
// Swallows every failure: notification trouble must not turn the deliberate
// RESOLVE back into a job failure. projectName/host are passed in rather than
// re-read — the caller already holds them.
async function notifyPostHogExportFailed(
  projectId: string,
  projectName: string,
  host: string,
): Promise<void> {
  try {
    const settingsPath = `/project/${projectId}/settings/integrations/posthog`;
    await dispatchProjectNotification({
      projectId,
      event: {
        eventType: "posthog-export-failed",
        severity: "ALERT",
        projectId,
        projectName,
        // The integration is keyed by projectId (1:1); the host is the most
        // useful human label for the failing export destination.
        resourceId: projectId,
        resourceName: host || "PostHog integration",
        message: `PostHog export disabled for project "${projectName}" after a configuration fault.`,
        url: env.NEXTAUTH_URL
          ? `${env.NEXTAUTH_URL}${settingsPath}`
          : undefined,
        disabled: true,
      },
    });
  } catch (error) {
    logger.error(
      `[POSTHOG] Failed to send failure notification for project ${projectId}`,
      error,
    );
  }
}
