import { auditLog } from "@/src/features/audit-logs/auditLog";
import { generateKeySet } from "@langfuse/shared/src/server";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";

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

      // Make sure the API key exists and belongs to the project the user has access to
      const apiKey = await ctx.prisma.apiKey.findFirstOrThrow({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });

      await ctx.prisma.apiKey.delete({
        where: {
          id: apiKey.id,
        },
      });

      return true;
    }),
});
