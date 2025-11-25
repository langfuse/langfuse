import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod/v4";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { redis } from "@langfuse/shared/src/server";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { StringNoHTML } from "@langfuse/shared";

export const projectApiKeysRouter = createTRPCRouter({
  byProjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:read",
      });

      return ctx.prisma.apiKey.findMany({
        where: {
          projectId: input.projectId,
          scope: "PROJECT",
        },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          lastUsedAt: true,
          note: true,
          publicKey: true,
          displaySecretKey: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        note: StringNoHTML.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:CUD",
      });

      const apiKeyMeta = await createAndAddApiKeysToDb({
        prisma: ctx.prisma,
        entityId: input.projectId,
        note: input.note,
        scope: "PROJECT",
      });

      await auditLog({
        session: ctx.session,
        resourceType: "apiKey",
        resourceId: apiKeyMeta.id,
        action: "create",
      });

      return apiKeyMeta;
    }),
  updateNote: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        keyId: z.string(),
        note: StringNoHTML,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:CUD",
      });

      await auditLog({
        session: ctx.session,
        resourceType: "apiKey",
        resourceId: input.keyId,
        action: "update",
      });

      await ctx.prisma.apiKey.update({
        where: {
          id: input.keyId,
          projectId: input.projectId,
        },
        data: {
          note: input.note,
        },
      });

      // do not return the api key
      return;
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:CUD",
      });
      await auditLog({
        session: ctx.session,
        resourceType: "apiKey",
        resourceId: input.id,
        action: "delete",
      });

      return await new ApiAuthService(ctx.prisma, redis).deleteApiKey(
        input.id,
        input.projectId,
        "PROJECT",
      );
    }),
});
