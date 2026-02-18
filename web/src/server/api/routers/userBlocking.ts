import { z } from "zod/v4";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  blockUser,
  unblockUser,
  getBlockedUsers,
} from "@langfuse/shared/src/server";
import { traceException } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

export const userBlockingRouter = createTRPCRouter({
  blockUser: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "users:block",
      });

      try {
        await blockUser({
          projectId: input.projectId,
          userId: input.userId,
        });

        await auditLog({
          session: ctx.session,
          resourceType: "user",
          resourceId: input.userId,
          action: "block",
          after: { projectId: input.projectId, userId: input.userId },
        });

        return { success: true };
      } catch (error) {
        traceException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to block user",
        });
      }
    }),

  unblockUser: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "users:block",
      });

      try {
        await unblockUser({
          projectId: input.projectId,
          userId: input.userId,
        });

        await auditLog({
          session: ctx.session,
          resourceType: "user",
          resourceId: input.userId,
          action: "unblock",
          before: { projectId: input.projectId, userId: input.userId },
        });

        return { success: true };
      } catch (error) {
        traceException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to unblock user",
        });
      }
    }),

  getBlockedUsers: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        limit: z.number().min(1).max(1000).default(100),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "users:block",
      });

      try {
        const result = await getBlockedUsers({
          projectId: input.projectId,
          limit: input.limit,
          offset: input.offset,
        });

        return result;
      } catch (error) {
        traceException(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get blocked users",
        });
      }
    }),
});
