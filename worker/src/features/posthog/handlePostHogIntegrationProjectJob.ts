import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  getTracesForAnalyticsIntegrations,
  getGenerationsForAnalyticsIntegrations,
  getScoresForAnalyticsIntegrations,
  getCurrentSpan,
  validateWebhookURL,
} from "@langfuse/shared/src/server";
import {
  transformTraceForPostHog,
  transformGenerationForPostHog,
  transformScoreForPostHog,
} from "./transformers";
import { decrypt } from "@langfuse/shared/encryption";
import { PostHog } from "posthog-node";

type PostHogExecutionConfig = {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  decryptedPostHogApiKey: string;
  postHogHost: string;
};

const postHogSettings = {
  flushAt: 1000,
};

const processPostHogTraces = async (config: PostHogExecutionConfig) => {
  const traces = getTracesForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending traces for project ${config.projectId} to PostHog`);

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
    ...postHogSettings,
  });

  posthog.on("error", (error) => {
    logger.error(
      `Error sending traces to PostHog for project ${config.projectId}: ${error}`,
    );
    throw new Error(
      `Error sending traces to PostHog for project ${config.projectId}: ${error}`,
    );
  });

  let count = 0;
  for await (const trace of traces) {
    count++;
    const event = transformTraceForPostHog(trace, config.projectId);
    posthog.capture(event);
    if (count % 10000 === 0) {
      await posthog.flush();
      logger.info(
        `Sent ${count} traces to PostHog for project ${config.projectId}`,
      );
    }
  }
  await posthog.flush();
  logger.info(
    `Sent ${count} traces to PostHog for project ${config.projectId}`,
  );
};

const processPostHogGenerations = async (config: PostHogExecutionConfig) => {
  const generations = getGenerationsForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending generations for project ${config.projectId} to PostHog`);

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
    ...postHogSettings,
  });

  posthog.on("error", (error) => {
    logger.error(
      `Error sending generations to PostHog for project ${config.projectId}: ${error}`,
    );
    throw new Error(
      `Error sending generations to PostHog for project ${config.projectId}: ${error}`,
    );
  });

  let count = 0;
  for await (const generation of generations) {
    count++;
    const event = transformGenerationForPostHog(generation, config.projectId);
    posthog.capture(event);
    if (count % 10000 === 0) {
      await posthog.flush();
      logger.info(
        `Sent ${count} generations to PostHog for project ${config.projectId}`,
      );
    }
  }
  await posthog.flush();
  logger.info(
    `Sent ${count} generations to PostHog for project ${config.projectId}`,
  );
};

const processPostHogScores = async (config: PostHogExecutionConfig) => {
  const scores = getScoresForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending scores for project ${config.projectId} to PostHog`);

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
    ...postHogSettings,
  });

  posthog.on("error", (error) => {
    logger.error(
      `Error sending scores to PostHog for project ${config.projectId}: ${error}`,
    );
    throw new Error(
      `Error sending scores to PostHog for project ${config.projectId}: ${error}`,
    );
  });
  let count = 0;
  for await (const score of scores) {
    count++;
    const event = transformScoreForPostHog(score, config.projectId);
    posthog.capture(event);
    if (count % 10000 === 0) {
      await posthog.flush();
      logger.info(
        `Sent ${count} scores to PostHog for project ${config.projectId}`,
      );
    }
  }
  await posthog.flush();
  logger.info(
    `Sent ${count} scores to PostHog for project ${config.projectId}`,
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

  logger.info(`Processing PostHog integration for project ${projectId}`);

  // Fetch PostHog integration information for project
  const postHogIntegration = await prisma.posthogIntegration.findFirst({
    where: {
      projectId,
      enabled: true,
    },
  });

  if (!postHogIntegration) {
    logger.warn(
      `Enabled PostHog integration not found for project ${projectId}`,
    );
    return;
  }

  // Validate PostHog hostname to prevent SSRF attacks before sending data
  try {
    await validateWebhookURL(postHogIntegration.posthogHostName);
  } catch (error) {
    logger.error(
      `PostHog integration for project ${projectId} has invalid hostname: ${postHogIntegration.posthogHostName}. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw new Error(
      `Invalid PostHog hostname for project ${projectId}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  // Fetch relevant data and send it to PostHog
  const executionConfig: PostHogExecutionConfig = {
    projectId,
    // Start from 2000-01-01 if no lastSyncAt. Workaround because 1970-01-01 leads to subtle bugs in ClickHouse
    minTimestamp: postHogIntegration.lastSyncAt || new Date("2000-01-01"),
    maxTimestamp: new Date(new Date().getTime() - 30 * 60 * 1000), // 30 minutes ago
    decryptedPostHogApiKey: decrypt(postHogIntegration.encryptedPosthogApiKey),
    postHogHost: postHogIntegration.posthogHostName,
  };

  await Promise.all([
    processPostHogTraces(executionConfig),
    processPostHogGenerations(executionConfig),
    processPostHogScores(executionConfig),
  ]);

  // Update the last run information for the postHogIntegration record
  await prisma.posthogIntegration.update({
    where: {
      projectId,
    },
    data: {
      lastSyncAt: executionConfig.maxTimestamp,
    },
  });
  logger.info(
    `PostHog integration processing complete for project ${projectId}`,
  );
};
