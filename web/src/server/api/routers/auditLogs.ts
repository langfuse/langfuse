import { z } from "zod";
import { createTRPCRouter, protectedProjectProcedure } from "../trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { paginationZod } from "@langfuse/shared";

export const auditLogsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ ctx, input }) => {
      // Check if user has access to audit logs feature
      throwIfNoEntitlement({
        entitlement: "audit-logs",
        sessionUser: ctx.session.user,
        projectId: input.projectId,
      });

      // Check if user has access to the project
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "auditLogs:read",
      });

      const [auditLogs, totalCount] = await Promise.all([
        ctx.prisma.auditLog.findMany({
          where: {
            projectId: input.projectId,
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: input.page * input.limit,
          take: input.limit,
        }),
        ctx.prisma.auditLog.count({
          where: {
            projectId: input.projectId,
          },
        }),
      ]);

      // Fetch user information for each audit log
      const userIds = [...new Set(auditLogs.map((log) => log.userId))];
      const users = await ctx.prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
          organizationMemberships: {
            some: {
              organization: {
                projects: {
                  some: {
                    id: input.projectId,
                  },
                },
              },
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      });

      const userMap = new Map(users.map((user) => [user.id, user]));

      return {
        data: auditLogs.map((log) => ({
          ...log,
          user: userMap.get(log.userId) ?? {
            id: log.userId,
            name: null,
            email: null,
            image: null,
          },
        })),
        totalCount,
      };
    }),
});
