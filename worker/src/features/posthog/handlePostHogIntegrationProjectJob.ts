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
} from "@langfuse/shared/src/server";
import {
  transformTraceForPostHog,
  transformGenerationForPostHog,
  transformEventForPostHog,
  transformScoreForPostHog,
} from "./transformers";
import { decrypt } from "@langfuse/shared/encryption";
import { PostHog } from "posthog-node";
import { recordExportVolume } from "../../services/exportVolumeMetric";
import { assertLegacyExportSourceWritable } from "../exportWriteModeGuard";
import { env } from "../../env";

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
  // fetch wrapper on each client and read once the run succeeds.
  volume: { bytes: number };
  // Last error emitted by the shared PostHog client; checked inside the export
  // loops so a failing stream aborts the job instead of silently continuing.
  sendError: { current?: Error };
};

const postHogSettings = {
  flushAt: 1000,
};

const sleep = (ms: number) =>
  ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

// Throttle exports after each flush so a single project sync cannot burst the
// target PostHog instance with an unbounded event rate (issue #12786).
// `hadEvents` must be tracked by the caller since posthog-node does not expose
// its internal queue size; flush() is a no-op on an empty batch, so skipping
// the delay then avoids a wasted wait on the terminal flush.
const flushWithDelay = async (posthog: PostHog, hadEvents: boolean) => {
  await posthog.flush();
  if (hadEvents) {
    await sleep(env.LANGFUSE_POSTHOG_FLUSH_DELAY_MS);
  }
};

type PostHogClientOptions = NonNullable<
  ConstructorParameters<typeof PostHog>[1]
>;

// Wrap the SDK's fetch transport to count gzipped on-wire upload volume for
// the export-volume metric. The SDK gzips the /batch/ body by default and also
// calls /flags/, so only /batch/ request bodies are measured (LFE-10508).
export const countingFetch =
  (volume: { bytes: number }): PostHogClientOptions["fetch"] =>
  (url, options) => {
    if (url.endsWith("/batch/")) {
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
          `[POSTHOG] Unexpected /batch/ body type "${typeof body}"; export volume under-reported`,
        );
      }
    }
    return globalThis.fetch(url, options as RequestInit);
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

  logger.info(
    `[POSTHOG] Sending traces for project ${config.projectId} to PostHog`,
  );

  let count = 0;
  for await (const trace of traces) {
    if (config.sendError.current) throw config.sendError.current;
    count++;
    const event = transformTraceForPostHog(trace, config.projectId);
    posthog.capture(event);
    if (count % postHogSettings.flushAt === 0) {
      await flushWithDelay(posthog, true);
      if (config.sendError.current) throw config.sendError.current;
      logger.info(
        `[POSTHOG] Sent ${count} traces to PostHog for project ${config.projectId}`,
      );
    }
  }
  await flushWithDelay(posthog, count % postHogSettings.flushAt !== 0);
  if (config.sendError.current) throw config.sendError.current;
  logger.info(
    `[POSTHOG] Sent ${count} traces to PostHog for project ${config.projectId}`,
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

  logger.info(
    `[POSTHOG] Sending generations for project ${config.projectId} to PostHog`,
  );

  let count = 0;
  for await (const generation of generations) {
    if (config.sendError.current) throw config.sendError.current;
    count++;
    const event = transformGenerationForPostHog(generation, config.projectId);
    posthog.capture(event);
    if (count % postHogSettings.flushAt === 0) {
      await flushWithDelay(posthog, true);
      if (config.sendError.current) throw config.sendError.current;
      logger.info(
        `[POSTHOG] Sent ${count} generations to PostHog for project ${config.projectId}`,
      );
    }
  }
  await flushWithDelay(posthog, count % postHogSettings.flushAt !== 0);
  if (config.sendError.current) throw config.sendError.current;
  logger.info(
    `[POSTHOG] Sent ${count} generations to PostHog for project ${config.projectId}`,
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
    { useGraceHash: config.useGraceHash },
  );

  logger.info(
    `[POSTHOG] Sending scores for project ${config.projectId} to PostHog`,
  );

  let count = 0;
  for await (const score of scores) {
    if (config.sendError.current) throw config.sendError.current;
    count++;
    const event = transformScoreForPostHog(score, config.projectId);
    posthog.capture(event);
    if (count % postHogSettings.flushAt === 0) {
      await flushWithDelay(posthog, true);
      if (config.sendError.current) throw config.sendError.current;
      logger.info(
        `[POSTHOG] Sent ${count} scores to PostHog for project ${config.projectId}`,
      );
    }
  }
  await flushWithDelay(posthog, count % postHogSettings.flushAt !== 0);
  if (config.sendError.current) throw config.sendError.current;
  logger.info(
    `[POSTHOG] Sent ${count} scores to PostHog for project ${config.projectId}`,
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

  logger.info(
    `[POSTHOG] Sending events for project ${config.projectId} to PostHog`,
  );

  let count = 0;
  for await (const analyticsEvent of events) {
    if (config.sendError.current) throw config.sendError.current;
    count++;
    const event = transformEventForPostHog(analyticsEvent, config.projectId);
    posthog.capture(event);
    if (count % postHogSettings.flushAt === 0) {
      await flushWithDelay(posthog, true);
      if (config.sendError.current) throw config.sendError.current;
      logger.info(
        `[POSTHOG] Sent ${count} events to PostHog for project ${config.projectId}`,
      );
    }
  }
  await flushWithDelay(posthog, count % postHogSettings.flushAt !== 0);
  if (config.sendError.current) throw config.sendError.current;
  logger.info(
    `[POSTHOG] Sent ${count} events to PostHog for project ${config.projectId}`,
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

  // Validate PostHog hostname to prevent SSRF attacks before sending data
  try {
    await validateWebhookURL(postHogIntegration.posthogHostName);
  } catch (error) {
    logger.error(
      `[POSTHOG] PostHog integration for project ${projectId} has invalid hostname: ${postHogIntegration.posthogHostName}. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new Error(
      `Invalid PostHog hostname for project ${projectId}: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    decryptedPostHogApiKey: decrypt(postHogIntegration.encryptedPosthogApiKey),
    postHogHost: postHogIntegration.posthogHostName,
    useGraceHash: job.attemptsMade > 0,
    volume: { bytes: 0 },
    sendError: {},
  };

  try {
    // Fail loudly before exporting empty data and advancing lastSyncAt
    // (LFE-10148); the catch below logs and BullMQ retries.
    assertLegacyExportSourceWritable(
      postHogIntegration.exportSource,
      "Select the enriched observations export source in the PostHog integration settings.",
    );

    // Reuse a single client and run streams sequentially so the per-job export
    // rate stays bounded. Running the streams in parallel with one client each
    // produced an unbounded burst that overwhelmed the target (issue #12786).
    const posthog = new PostHog(executionConfig.decryptedPostHogApiKey, {
      host: executionConfig.postHogHost,
      ...postHogSettings,
      fetch: countingFetch(executionConfig.volume),
    });

    posthog.on("error", (error) => {
      logger.error(
        `[POSTHOG] Error sending events to PostHog for project ${projectId}: ${error}`,
      );
      executionConfig.sendError.current =
        error instanceof Error ? error : new Error(String(error));
    });

    try {
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
    } finally {
      // Flush remaining events and stop the SDK's background flush timer so
      // nothing leaks per job in the long-running worker process.
      await posthog.shutdown();
    }

    // Update the last run information for the postHogIntegration record.
    await prisma.posthogIntegration.update({
      where: {
        projectId,
      },
      data: {
        lastSyncAt: executionConfig.maxTimestamp,
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
    logger.error(
      `[POSTHOG] Error processing PostHog integration for project ${projectId}`,
      error,
    );
    throw error;
  }
};
