import { auditLog } from "@/src/features/audit-logs/server";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { redis } from "@langfuse/shared/src/server";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { createApiKey } from "@langfuse/shared/src/server/auth/apiKeys";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { apiKeyCreationRoleSchema } from "@/src/features/public-api/server/apiKeyCreationRoleSchema";

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
  create: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        name: z.string().optional(),
        role: apiKeyCreationRoleSchema("organization"),
        expiresAt: z
          .date()
          .nullish()
          .refine((date) => date == null || date.getTime() > Date.now(), {
            message: "Expiration date must be in the future",
          }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:CRUD_apiKeys",
      });
      // Issuing organization-scoped keys is a paid feature. Reads and deletes
      // stay ungated so a downgraded organization can still revoke keys that
      // were issued while it was entitled.
      throwIfNoEntitlement({
        entitlement: "admin-api",
        sessionUser: ctx.session.user,
        orgId: input.orgId,
      });

      const apiKeyMeta = await createApiKey(ctx.prisma, {
        owner: OrganizationId(input.orgId),
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
        after: {
          role: input.role,
          expiresAt: input.expiresAt ?? null,
        },
      });

      return apiKeyMeta;
    }),
  updateName: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        keyId: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:CRUD_apiKeys",
      });

      const apiKey = await ctx.prisma.apiKey.findFirst({
        where: {
          id: input.keyId,
          orgId: input.orgId,
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
          orgId: input.orgId,
          isInAppAgentKey: false,
        },
        data: {
          note: input.name,
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
      const apiKey = await ctx.prisma.apiKey.findFirst({
        where: {
          id: input.id,
          orgId: input.orgId,
          scope: "ORGANIZATION",
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
        input.orgId,
        "ORGANIZATION",
      );
    }),
});
