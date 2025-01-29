import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  getTracesForPostHog,
  getGenerationsForPostHog,
  getScoresForPostHog,
} from "@langfuse/shared/src/server";
import { v5 } from "uuid";
import { decrypt } from "@langfuse/shared/encryption";
import { PostHog } from "posthog-node";

type PostHogExecutionConfig = {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  decryptedPostHogApiKey: string;
  postHogHost: string;
};

const POSTHOG_UUID_NAMESPACE = "0f6c91df-d035-4813-b838-9741ba38ef0b";

const processPostHogTraces = async (config: PostHogExecutionConfig) => {
  const postHogTraces = getTracesForPostHog(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending traces for project ${config.projectId} to PostHog`);

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
  });

  let count = 0;
  for await (const trace of postHogTraces) {
    count++;
    posthog.capture({
      distinctId: trace.langfuse_user_id as string,
      event: "langfuse trace",
      properties: trace,
      timestamp: trace.timestamp as Date,
      uuid: v5(
        `${config.projectId}-${trace.langfuse_id}`,
        POSTHOG_UUID_NAMESPACE,
      ),
    });
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
  const postHogGenerations = getGenerationsForPostHog(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending generations for project ${config.projectId} to PostHog`);

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
  });

  let count = 0;
  for await (const generation of postHogGenerations) {
    count++;
    posthog.capture({
      distinctId: generation.langfuse_user_id as string,
      event: "langfuse generation",
      properties: generation,
      timestamp: generation.timestamp as Date,
      uuid: v5(
        `${config.projectId}-${generation.langfuse_id}`,
        POSTHOG_UUID_NAMESPACE,
      ),
    });
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
  const postHogScores = getScoresForPostHog(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending scores for project ${config.projectId} to PostHog`);

  // Send each via PostHog SDK
  const posthog = new PostHog(config.decryptedPostHogApiKey, {
    host: config.postHogHost,
  });

  let count = 0;
  for await (const score of postHogScores) {
    count++;
    posthog.capture({
      distinctId: score.langfuse_user_id as string,
      event: "langfuse score",
      properties: score,
      timestamp: score.timestamp as Date,
      uuid: v5(
        `${config.projectId}-${score.langfuse_id}`,
        POSTHOG_UUID_NAMESPACE,
      ),
    });
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
