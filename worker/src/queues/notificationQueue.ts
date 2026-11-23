import { Job } from "bullmq";

import {
  logger,
  type NotificationEventType,
  QueueName,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { handleCommentMentionNotification } from "../features/notifications/commentMentionHandler";
import { handleGatewayInvitationNotification } from "../features/notifications/gatewayInvitationHandler";
import { handleGatewaySpendLimitNotification } from "../features/notifications/gatewaySpendLimitHandler";

function notificationScope(payload: NotificationEventType) {
  return "projectId" in payload
    ? { projectId: payload.projectId }
    : { orgId: payload.orgId };
}

export const notificationQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.NotificationQueue]>,
) => {
  const { payload } = job.data;
  const logContext = {
    type: payload.type,
    ...notificationScope(payload),
    jobId: job.id,
  };
  try {
    logger.info("Processing notification job", logContext);

    switch (payload.type) {
      case "COMMENT_MENTION":
        await handleCommentMentionNotification(payload);
        break;
      case "AI_GATEWAY_INVITATION":
        await handleGatewayInvitationNotification(payload);
        break;
      case "AI_GATEWAY_SPEND_LIMIT_REACHED":
      case "AI_GATEWAY_SPEND_LIMIT_ALERT":
        await handleGatewaySpendLimitNotification(payload);
        break;
      // Future notification types can be added here
      default:
        logger.warn(`Unknown notification type: ${logContext.type}`);
    }

    logger.info("Finished processing notification job", logContext);

    return true;
  } catch (error) {
    logger.error("Failed to process notification job", {
      ...logContext,
      error,
    });
    throw error;
  }
};
