import { env } from "../../env";
import {
  logger,
  sendCommentMentionEmail,
  getObservationById,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Prisma } from "@langfuse/shared";
import { getUserProjectRoles } from "@langfuse/shared/src/server";
import { type NotificationEventType } from "@langfuse/shared/src/server";

type CommentMentionPayload = Omit<
  Extract<NotificationEventType, { type: "COMMENT_MENTION" }>,
  "type"
>;

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: unknown }).code === "P2002";

/**
 * Insert the unique (commentId, userId) row *before* SMTP so concurrent
 * workers cannot both send. P2002 means another attempt already claimed
 * (or completed) this recipient — skip without sending.
 */
async function tryClaimCommentMentionEmailSend(
  commentId: string,
  userId: string,
): Promise<boolean> {
  try {
    await prisma.commentMentionEmail.create({
      data: { commentId, userId },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Drop the claim when SMTP did not deliver so a later BullMQ retry can
 * insert again and send. Failures here are logged; a stuck row can skip
 * a retry (prefer that over sending a duplicate).
 */
async function releaseCommentMentionEmailClaim(
  commentId: string,
  userId: string,
): Promise<void> {
  try {
    await prisma.commentMentionEmail.deleteMany({
      where: { commentId, userId },
    });
  } catch (error) {
    logger.error(
      `Failed to release comment mention email claim for comment ${commentId} user ${userId}`,
      error,
    );
  }
}

async function buildCommentLink(opts: {
  baseUrl: string;
  projectId: string;
  comment: {
    objectType: "OBSERVATION" | "PROMPT" | "TRACE" | "SESSION";
    objectId: string;
  };
  commentId: string;
  userIdForLogging: string;
}): Promise<string | null> {
  const { baseUrl, projectId, comment, commentId, userIdForLogging } = opts;
  const commonParams = `comments=open&commentObjectType=${encodeURIComponent(comment.objectType)}&commentObjectId=${encodeURIComponent(comment.objectId)}`;

  switch (comment.objectType) {
    case "OBSERVATION": {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const observation = await getObservationById({
        id: comment.objectId,
        projectId,
      });
      if (!observation || !observation.traceId) {
        logger.warn(
          `Observation ${comment.objectId} not found or has no traceId. Skipping notification for user ${userIdForLogging}.`,
        );
        return null;
      }
      return `${baseUrl}/project/${encodeURIComponent(projectId)}/traces/${encodeURIComponent(observation.traceId)}?observation=${encodeURIComponent(comment.objectId)}&${commonParams}#comment-${encodeURIComponent(commentId)}`;
    }
    case "PROMPT": {
      const prompt = await prisma.prompt.findUnique({
        where: { id: comment.objectId, projectId },
        select: { name: true, version: true },
      });
      if (!prompt) {
        logger.warn(
          `Prompt ${comment.objectId} not found. Skipping notification for user ${userIdForLogging}.`,
        );
        return null;
      }
      const encodedPromptName = encodeURIComponent(prompt.name);
      return `${baseUrl}/project/${encodeURIComponent(projectId)}/prompts/${encodedPromptName}?version=${encodeURIComponent(prompt.version)}&${commonParams}#comment-${encodeURIComponent(commentId)}`;
    }
    case "TRACE":
    case "SESSION":
    default: {
      return `${baseUrl}/project/${encodeURIComponent(projectId)}/${encodeURIComponent(comment.objectType.toLowerCase())}s/${encodeURIComponent(comment.objectId)}?${commonParams}#comment-${encodeURIComponent(commentId)}`;
    }
  }
}

export async function handleCommentMentionNotification(
  payload: CommentMentionPayload,
) {
  const { commentId, projectId, mentionedUserIds } = payload;

  logger.info(
    `Processing comment mention notification for comment ${commentId} in project ${projectId}`,
  );

  try {
    // CRITICAL: Always include projectId in query to prevent cross-project data leakage
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        projectId: projectId, // Must match projectId from payload
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            orgId: true,
          },
        },
      },
    });

    if (!comment) {
      logger.warn(
        `Comment ${commentId} not found in project ${projectId}. Skipping notification processing.`,
      );
      return;
    }

    const allUserIds = comment.authorUserId
      ? [comment.authorUserId, ...mentionedUserIds]
      : mentionedUserIds;

    const projectUsers = await getUserProjectRoles({
      projectId: projectId,
      orgId: comment.project.orgId,
      filterCondition: [
        {
          column: "userId",
          operator: "any of",
          value: allUserIds,
          type: "stringOptions",
        },
      ],
      searchFilter: Prisma.empty,
      orderBy: Prisma.empty,
    });

    // Create lookup map for O(1) access
    const userMap = new Map(projectUsers.map((u) => [u.id, u]));

    // Get author name if author is a project/org member
    let authorName: string | undefined = undefined;
    if (comment.authorUserId && userMap.has(comment.authorUserId)) {
      const author = userMap.get(comment.authorUserId)!;
      authorName = author.name ?? author.email ?? undefined;
    }

    // Build comment preview once (truncate + strip mention markdown)
    const commentPreview = (() => {
      const truncated =
        comment.content.length > 500
          ? comment.content.substring(0, 497) + "..."
          : comment.content;
      // Convert @[DisplayName](user:userId) to @DisplayName
      return truncated.replace(/@\[([^\]]+)\]\(user:[^)]+\)/g, "@$1");
    })();

    // Process each mentioned user. Per-user failures are collected so the rest
    // of the loop can finish; the job then throws so BullMQ retries only the
    // recipients whose unique claim was released (or never inserted).
    const failedUserIds: string[] = [];

    for (const userId of mentionedUserIds) {
      let claimed = false;
      try {
        // Verify user has access to the project (from our single query above)
        if (!userMap.has(userId)) {
          logger.info(
            `User ${userId} is not a member of project ${projectId} or its organization. Skipping notification to prevent information leakage.`,
          );
          continue;
        }

        const mentionedUser = userMap.get(userId)!;

        if (!mentionedUser.email) {
          logger.warn(`User ${userId} has no email. Skipping notification.`);
          continue;
        }

        // Check notification preference (default: enabled)
        // If preference exists and is disabled, skip
        // If user/project was deleted, the preference won't exist (cascade delete)
        const preference = await prisma.notificationPreference.findUnique({
          where: {
            userId_projectId_channel_type: {
              userId,
              projectId,
              channel: "EMAIL",
              type: "COMMENT_MENTION",
            },
          },
        });

        if (preference && !preference.enabled) {
          logger.info(
            `User ${userId} has disabled email notifications for comment mentions in project ${projectId}. Skipping.`,
          );
          continue;
        }

        // Construct comment link using NEXTAUTH_URL (which includes basePath if configured)
        const baseUrl = env.NEXTAUTH_URL || "http://localhost:3000";

        // Construct URL based on object type
        const commentLink = await buildCommentLink({
          baseUrl,
          projectId,
          comment: {
            objectType: comment.objectType,
            objectId: comment.objectId,
          },
          commentId,
          userIdForLogging: userId,
        });
        if (!commentLink) {
          continue;
        }

        // Claim before SMTP so overlapping jobs cannot both send. Unique
        // (commentId, userId) is the lock; P2002 means skip.
        claimed = await tryClaimCommentMentionEmailSend(commentId, userId);
        if (!claimed) {
          logger.info(
            `Comment mention email already sent for comment ${commentId} to user ${userId}. Skipping.`,
          );
          continue;
        }

        const settingsLink = `${baseUrl}/project/${encodeURIComponent(projectId)}/settings/notifications`;

        const { delivered } = await sendCommentMentionEmail({
          env: {
            EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
            SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
          },
          mentionedUserName: mentionedUser.name || mentionedUser.email,
          mentionedUserEmail: mentionedUser.email,
          authorName,
          projectName: comment.project.name,
          commentPreview,
          commentLink,
          settingsLink,
        });

        if (!delivered) {
          await releaseCommentMentionEmailClaim(commentId, userId);
          claimed = false;
          continue;
        }

        logger.info(
          `Comment mention email sent successfully for comment ${commentId} to user ${userId}`,
        );
      } catch (error) {
        if (claimed) {
          await releaseCommentMentionEmailClaim(commentId, userId);
        }
        logger.error(
          `Failed to send comment mention notification to user ${userId}`,
          error,
        );
        failedUserIds.push(userId);
      }
    }

    if (failedUserIds.length > 0) {
      throw new Error(
        `Failed to send comment mention emails for comment ${commentId} to ${failedUserIds.length} user(s): ${failedUserIds.join(", ")}`,
      );
    }

    logger.info(
      `Completed processing comment mention notification for comment ${commentId}`,
    );
  } catch (error) {
    logger.error(
      `Failed to process comment mention notification for comment ${commentId}`,
      error,
    );
    throw error;
  }
}
