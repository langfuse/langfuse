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
import { recordExportVolume } from "../../services/exportVolumeMetric";
import {
  transformTraceForMixpanel,
  transformGenerationForMixpanel,
  transformScoreForMixpanel,
  transformEventForMixpanel,
} from "./transformers";
import { env } from "../../env";
import { assertLegacyExportSourceWritable } from "../exportWriteModeGuard";

const sleep = (ms: number) =>
  ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

// Throttle exports after each flush so a single project sync cannot burst the
// target Mixpanel instance with an unbounded event rate (issue #12786).
const flushWithDelay = async (mixpanel: MixpanelClient) => {
  // flush() is a no-op on an empty batch, so only throttle when we actually
  // sent something. Avoids a wasted delay when the terminal flush has nothing
  // left to send (e.g. event count is an exact multiple of the flush size).
  const hadEvents = mixpanel.getBatchSize() > 0;
  await mixpanel.flush();
  if (hadEvents) {
    await sleep(env.LANGFUSE_MIXPANEL_FLUSH_DELAY_MS);
  }
};

type MixpanelExecutionConfig = {
  projectId: string;
  projectName: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  decryptedMixpanelProjectToken: string;
  mixpanelRegion: string;
  // First attempt uses ClickHouse `auto` join algorithm. We only fall back to
  // `grace_hash` (slower, but spills to disk) on retries so an OOM on the first
  // attempt recovers without manual intervention while healthy syncs stay fast.
  useGraceHash: boolean;
};

const processMixpanelTraces = async (
  mixpanel: MixpanelClient,
  config: MixpanelExecutionConfig,
) => {
  const traces = getTracesForAnalyticsIntegrations(
    config.projectId,
    config.projectName,
    config.minTimestamp,
    config.maxTimestamp,
    { useGraceHash: config.useGraceHash },
  );

  logger.info(
    `[MIXPANEL] Sending traces for project ${config.projectId} to Mixpanel`,
  );

  let count = 0;
  for await (const trace of traces) {
    count++;
    const event = transformTraceForMixpanel(trace, config.projectId);
    mixpanel.addEvent(event);

    if (count % 1000 === 0) {
      await flushWithDelay(mixpanel);
      logger.info(
        `[MIXPANEL] Sent ${count} traces to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await flushWithDelay(mixpanel);
  logger.info(
    `[MIXPANEL] Sent ${count} traces to Mixpanel for project ${config.projectId}`,
  );
};

const processMixpanelGenerations = async (
  mixpanel: MixpanelClient,
  config: MixpanelExecutionConfig,
) => {
  const generations = getGenerationsForAnalyticsIntegrations(
    config.projectId,
    config.projectName,
    config.minTimestamp,
    config.maxTimestamp,
    { useGraceHash: config.useGraceHash },
  );

  logger.info(
    `[MIXPANEL] Sending generations for project ${config.projectId} to Mixpanel`,
  );

  let count = 0;
  for await (const generation of generations) {
    count++;
    const event = transformGenerationForMixpanel(generation, config.projectId);
    mixpanel.addEvent(event);

    if (count % 1000 === 0) {
      await flushWithDelay(mixpanel);
      logger.info(
        `[MIXPANEL] Sent ${count} generations to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await flushWithDelay(mixpanel);
  logger.info(
    `[MIXPANEL] Sent ${count} generations to Mixpanel for project ${config.projectId}`,
  );
};

const processMixpanelScores = async (
  mixpanel: MixpanelClient,
  config: MixpanelExecutionConfig,
) => {
  const scores = getScoresForAnalyticsIntegrations(
    config.projectId,
    config.projectName,
    config.minTimestamp,
    config.maxTimestamp,
    { useGraceHash: config.useGraceHash },
  );

  logger.info(
    `[MIXPANEL] Sending scores for project ${config.projectId} to Mixpanel`,
  );

  let count = 0;
  for await (const score of scores) {
    count++;
    const event = transformScoreForMixpanel(score, config.projectId);
    mixpanel.addEvent(event);

    if (count % 1000 === 0) {
      await flushWithDelay(mixpanel);
      logger.info(
        `[MIXPANEL] Sent ${count} scores to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await flushWithDelay(mixpanel);
  logger.info(
    `[MIXPANEL] Sent ${count} scores to Mixpanel for project ${config.projectId}`,
  );
};

const processMixpanelEvents = async (
  mixpanel: MixpanelClient,
  config: MixpanelExecutionConfig,
) => {
  const events = getEventsForAnalyticsIntegrations(
    config.projectId,
    config.projectName,
    config.minTimestamp,
    config.maxTimestamp,
  );

  logger.info(
    `[MIXPANEL] Sending events for project ${config.projectId} to Mixpanel`,
  );

  let count = 0;
  for await (const analyticsEvent of events) {
    count++;
    const event = transformEventForMixpanel(analyticsEvent, config.projectId);
    mixpanel.addEvent(event);

    if (count % 1000 === 0) {
      await flushWithDelay(mixpanel);
      logger.info(
        `[MIXPANEL] Sent ${count} events to Mixpanel for project ${config.projectId}`,
      );
    }
  }
  await flushWithDelay(mixpanel);
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
    include: {
      project: {
        select: { name: true },
      },
    },
  });

  if (!mixpanelIntegration) {
    logger.warn(
      `[MIXPANEL] Enabled Mixpanel integration not found for project ${projectId}`,
    );
    return;
  }

  if (!mixpanelIntegration.project) {
    logger.warn(
      `[MIXPANEL] Project not found for Mixpanel integration ${projectId}`,
    );
    return;
  }

  // Fetch relevant data and send it to Mixpanel
  const executionConfig: MixpanelExecutionConfig = {
    projectId,
    projectName: mixpanelIntegration.project.name,
    // Start from 2000-01-01 if no lastSyncAt. Workaround because 1970-01-01 leads to subtle bugs in ClickHouse
    minTimestamp: mixpanelIntegration.lastSyncAt || new Date("2000-01-01"),
    maxTimestamp: new Date(new Date().getTime() - 30 * 60 * 1000), // 30 minutes ago
    decryptedMixpanelProjectToken: decrypt(
      mixpanelIntegration.encryptedMixpanelProjectToken,
    ),
    mixpanelRegion: mixpanelIntegration.mixpanelRegion,
    useGraceHash: job.attemptsMade > 0,
  };

  try {
    // Fail loudly before exporting empty data and advancing lastSyncAt
    // (LFE-10148); the catch below logs and BullMQ retries.
    assertLegacyExportSourceWritable(
      mixpanelIntegration.exportSource,
      "Select the enriched observations export source in the Mixpanel integration settings.",
    );

    // Reuse a single client and run streams sequentially so the per-job export
    // rate stays bounded. Running the streams in parallel with one client each
    // produced an unbounded burst that overwhelmed the target (issue #12786).
    const mixpanel = new MixpanelClient({
      projectToken: executionConfig.decryptedMixpanelProjectToken,
      region: executionConfig.mixpanelRegion,
    });

    // Always include scores
    await processMixpanelScores(mixpanel, executionConfig);

    // Traces and observations - for TRACES_OBSERVATIONS and TRACES_OBSERVATIONS_EVENTS
    if (
      mixpanelIntegration.exportSource === "TRACES_OBSERVATIONS" ||
      mixpanelIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
    ) {
      await processMixpanelTraces(mixpanel, executionConfig);
      await processMixpanelGenerations(mixpanel, executionConfig);
    }

    // Events - for EVENTS and TRACES_OBSERVATIONS_EVENTS
    if (
      mixpanelIntegration.exportSource === "EVENTS" ||
      mixpanelIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
    ) {
      await processMixpanelEvents(mixpanel, executionConfig);
    }

    // Update the last run information for the mixpanelIntegration record.
    await prisma.mixpanelIntegration.update({
      where: {
        projectId,
      },
      data: {
        lastSyncAt: executionConfig.maxTimestamp,
      },
    });
    // Record gzipped on-wire export volume once the run has succeeded.
    recordExportVolume({
      integration: "mixpanel",
      bytes: mixpanel.getSerializedBytes(),
      projectId,
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
