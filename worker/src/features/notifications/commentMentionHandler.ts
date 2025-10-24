import { env } from "../../env";
import {
  logger,
  sendCommentMentionEmail,
  getObservationById,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Prisma } from "@langfuse/shared";
import { getUserProjectRoles } from "@langfuse/shared/src/features/rbac";

type CommentMentionPayload = {
  commentId: string;
  projectId: string;
  mentionedUserIds: string[];
};

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

    // Fetch all users (author + mentioned users) with single efficient query
    // This replaces ~18-24 individual database queries with 1 SQL query
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

    // Process each mentioned user
    for (const userId of mentionedUserIds) {
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

        // Truncate comment content for preview (500 chars)
        let commentPreview =
          comment.content.length > 500
            ? comment.content.substring(0, 497) + "..."
            : comment.content;

        // Strip markdown link syntax from mentions for plain text display
        // Convert @[DisplayName](user:userId) to @DisplayName
        commentPreview = commentPreview.replace(
          /@\[([^\]]+)\]\(user:[^)]+\)/g,
          "@$1",
        );

        // Construct comment link using NEXTAUTH_URL (which includes basePath if configured)
        const baseUrl = env.NEXTAUTH_URL || "http://localhost:3000";

        // Construct URL based on object type
        let commentLink: string;
        const commonParams = `comments=open&commentObjectType=${encodeURIComponent(comment.objectType)}&commentObjectId=${encodeURIComponent(comment.objectId)}`;

        switch (comment.objectType) {
          case "OBSERVATION": {
            // For observations, link to trace page with observation query param
            const observation = await getObservationById({
              id: comment.objectId,
              projectId,
            });
            if (!observation || !observation.traceId) {
              logger.warn(
                `Observation ${comment.objectId} not found or has no traceId. Skipping notification for user ${userId}.`,
              );
              continue;
            }
            commentLink = `${baseUrl}/project/${encodeURIComponent(projectId)}/traces/${encodeURIComponent(observation.traceId)}?observation=${encodeURIComponent(comment.objectId)}&${commonParams}#comment-${encodeURIComponent(commentId)}`;
            break;
          }
          case "PROMPT": {
            // For prompts, use prompt name and version instead of ID
            const prompt = await prisma.prompt.findUnique({
              where: { id: comment.objectId, projectId },
              select: { name: true, version: true },
            });
            if (!prompt) {
              logger.warn(
                `Prompt ${comment.objectId} not found. Skipping notification for user ${userId}.`,
              );
              continue;
            }
            const encodedPromptName = encodeURIComponent(prompt.name);
            commentLink = `${baseUrl}/project/${encodeURIComponent(projectId)}/prompts/${encodedPromptName}?version=${encodeURIComponent(prompt.version)}&${commonParams}#comment-${encodeURIComponent(commentId)}`;
            break;
          }
          case "TRACE":
          case "SESSION":
          default: {
            // For traces and sessions, use standard URL pattern
            commentLink = `${baseUrl}/project/${encodeURIComponent(projectId)}/${encodeURIComponent(comment.objectType.toLowerCase())}s/${encodeURIComponent(comment.objectId)}?${commonParams}#comment-${encodeURIComponent(commentId)}`;
            break;
          }
        }

        const settingsLink = `${baseUrl}/project/${encodeURIComponent(projectId)}/settings/notifications`;

        // Send email
        await sendCommentMentionEmail({
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

        logger.info(
          `Comment mention email sent successfully for comment ${commentId} to user ${userId}`,
        );
      } catch (error) {
        logger.error(
          `Failed to send comment mention notification to user ${userId}`,
          error,
        );
        // Continue processing other users even if one fails
      }
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
