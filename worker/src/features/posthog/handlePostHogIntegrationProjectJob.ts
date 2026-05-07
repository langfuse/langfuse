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
};

const postHogSettings = {
  flushAt: 1000,
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

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
    ...postHogSettings,
  });

  let sendError: Error | undefined;
  posthog.on("error", (error) => {
    logger.error(
      `[POSTHOG] Error sending traces to PostHog for project ${config.projectId}: ${error}`,
    );
    sendError = error instanceof Error ? error : new Error(String(error));
  });

  let count = 0;
  for await (const trace of traces) {
    if (sendError) throw sendError;
    count++;
    const event = transformTraceForPostHog(trace, config.projectId);
    posthog.capture(event);
    if (count % 10000 === 0) {
      await posthog.flush();
      if (sendError) throw sendError;
      logger.info(
        `[POSTHOG] Sent ${count} traces to PostHog for project ${config.projectId}`,
      );
    }
  }
  await posthog.flush();
  if (sendError) throw sendError;
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

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
    ...postHogSettings,
  });

  let sendError: Error | undefined;
  posthog.on("error", (error) => {
    logger.error(
      `[POSTHOG] Error sending generations to PostHog for project ${config.projectId}: ${error}`,
    );
    sendError = error instanceof Error ? error : new Error(String(error));
  });

  let count = 0;
  for await (const generation of generations) {
    if (sendError) throw sendError;
    count++;
    const event = transformGenerationForPostHog(generation, config.projectId);
    posthog.capture(event);
    if (count % 10000 === 0) {
      await posthog.flush();
      if (sendError) throw sendError;
      logger.info(
        `[POSTHOG] Sent ${count} generations to PostHog for project ${config.projectId}`,
      );
    }
  }
  await posthog.flush();
  if (sendError) throw sendError;
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

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
    ...postHogSettings,
  });

  let sendError: Error | undefined;
  posthog.on("error", (error) => {
    logger.error(
      `[POSTHOG] Error sending scores to PostHog for project ${config.projectId}: ${error}`,
    );
    sendError = error instanceof Error ? error : new Error(String(error));
  });

  let count = 0;
  for await (const score of scores) {
    if (sendError) throw sendError;
    count++;
    const event = transformScoreForPostHog(score, config.projectId);
    posthog.capture(event);
    if (count % 10000 === 0) {
      await posthog.flush();
      if (sendError) throw sendError;
      logger.info(
        `[POSTHOG] Sent ${count} scores to PostHog for project ${config.projectId}`,
      );
    }
  }
  await posthog.flush();
  if (sendError) throw sendError;
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

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
    ...postHogSettings,
  });

  let sendError: Error | undefined;
  posthog.on("error", (error) => {
    logger.error(
      `[POSTHOG] Error sending events to PostHog for project ${config.projectId}: ${error}`,
    );
    sendError = error instanceof Error ? error : new Error(String(error));
  });

  let count = 0;
  for await (const analyticsEvent of events) {
    if (sendError) throw sendError;
    count++;
    const event = transformEventForPostHog(analyticsEvent, config.projectId);
    posthog.capture(event);
    if (count % 10000 === 0) {
      await posthog.flush();
      logger.info(
        `[POSTHOG] Sent ${count} events to PostHog for project ${config.projectId}`,
      );
    }
  }
  await posthog.flush();
  if (sendError) throw sendError;
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
  };

  try {
    const processPromises: Promise<void>[] = [];

    // Always include scores
    processPromises.push(processPostHogScores(executionConfig));

    // Traces and observations - for TRACES_OBSERVATIONS and TRACES_OBSERVATIONS_EVENTS
    if (
      postHogIntegration.exportSource === "TRACES_OBSERVATIONS" ||
      postHogIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
    ) {
      processPromises.push(
        processPostHogTraces(executionConfig),
        processPostHogGenerations(executionConfig),
      );
    }

    // Events - for EVENTS and TRACES_OBSERVATIONS_EVENTS
    if (
      postHogIntegration.exportSource === "EVENTS" ||
      postHogIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
    ) {
      processPromises.push(processPostHogEvents(executionConfig));
    }

    await Promise.all(processPromises);

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
  }
};
