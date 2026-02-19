import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  LangfuseNotFoundError,
  optionalPaginationZod,
  Prisma,
} from "@langfuse/shared";
import { getUserProjectRoles } from "@langfuse/shared/src/server";
import partition from "lodash/partition";
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

      // Verify the users exist and have access to the project
      const users = await getUserProjectRoles({
        projectId: input.projectId,
        orgId: ctx.session.orgId,
        filterCondition: [
          {
            column: "userId",
            operator: "any of",
            value: input.userIds,
            type: "stringOptions",
          },
        ],
        searchFilter: Prisma.empty,
        orderBy: Prisma.empty,
      });

      // Create a Set of valid user IDs for efficient lookup
      const validUserIdSet = new Set(users.map((u) => u.id));

      // Partition the input user IDs into valid and invalid using lodash
      const [validUserIds, invalidUserIds] = partition(
        input.userIds,
        (userId) => validUserIdSet.has(userId),
      );

      // Create assignments (using createMany with skipDuplicates)
      await ctx.prisma.annotationQueueAssignment.createMany({
        data: validUserIds.map((userId) => ({
          userId,
          projectId: input.projectId,
          queueId: input.queueId,
        })),
        skipDuplicates: true,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "annotationQueueAssignment",
        resourceId: input.queueId,
        action: "create",
        after: { addedMemberCount: validUserIds.length },
      });

      return {
        success: true,
        addedCount: validUserIds.length,
        skippedCount: invalidUserIds.length,
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
