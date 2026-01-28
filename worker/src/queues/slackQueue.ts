import { Job } from "bullmq";

import {
  logger,
  QueueName,
  TQueueJobTypes,
  SlackService,
  cacheSlackChannels,
  traceException,
} from "@langfuse/shared/src/server";

export const slackChannelFetchQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.SlackChannelFetchQueue]>,
) => {
  const { projectId } = job.data.payload;

  try {
    logger.info("Processing Slack channel fetch job", {
      projectId,
      jobId: job.id,
    });

    const slackService = SlackService.getInstance();
    const client = await slackService.getWebClientForProject(projectId);
    const channels = await slackService.getChannels(client);

    // Store channels in Redis cache
    await cacheSlackChannels(projectId, channels);

    logger.info("Finished Slack channel fetch job", {
      projectId,
      jobId: job.id,
      channelCount: channels.length,
    });

    return true;
  } catch (error) {
    logger.error("Failed Slack channel fetch job", {
      error,
      projectId,
      jobId: job.id,
    });
    traceException(error);
    throw error;
  }
};
