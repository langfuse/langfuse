import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod/v4";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { redis } from "@langfuse/shared/src/server";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server/auth/apiKeys";

export const organizationApiKeysRouter = createTRPCRouter({
  byOrganizationId: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:CRUD_apiKeys",
      });

      return ctx.prisma.apiKey.findMany({
        where: {
          orgId: input.orgId,
          scope: "ORGANIZATION",
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
  create: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:CRUD_apiKeys",
      });

      const apiKeyMeta = await createAndAddApiKeysToDb({
        prisma: ctx.prisma,
        entityId: input.orgId,
        note: input.note,
        scope: "ORGANIZATION",
      });

      await auditLog({
        session: ctx.session,
        resourceType: "apiKey",
        resourceId: apiKeyMeta.id,
        action: "create",
      });

      return apiKeyMeta;
    }),
  updateNote: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        keyId: z.string(),
        note: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:CRUD_apiKeys",
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
          orgId: input.orgId,
        },
        data: {
          note: input.note,
        },
      });

      // do not return the api key
      return;
    }),
  delete: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:CRUD_apiKeys",
      });
      await auditLog({
        session: ctx.session,
        resourceType: "apiKey",
        resourceId: input.id,
        action: "delete",
      });

      return await new ApiAuthService(ctx.prisma, redis).deleteApiKey(
        input.id,
        input.orgId,
        "ORGANIZATION",
      );
    }),
});
