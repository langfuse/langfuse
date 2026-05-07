import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { SsoProviderSchema } from "@/src/ee/features/multi-tenant-sso/types";
import { validateSsoConfig } from "@/src/ee/features/multi-tenant-sso/validateSsoConfig";
import { encrypt } from "@langfuse/shared/encryption";
import { TRPCError } from "@trpc/server";
import * as z from "zod";

const SSO_CONFIG_ENTITLEMENT = "cloud-multi-tenant-sso" as const;

type SsoConfigRow = {
  domain: string;
  authProvider: string;
  authConfig: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

// Strip clientSecret from any nested authConfig before sending to the client.
// The encrypted secret stays server-side; the form re-prompts on update.
const maskAuthConfig = (
  authConfig: SsoConfigRow["authConfig"],
): Record<string, unknown> | null => {
  if (!authConfig) return null;
  const { clientSecret: _omit, ...rest } = authConfig as {
    clientSecret?: unknown;
  } & Record<string, unknown>;
  return rest;
};

export const ssoConfigRouter = createTRPCRouter({
  get: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });
      throwIfNoEntitlement({
        sessionUser: ctx.session.user,
        orgId: input.orgId,
        entitlement: SSO_CONFIG_ENTITLEMENT,
      });

      const verifiedDomains = await ctx.prisma.verifiedDomain.findMany({
        where: {
          organizationId: input.orgId,
          verifiedAt: { not: null },
        },
        select: { domain: true },
      });

      if (verifiedDomains.length === 0) return [];

      const rows = await ctx.prisma.ssoConfig.findMany({
        where: { domain: { in: verifiedDomains.map((d) => d.domain) } },
      });

      return rows.map((row) => ({
        domain: row.domain,
        authProvider: row.authProvider,
        authConfig: maskAuthConfig(
          row.authConfig as SsoConfigRow["authConfig"],
        ),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    }),

  save: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        payload: SsoProviderSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });
      throwIfNoEntitlement({
        sessionUser: ctx.session.user,
        orgId: input.orgId,
        entitlement: SSO_CONFIG_ENTITLEMENT,
      });

      const { domain, authProvider, authConfig } = input.payload;

      const verifiedDomain = await ctx.prisma.verifiedDomain.findFirst({
        where: {
          domain,
          organizationId: input.orgId,
          verifiedAt: { not: null },
        },
      });
      if (!verifiedDomain) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Domain "${domain}" is not verified for this organization. Verify the domain first in the Verified Domains section.`,
        });
      }

      // Pre-flight the IdP discovery doc so misconfigurations surface here
      // instead of locking out users at first sign-in. Throws TRPCError with
      // PRECONDITION_FAILED on any failure.
      await validateSsoConfig(input.payload);

      const existing = await ctx.prisma.ssoConfig.findUnique({
        where: { domain },
      });

      // Preserve advanced authConfig fields the self-service form doesn't
      // surface (scope, idToken, tokenEndpointAuthMethod, idTokenSignedResponseAlg)
      // when the admin re-saves the same provider — typically just to rotate a
      // secret. Without this merge, fields originally set via the legacy
      // support endpoint would silently disappear and break sign-in. Switching
      // providers is treated as an intentional reset (Custom-only fields like
      // `name` or `scope` would be incompatible with the new provider).
      const mergedAuthConfig =
        existing &&
        existing.authProvider === authProvider &&
        authConfig &&
        existing.authConfig
          ? {
              ...(existing.authConfig as Record<string, unknown>),
              ...authConfig,
            }
          : authConfig;

      const encryptedAuthConfig = mergedAuthConfig
        ? {
            ...mergedAuthConfig,
            clientSecret: encrypt(
              (mergedAuthConfig as { clientSecret: string }).clientSecret,
            ),
          }
        : null;

      const upserted = await ctx.prisma.ssoConfig.upsert({
        where: { domain },
        create: {
          domain,
          authProvider,
          authConfig: encryptedAuthConfig ?? undefined,
        },
        update: {
          authProvider,
          authConfig: encryptedAuthConfig ?? undefined,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "ssoConfig",
        resourceId: upserted.domain,
        action: existing ? "update" : "create",
        before: existing
          ? {
              domain: existing.domain,
              authProvider: existing.authProvider,
              authConfig: maskAuthConfig(
                existing.authConfig as SsoConfigRow["authConfig"],
              ),
            }
          : undefined,
        after: {
          domain: upserted.domain,
          authProvider: upserted.authProvider,
          authConfig: maskAuthConfig(
            upserted.authConfig as SsoConfigRow["authConfig"],
          ),
        },
      });

      return {
        domain: upserted.domain,
        authProvider: upserted.authProvider,
        authConfig: maskAuthConfig(
          upserted.authConfig as SsoConfigRow["authConfig"],
        ),
        createdAt: upserted.createdAt,
        updatedAt: upserted.updatedAt,
      };
    }),

  delete: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), domain: z.string() }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });
      throwIfNoEntitlement({
        sessionUser: ctx.session.user,
        orgId: input.orgId,
        entitlement: SSO_CONFIG_ENTITLEMENT,
      });

      // Domain ownership: only allow deleting configs for domains the caller's
      // org has actually verified. Requiring `verifiedAt` here matches the
      // `save` gate and prevents an org from creating a pending claim for
      // someone else's domain (e.g. a config provisioned by the legacy admin
      // handler with no VerifiedDomain backing) and using it to delete an
      // SSO config they don't own.
      const verifiedDomain = await ctx.prisma.verifiedDomain.findFirst({
        where: {
          domain: input.domain,
          organizationId: input.orgId,
          verifiedAt: { not: null },
        },
      });
      if (!verifiedDomain) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "SSO configuration not found",
        });
      }

      const existing = await ctx.prisma.ssoConfig.findUnique({
        where: { domain: input.domain },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "SSO configuration not found",
        });
      }

      await ctx.prisma.ssoConfig.delete({ where: { domain: input.domain } });

      await auditLog({
        session: ctx.session,
        resourceType: "ssoConfig",
        resourceId: existing.domain,
        action: "delete",
        before: {
          domain: existing.domain,
          authProvider: existing.authProvider,
          authConfig: maskAuthConfig(
            existing.authConfig as SsoConfigRow["authConfig"],
          ),
        },
      });

      return { domain: existing.domain };
    }),
});
