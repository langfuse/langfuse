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
import { LangfuseNotFoundError } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Comment",
    bodySchema: PostCommentsV1Body,
    responseSchema: PostCommentsV1Response,
    fn: async ({ body, auth }) => {
      const result = await validateCommentReferenceObject({
        ctx: { prisma, auth },
        input: {
          ...body,
          projectId: auth.scope.projectId,
        },
      });

      if (result.errorMessage) {
        throw new LangfuseNotFoundError(result.errorMessage);
      }

      // Create comment with content as-is (no mention processing, no inline positioning)
      const comment = await prisma.comment.create({
        data: {
          content: body.content,
          objectId: body.objectId,
          objectType: body.objectType,
          authorUserId: body.authorUserId,
          id: v4(),
          projectId: auth.scope.projectId,
        },
      });

      await auditLog({
        action: "create",
        resourceType: "comment",
        resourceId: comment.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: comment,
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
        data: comments.map(
          // Exclude inline positioning fields from public API
          ({ dataField, path, rangeStart, rangeEnd, ...rest }) => rest,
        ),
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
