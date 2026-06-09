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
import { env } from "../../env";

type PostHogExecutionConfig = {
  projectId: string;
  projectName: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  // First attempt uses ClickHouse `auto` join algorithm. We only fall back to
  // `grace_hash` (slower, but spills to disk) on retries so an OOM on the first
  // attempt recovers without manual intervention while healthy syncs stay fast.
  useGraceHash: boolean;
  posthog: PostHog;
  flushDelayMs: number;
  getSendError: () => Error | undefined;
};

const postHogSettings = {
  flushAt: 1000,
};

const postHogFlushBatchSize = 10000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const throwIfPostHogSendError = (config: PostHogExecutionConfig) => {
  const sendError = config.getSendError();
  if (sendError) throw sendError;
};

const flushPostHog = async (
  config: PostHogExecutionConfig,
  options: { delayAfterFlush?: boolean } = {},
) => {
  await config.posthog.flush();
  throwIfPostHogSendError(config);

  if (options.delayAfterFlush && config.flushDelayMs > 0) {
    await sleep(config.flushDelayMs);
    throwIfPostHogSendError(config);
  }
};

const processPostHogTraces = async (config: PostHogExecutionConfig) => {
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
    throwIfPostHogSendError(config);
    count++;
    const event = transformTraceForPostHog(trace, config.projectId);
    config.posthog.capture(event);
    if (count % postHogFlushBatchSize === 0) {
      await flushPostHog(config, { delayAfterFlush: true });
      logger.info(
        `[POSTHOG] Sent ${count} traces to PostHog for project ${config.projectId}`,
      );
    }
  }
  await flushPostHog(config);
  logger.info(
    `[POSTHOG] Sent ${count} traces to PostHog for project ${config.projectId}`,
  );
};

const processPostHogGenerations = async (config: PostHogExecutionConfig) => {
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
    throwIfPostHogSendError(config);
    count++;
    const event = transformGenerationForPostHog(generation, config.projectId);
    config.posthog.capture(event);
    if (count % postHogFlushBatchSize === 0) {
      await flushPostHog(config, { delayAfterFlush: true });
      logger.info(
        `[POSTHOG] Sent ${count} generations to PostHog for project ${config.projectId}`,
      );
    }
  }
  await flushPostHog(config);
  logger.info(
    `[POSTHOG] Sent ${count} generations to PostHog for project ${config.projectId}`,
  );
};

const processPostHogScores = async (config: PostHogExecutionConfig) => {
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
    throwIfPostHogSendError(config);
    count++;
    const event = transformScoreForPostHog(score, config.projectId);
    config.posthog.capture(event);
    if (count % postHogFlushBatchSize === 0) {
      await flushPostHog(config, { delayAfterFlush: true });
      logger.info(
        `[POSTHOG] Sent ${count} scores to PostHog for project ${config.projectId}`,
      );
    }
  }
  await flushPostHog(config);
  logger.info(
    `[POSTHOG] Sent ${count} scores to PostHog for project ${config.projectId}`,
  );
};

const processPostHogEvents = async (config: PostHogExecutionConfig) => {
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
    throwIfPostHogSendError(config);
    count++;
    const event = transformEventForPostHog(analyticsEvent, config.projectId);
    config.posthog.capture(event);
    if (count % postHogFlushBatchSize === 0) {
      await flushPostHog(config, { delayAfterFlush: true });
      logger.info(
        `[POSTHOG] Sent ${count} events to PostHog for project ${config.projectId}`,
      );
    }
  }
  await flushPostHog(config);
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

  let posthog: PostHog | undefined;
  let sendError: Error | undefined;

  try {
    posthog = new PostHog(
      decrypt(postHogIntegration.encryptedPosthogApiKey),
      {
        host: postHogIntegration.posthogHostName,
        ...postHogSettings,
      },
    );
    posthog.on("error", (error) => {
      logger.error(
        `[POSTHOG] Error sending data to PostHog for project ${projectId}: ${error}`,
      );
      sendError = error instanceof Error ? error : new Error(String(error));
    });

    // Fetch relevant data and send it to PostHog
    const executionConfig: PostHogExecutionConfig = {
      projectId,
      projectName: postHogIntegration.project.name,
      minTimestamp,
      maxTimestamp,
      useGraceHash: job.attemptsMade > 0,
      posthog,
      flushDelayMs: env.LANGFUSE_POSTHOG_FLUSH_DELAY_MS,
      getSendError: () => sendError,
    };

    // Always include scores
    await processPostHogScores(executionConfig);

    // Traces and observations - for TRACES_OBSERVATIONS and TRACES_OBSERVATIONS_EVENTS
    if (
      postHogIntegration.exportSource === "TRACES_OBSERVATIONS" ||
      postHogIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
    ) {
      await processPostHogTraces(executionConfig);
      await processPostHogGenerations(executionConfig);
    }

    // Events - for EVENTS and TRACES_OBSERVATIONS_EVENTS
    if (
      postHogIntegration.exportSource === "EVENTS" ||
      postHogIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
    ) {
      await processPostHogEvents(executionConfig);
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
    logger.info(
      `[POSTHOG] PostHog integration processing complete for project ${projectId}`,
    );
  } catch (error) {
    logger.error(
      `[POSTHOG] Error processing PostHog integration for project ${projectId}`,
      error,
    );
    throw error;
  } finally {
    if (posthog) {
      await posthog.shutdown();
    }
  }
};
