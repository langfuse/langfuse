import { Job } from "bullmq";

import { logger, QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { handleCommentMentionNotification } from "../features/notifications/commentMentionHandler";

export const notificationQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.NotificationQueue]>,
) => {
  try {
    const { type, ...payload } = job.data.payload;
    const projectId = payload.projectId;

    logger.info("Processing notification job", {
      type,
      projectId,
      jobId: job.id,
    });

    switch (type) {
      case "COMMENT_MENTION":
        await handleCommentMentionNotification(payload);
        break;
      // Future notification types can be added here
      default:
        logger.warn(`Unknown notification type: ${type}`);
    }

    logger.info("Finished processing notification job", {
      type,
      projectId,
      jobId: job.id,
    });

    return true;
  } catch (error) {
    logger.error("Failed to process notification job", {
      error,
      jobId: job.id,
      payload: job.data.payload,
      projectId: job.data.payload.projectId,
    });
    throw error;
  }
};
