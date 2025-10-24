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
} from "@langfuse/shared/src/server";
import { decrypt } from "@langfuse/shared/encryption";
import { MixpanelClient } from "./mixpanelClient";
import {
  transformTraceForMixpanel,
  transformGenerationForMixpanel,
  transformScoreForMixpanel,
} from "./transformers";

type MixpanelExecutionConfig = {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  decryptedProjectToken: string;
  mixpanelRegion: string;
};

const processMixpanelTraces = async (config: MixpanelExecutionConfig) => {
  const traces = getTracesForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending traces for project ${config.projectId} to Mixpanel`);

  const mixpanel = new MixpanelClient({
    projectToken: config.decryptedProjectToken,
    region: config.mixpanelRegion,
  });

  let count = 0;
  for await (const trace of traces) {
    count++;
    const event = transformTraceForMixpanel(trace, config.projectId);
    mixpanel.addEvent(event);

    if (count % 10000 === 0) {
      await mixpanel.flush();
      logger.info(
        `Sent ${count} traces to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await mixpanel.flush();
  logger.info(
    `Sent ${count} traces to Mixpanel for project ${config.projectId}`,
  );
};

const processMixpanelGenerations = async (config: MixpanelExecutionConfig) => {
  const generations = getGenerationsForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(
    `Sending generations for project ${config.projectId} to Mixpanel`,
  );

  const mixpanel = new MixpanelClient({
    projectToken: config.decryptedProjectToken,
    region: config.mixpanelRegion,
  });

  let count = 0;
  for await (const generation of generations) {
    count++;
    const event = transformGenerationForMixpanel(generation, config.projectId);
    mixpanel.addEvent(event);

    if (count % 10000 === 0) {
      await mixpanel.flush();
      logger.info(
        `Sent ${count} generations to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await mixpanel.flush();
  logger.info(
    `Sent ${count} generations to Mixpanel for project ${config.projectId}`,
  );
};

const processMixpanelScores = async (config: MixpanelExecutionConfig) => {
  const scores = getScoresForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(`Sending scores for project ${config.projectId} to Mixpanel`);

  const mixpanel = new MixpanelClient({
    projectToken: config.decryptedProjectToken,
    region: config.mixpanelRegion,
  });

  let count = 0;
  for await (const score of scores) {
    count++;
    const event = transformScoreForMixpanel(score, config.projectId);
    mixpanel.addEvent(event);

    if (count % 10000 === 0) {
      await mixpanel.flush();
      logger.info(
        `Sent ${count} scores to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await mixpanel.flush();
  logger.info(
    `Sent ${count} scores to Mixpanel for project ${config.projectId}`,
  );
};

export const handleMixpanelIntegrationProjectJob = async (
  job: Job<TQueueJobTypes[QueueName.MixpanelIntegrationProcessingQueue]>,
) => {
  const projectId = job.data.payload.projectId;

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
    span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
  }

  logger.info(`Processing Mixpanel integration for project ${projectId}`);

  // Fetch Mixpanel integration information for project
  const mixpanelIntegration = await prisma.mixpanelIntegration.findFirst({
    where: {
      projectId,
      enabled: true,
    },
  });

  if (!mixpanelIntegration) {
    logger.warn(
      `Enabled Mixpanel integration not found for project ${projectId}`,
    );
    return;
  }

  // Fetch relevant data and send it to Mixpanel
  const executionConfig: MixpanelExecutionConfig = {
    projectId,
    // Start from 2000-01-01 if no lastSyncAt. Workaround because 1970-01-01 leads to subtle bugs in ClickHouse
    minTimestamp: mixpanelIntegration.lastSyncAt || new Date("2000-01-01"),
    maxTimestamp: new Date(new Date().getTime() - 30 * 60 * 1000), // 30 minutes ago
    decryptedProjectToken: decrypt(mixpanelIntegration.encryptedProjectToken),
    mixpanelRegion: mixpanelIntegration.mixpanelRegion,
  };

  await Promise.all([
    processMixpanelTraces(executionConfig),
    processMixpanelGenerations(executionConfig),
    processMixpanelScores(executionConfig),
  ]);

  // Update the last run information for the mixpanelIntegration record
  await prisma.mixpanelIntegration.update({
    where: {
      projectId,
    },
    data: {
      lastSyncAt: executionConfig.maxTimestamp,
    },
  });
  logger.info(
    `Mixpanel integration processing complete for project ${projectId}`,
  );
};
