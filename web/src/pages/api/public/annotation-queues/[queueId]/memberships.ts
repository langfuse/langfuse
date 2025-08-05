import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { prisma } from "@langfuse/shared/src/db";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  AnnotationQueueMembershipQuery,
  CreateAnnotationQueueMembershipBody,
  CreateAnnotationQueueMembershipResponse,
  DeleteAnnotationQueueMembershipBody,
  DeleteAnnotationQueueMembershipResponse,
} from "@/src/features/public-api/types/annotation-queues";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Annotation Queue Membership",
    bodySchema: CreateAnnotationQueueMembershipBody,
    querySchema: AnnotationQueueMembershipQuery,
    responseSchema: CreateAnnotationQueueMembershipResponse,
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
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          AND: [
            {
              organizationMemberships: {
                some: {
                  orgId: auth.scope.orgId,
                },
              },
            },
            {
              projectMemberships: {
                some: {
                  projectId: auth.scope.projectId,
                  role: { not: "NONE" },
                },
              },
            },
          ],
        },
        select: { id: true },
      });

      if (!user) {
        throw new LangfuseNotFoundError("User not found");
      }

      // Create the membership (upsert to handle duplicates gracefully)
      await prisma.annotationQueueMembership.upsert({
        where: {
          projectId_annotationQueueId_userId: {
            projectId: auth.scope.projectId,
            annotationQueueId: query.queueId,
            userId,
          },
        },
        create: {
          userId,
          projectId: auth.scope.projectId,
          annotationQueueId: query.queueId,
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
    name: "Delete Annotation Queue Membership",
    querySchema: AnnotationQueueMembershipQuery,
    bodySchema: DeleteAnnotationQueueMembershipBody,
    responseSchema: DeleteAnnotationQueueMembershipResponse,
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

      // Delete the membership if it exists
      try {
        await prisma.annotationQueueMembership.delete({
          where: {
            projectId_annotationQueueId_userId: {
              projectId: auth.scope.projectId,
              annotationQueueId: query.queueId,
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
