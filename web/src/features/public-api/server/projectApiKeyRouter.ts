import { auditLog } from "@/src/features/audit-logs/server";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { redis } from "@langfuse/shared/src/server";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { LangfuseNotFoundError, StringNoHTML } from "@langfuse/shared";
import { ProjectId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { apiKeyCreationRoleSchema } from "@/src/features/public-api/server/apiKeyCreationRoleSchema";

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
          isInAppAgentKey: false,
        },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          lastUsedAt: true,
          note: true,
          publicKey: true,
          displaySecretKey: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          createdByApiKey: {
            select: {
              id: true,
              publicKey: true,
            },
          },
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
        name: StringNoHTML.optional(),
        role: apiKeyCreationRoleSchema("project"),
        expiresAt: z
          .date()
          .nullish()
          .refine((date) => date == null || date.getTime() > Date.now(), {
            message: "Expiration date must be in the future",
          }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:CUD",
      });

      const apiKeyMeta = await createApiKey(ctx.prisma, {
        owner: ProjectId(input.projectId),
        role: SystemRoleId(input.role),
        createdBy: UserId(ctx.session.user.id),
        name: input.name,
        expiresAt: input.expiresAt,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "apiKey",
        resourceId: apiKeyMeta.id,
        action: "create",
        after: { role: input.role, expiresAt: input.expiresAt ?? null },
      });

      return apiKeyMeta;
    }),
  updateName: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        keyId: z.string(),
        name: StringNoHTML,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "apiKeys:CUD",
      });

      const apiKey = await ctx.prisma.apiKey.findFirst({
        where: {
          id: input.keyId,
          projectId: input.projectId,
          isInAppAgentKey: false,
        },
      });

      if (!apiKey) {
        throw new LangfuseNotFoundError("API key not found");
      }

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
          isInAppAgentKey: false,
        },
        data: {
          note: input.name,
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
      const apiKey = await ctx.prisma.apiKey.findFirst({
        where: {
          id: input.id,
          projectId: input.projectId,
          scope: "PROJECT",
        },
      });

      if (!apiKey) {
        throw new LangfuseNotFoundError("API key not found");
      }

      if (apiKey.isInAppAgentKey) return false;

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
