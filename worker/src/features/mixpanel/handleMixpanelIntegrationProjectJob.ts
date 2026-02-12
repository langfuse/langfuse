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
} from "@langfuse/shared/src/server";
import { decrypt } from "@langfuse/shared/encryption";
import { MixpanelClient } from "./mixpanelClient";
import {
  transformTraceForMixpanel,
  transformGenerationForMixpanel,
  transformScoreForMixpanel,
  transformEventForMixpanel,
} from "./transformers";

type MixpanelExecutionConfig = {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  decryptedMixpanelProjectToken: string;
  mixpanelRegion: string;
};

const processMixpanelTraces = async (config: MixpanelExecutionConfig) => {
  const traces = getTracesForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(
    `[MIXPANEL] Sending traces for project ${config.projectId} to Mixpanel`,
  );

  const mixpanel = new MixpanelClient({
    projectToken: config.decryptedMixpanelProjectToken,
    region: config.mixpanelRegion,
  });

  let count = 0;
  for await (const trace of traces) {
    count++;
    const event = transformTraceForMixpanel(trace, config.projectId);
    mixpanel.addEvent(event);

    if (count % 1000 === 0) {
      await mixpanel.flush();
      logger.info(
        `[MIXPANEL] Sent ${count} traces to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await mixpanel.flush();
  logger.info(
    `[MIXPANEL] Sent ${count} traces to Mixpanel for project ${config.projectId}`,
  );
};

const processMixpanelGenerations = async (config: MixpanelExecutionConfig) => {
  const generations = getGenerationsForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(
    `[MIXPANEL] Sending generations for project ${config.projectId} to Mixpanel`,
  );

  const mixpanel = new MixpanelClient({
    projectToken: config.decryptedMixpanelProjectToken,
    region: config.mixpanelRegion,
  });

  let count = 0;
  for await (const generation of generations) {
    count++;
    const event = transformGenerationForMixpanel(generation, config.projectId);
    mixpanel.addEvent(event);

    if (count % 1000 === 0) {
      await mixpanel.flush();
      logger.info(
        `[MIXPANEL] Sent ${count} generations to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await mixpanel.flush();
  logger.info(
    `[MIXPANEL] Sent ${count} generations to Mixpanel for project ${config.projectId}`,
  );
};

const processMixpanelScores = async (config: MixpanelExecutionConfig) => {
  const scores = getScoresForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(
    `[MIXPANEL] Sending scores for project ${config.projectId} to Mixpanel`,
  );

  const mixpanel = new MixpanelClient({
    projectToken: config.decryptedMixpanelProjectToken,
    region: config.mixpanelRegion,
  });

  let count = 0;
  for await (const score of scores) {
    count++;
    const event = transformScoreForMixpanel(score, config.projectId);
    mixpanel.addEvent(event);

    if (count % 1000 === 0) {
      await mixpanel.flush();
      logger.info(
        `[MIXPANEL] Sent ${count} scores to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await mixpanel.flush();
  logger.info(
    `[MIXPANEL] Sent ${count} scores to Mixpanel for project ${config.projectId}`,
  );
};

const processMixpanelEvents = async (config: MixpanelExecutionConfig) => {
  const events = getEventsForAnalyticsIntegrations(
    config.projectId,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(
    `[MIXPANEL] Sending events for project ${config.projectId} to Mixpanel`,
  );

  const mixpanel = new MixpanelClient({
    projectToken: config.decryptedMixpanelProjectToken,
    region: config.mixpanelRegion,
  });

  let count = 0;
  for await (const analyticsEvent of events) {
    count++;
    const event = transformEventForMixpanel(analyticsEvent, config.projectId);
    mixpanel.addEvent(event);

    if (count % 1000 === 0) {
      await mixpanel.flush();
      logger.info(
        `[MIXPANEL] Sent ${count} events to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await mixpanel.flush();
  logger.info(
    `[MIXPANEL] Sent ${count} events to Mixpanel for project ${config.projectId}`,
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

  logger.info(
    `[MIXPANEL] Processing Mixpanel integration for project ${projectId}`,
  );

  // Fetch Mixpanel integration information for project
  const mixpanelIntegration = await prisma.mixpanelIntegration.findFirst({
    where: {
      projectId,
      enabled: true,
    },
  });

  if (!mixpanelIntegration) {
    logger.warn(
      `[MIXPANEL] Enabled Mixpanel integration not found for project ${projectId}`,
    );
    return;
  }

  // Fetch relevant data and send it to Mixpanel
  const executionConfig: MixpanelExecutionConfig = {
    projectId,
    // Start from 2000-01-01 if no lastSyncAt. Workaround because 1970-01-01 leads to subtle bugs in ClickHouse
    minTimestamp: mixpanelIntegration.lastSyncAt || new Date("2000-01-01"),
    maxTimestamp: new Date(new Date().getTime() - 30 * 60 * 1000), // 30 minutes ago
    decryptedMixpanelProjectToken: decrypt(
      mixpanelIntegration.encryptedMixpanelProjectToken,
    ),
    mixpanelRegion: mixpanelIntegration.mixpanelRegion,
  };

  try {
    const processPromises: Promise<void>[] = [];

    // Always include scores
    processPromises.push(processMixpanelScores(executionConfig));

    // Traces and observations - for TRACES_OBSERVATIONS and TRACES_OBSERVATIONS_EVENTS
    if (
      mixpanelIntegration.exportSource === "TRACES_OBSERVATIONS" ||
      mixpanelIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
    ) {
      processPromises.push(
        processMixpanelTraces(executionConfig),
        processMixpanelGenerations(executionConfig),
      );
    }

    // Events - for EVENTS and TRACES_OBSERVATIONS_EVENTS
    if (
      mixpanelIntegration.exportSource === "EVENTS" ||
      mixpanelIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
    ) {
      processPromises.push(processMixpanelEvents(executionConfig));
    }

    await Promise.all(processPromises);

    // Update the last run information for the mixpanelIntegration record.
    await prisma.mixpanelIntegration.update({
      where: {
        projectId,
      },
      data: {
        lastSyncAt: executionConfig.maxTimestamp,
      },
    });
    logger.info(
      `[MIXPANEL] Mixpanel integration processing complete for project ${projectId}`,
    );
  } catch (error) {
    logger.error(
      `[MIXPANEL] Error processing Mixpanel integration for project ${projectId}`,
      error,
    );
    throw error;
  }
};
