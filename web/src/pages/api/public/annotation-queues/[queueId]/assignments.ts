import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { prisma } from "@langfuse/shared/src/db";
import { LangfuseNotFoundError, Prisma } from "@langfuse/shared";
import {
  AnnotationQueueAssignmentQuery,
  CreateAnnotationQueueAssignmentBody,
  CreateAnnotationQueueAssignmentResponse,
  DeleteAnnotationQueueAssignmentBody,
  DeleteAnnotationQueueAssignmentResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { getUserProjectRoles } from "@langfuse/shared/src/server";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Annotation Queue Assignment",
    bodySchema: CreateAnnotationQueueAssignmentBody,
    querySchema: AnnotationQueueAssignmentQuery,
    responseSchema: CreateAnnotationQueueAssignmentResponse,
    fn: async ({ query, body, auth }) => {
      const { userId } = body;

      // Verify the annotation queue exists and belongs to the project
      const queue = await prisma.annotationQueue.findUnique({
        where: {
          id: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      // Verify the user exists and has access to the project
      const user = await getUserProjectRoles({
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        filterCondition: [
          {
            column: "userId",
            operator: "any of",
            value: [userId],
            type: "stringOptions",
          },
        ],
        searchFilter: Prisma.empty,
        limit: 1,
        page: 0,
        orderBy: Prisma.empty,
      });

      if (!user || user.length === 0) {
        throw new LangfuseNotFoundError(
          "User not found or not authorized for this project",
        );
      }

      // Create the assignment (upsert to handle duplicates gracefully)
      await prisma.annotationQueueAssignment.upsert({
        where: {
          projectId_queueId_userId: {
            projectId: auth.scope.projectId,
            queueId: query.queueId,
            userId,
          },
        },
        create: {
          userId,
          projectId: auth.scope.projectId,
          queueId: query.queueId,
        },
        update: {},
      });

      return {
        userId: userId,
        projectId: auth.scope.projectId,
        queueId: query.queueId,
      };
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Annotation Queue Assignment",
    querySchema: AnnotationQueueAssignmentQuery,
    bodySchema: DeleteAnnotationQueueAssignmentBody,
    responseSchema: DeleteAnnotationQueueAssignmentResponse,
    fn: async ({ query, body, auth }) => {
      const { userId } = body;

      // Verify the annotation queue exists and belongs to the project
      const queue = await prisma.annotationQueue.findUnique({
        where: {
          id: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      // Delete the assignment if it exists
      try {
        await prisma.annotationQueueAssignment.delete({
          where: {
            projectId_queueId_userId: {
              projectId: auth.scope.projectId,
              queueId: query.queueId,
              userId,
            },
          },
        });
      } catch (error) {
        // If the record doesn't exist, that's fine - we still return success
        // Only catch NotFound errors, re-throw other errors
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code !== "P2025"
        ) {
          throw error;
        }
      }

      return {
        success: true,
      };
    },
  }),
});
