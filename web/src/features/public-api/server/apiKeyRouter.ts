import { auditLog } from "@/src/features/audit-logs/auditLog";
import { generateKeySet } from "@langfuse/shared/src/server";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { redis } from "@langfuse/shared/src/server";

export const apiKeysRouter = createTRPCRouter({
  byProjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:read",
      });

      return ctx.prisma.apiKey.findMany({
        where: {
          projectId: input.projectId,
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
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:create",
      });

      const { pk, sk, hashedSk, displaySk } = await generateKeySet();

      const apiKey = await ctx.prisma.apiKey.create({
        data: {
          projectId: input.projectId,
          publicKey: pk,
          hashedSecretKey: hashedSk,
          displaySecretKey: displaySk,
          note: input.note,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "apiKey",
        resourceId: apiKey.id,
        action: "create",
      });

      return {
        id: apiKey.id,
        createdAt: apiKey.createdAt,
        note: input.note,
        publicKey: apiKey.publicKey,
        secretKey: sk,
        displaySecretKey: displaySk,
      };
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:delete",
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
      );
    }),
});
