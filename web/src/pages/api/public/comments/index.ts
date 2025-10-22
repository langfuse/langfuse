import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetCommentsV1Query,
  GetCommentsV1Response,
  PostCommentsV1Body,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { validateCommentReferenceObject } from "@/src/features/comments/validateCommentReferenceObject";
import {
  LangfuseNotFoundError,
  extractMentionsFromMarkdown,
  sanitizeMentions,
  Prisma,
} from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { getUserProjectRoles } from "@/src/features/rbac/utils/userProjectRole";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Comment",
    bodySchema: PostCommentsV1Body,
    responseSchema: PostCommentsV1Response,
    fn: async ({ body, auth }) => {
      const result = await validateCommentReferenceObject({
        ctx: { prisma, auth },
        input: body,
      });

      if (result.errorMessage) {
        throw new LangfuseNotFoundError(result.errorMessage);
      }

      // Extract mentions from content (server-side, authoritative)
      const mentionsInContent = extractMentionsFromMarkdown(body.content);

      // Sanitize mentions and get valid user IDs
      let sanitizedContent = body.content;
      let validMentionedUserIds: string[] = [];

      if (mentionsInContent.length > 0) {
        // Fetch project members for validation and normalization
        const projectMembers = await getUserProjectRoles({
          projectId: auth.scope.projectId,
          orgId: auth.scope.orgId,
          searchFilter: Prisma.empty,
          filterCondition: [],
          orderBy: Prisma.empty,
        });

        // Sanitize content: validate users and normalize display names
        const sanitizationResult = sanitizeMentions(
          body.content,
          projectMembers,
        );
        sanitizedContent = sanitizationResult.sanitizedContent;
        validMentionedUserIds = sanitizationResult.validMentionedUserIds;
      }

      // Use transaction to create comment + mentions atomically
      const comment = await prisma.$transaction(async (tx) => {
        const newComment = await tx.comment.create({
          data: {
            content: sanitizedContent, // Use sanitized content
            objectId: body.objectId,
            objectType: body.objectType,
            authorUserId: body.authorUserId,
            id: v4(),
            projectId: auth.scope.projectId,
          },
        });

        // Create mention records for validated users only
        if (validMentionedUserIds.length > 0) {
          await tx.commentMention.createMany({
            data: validMentionedUserIds.map((userId) => ({
              commentId: newComment.id,
              mentionedUserId: userId,
            })),
            skipDuplicates: true,
          });
        }

        return newComment;
      });

      await auditLog({
        action: "create",
        resourceType: "comment",
        resourceId: comment.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: {
          ...comment,
          mentionedUserIds: validMentionedUserIds,
        },
      });

      return { id: comment.id };
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Comments",
    querySchema: GetCommentsV1Query,
    responseSchema: GetCommentsV1Response,
    fn: async ({ query, auth }) => {
      const { objectType, objectId, authorUserId, limit, page } = query;

      const comments = await prisma.comment.findMany({
        where: {
          projectId: auth.scope.projectId,
          objectType: objectType ?? undefined,
          objectId: objectId ?? undefined,
          authorUserId: authorUserId ?? undefined,
        },
        take: limit,
        skip: (page - 1) * limit,
      });

      const totalItems = await prisma.comment.count({
        where: {
          projectId: auth.scope.projectId,
          objectType: objectType ?? undefined,
          objectId: objectId ?? undefined,
          authorUserId: authorUserId ?? undefined,
        },
      });

      return {
        data: comments,
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / query.limit),
        },
      };
    },
  }),
});
