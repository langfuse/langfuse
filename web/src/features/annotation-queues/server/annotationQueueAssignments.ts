import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { LangfuseNotFoundError, optionalPaginationZod } from "@langfuse/shared";
import z from "zod/v4";

export const queueAssignmentRouter = createTRPCRouter({
  createMany: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        userIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueueAssignments:CUD",
      });

      // Verify the annotation queue exists and belongs to the project
      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: {
          id: input.queueId,
          projectId: input.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      // FIX: Verify all users exist and have access to the project
      const users = await ctx.prisma.user.findMany({
        where: {
          id: { in: input.userIds },
          AND: [
            {
              organizationMemberships: {
                some: {
                  orgId: ctx.session.orgId,
                },
              },
            },
            {
              projectMemberships: {
                some: {
                  projectId: input.projectId,
                  role: { not: "NONE" },
                },
              },
            },
          ],
        },
        select: { id: true },
      });

      const foundUserIds = users.map((u) => u.id);
      const missingUserIds = input.userIds.filter(
        (id) => !foundUserIds.includes(id),
      );

      // Create memberships (using createMany with skipDuplicates)
      await ctx.prisma.annotationQueueAssignment.createMany({
        data: foundUserIds.map((userId) => ({
          userId,
          projectId: input.projectId,
          annotationQueueId: input.queueId,
        })),
        skipDuplicates: true,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "annotationQueueAssignment",
        resourceId: input.queueId,
        action: "create",
        after: { addedMemberCount: foundUserIds.length },
      });

      return {
        success: true,
        addedCount: foundUserIds.length,
        invalidCount: missingUserIds.length,
      };
    }),

  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueueAssignments:CUD",
      });

      // Verify the annotation queue exists and belongs to the project
      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: {
          id: input.queueId,
          projectId: input.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      // Remove memberships
      await ctx.prisma.annotationQueueAssignment.deleteMany({
        where: {
          projectId: input.projectId,
          queueId: input.queueId,
          userId: input.userId,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "annotationQueueAssignment",
        resourceId: input.queueId,
        before: { ...input },
        action: "delete",
      });

      return {
        success: true,
      };
    }),

  byQueueId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        ...optionalPaginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueueAssignments:read",
      });

      // Verify the annotation queue exists and belongs to the project
      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: {
          id: input.queueId,
          projectId: input.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      const assignments = await ctx.prisma.annotationQueueAssignment.findMany({
        where: {
          projectId: input.projectId,
          queueId: input.queueId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: input.limit ?? undefined,
        skip: input.page ? input.page * (input.limit ?? 0) : undefined,
      });

      const totalCount = await ctx.prisma.annotationQueueAssignment.count({
        where: {
          projectId: input.projectId,
          queueId: input.queueId,
        },
      });

      return {
        assignments: assignments.map((assignment) => ({
          id: assignment.user.id,
          name: assignment.user.name,
          email: assignment.user.email,
        })),
        totalCount,
      };
    }),
});
