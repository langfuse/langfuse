import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { resolveTxtFresh } from "@/src/ee/features/verified-domains/server/dnsLookup";
import { Prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import * as z from "zod";

const VERIFICATION_RECORD_PREFIX = "_langfuse-verification";
const VERIFICATION_VALUE_PREFIX = "langfuse-verify=";

const domainInput = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .transform((v) => v.toLowerCase())
  .refine(
    (v) =>
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(
        v,
      ),
    { message: "Must be a valid domain (e.g. acme.com)" },
  );

// FQDN form, used internally by the verifier to dig the TXT record.
const recordFqdnFor = (domain: string) =>
  `${VERIFICATION_RECORD_PREFIX}.${domain}`;
const recordValueFor = (token: string) =>
  `${VERIFICATION_VALUE_PREFIX}${token}`;

export const verifiedDomainRouter = createTRPCRouter({
  list: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });

      const rows = await ctx.prisma.verifiedDomain.findMany({
        where: { organizationId: input.orgId },
        orderBy: { createdAt: "asc" },
      });

      return rows.map((row) => ({
        id: row.id,
        domain: row.domain,
        verifiedAt: row.verifiedAt,
        createdAt: row.createdAt,
        recordHost: VERIFICATION_RECORD_PREFIX,
        recordValue: recordValueFor(row.verificationToken),
      }));
    }),

  create: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), domain: domainInput }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });

      const existing = await ctx.prisma.verifiedDomain.findUnique({
        where: { domain: input.domain },
      });

      if (existing && existing.organizationId !== input.orgId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Domain "${input.domain}" is already claimed by another organization. Contact support if this is your domain.`,
        });
      }

      if (existing) {
        return {
          id: existing.id,
          domain: existing.domain,
          verifiedAt: existing.verifiedAt,
          createdAt: existing.createdAt,
          recordHost: VERIFICATION_RECORD_PREFIX,
          recordValue: recordValueFor(existing.verificationToken),
        };
      }

      // The check-then-create pattern above is not atomic; two concurrent
      // requests for the same new domain (across orgs) can both pass and the
      // second hits the unique index on `domain`. Translate Prisma's P2002
      // into a clean CONFLICT instead of bubbling up as a 500.
      let row;
      try {
        row = await ctx.prisma.verifiedDomain.create({
          data: {
            organizationId: input.orgId,
            domain: input.domain,
            createdByUserId: ctx.session.user.id,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Domain "${input.domain}" is already claimed by another organization. Contact support if this is your domain.`,
          });
        }
        throw error;
      }

      await auditLog({
        session: ctx.session,
        resourceType: "verifiedDomain",
        resourceId: row.id,
        action: "create",
        after: { domain: row.domain, organizationId: row.organizationId },
      });

      return {
        id: row.id,
        domain: row.domain,
        verifiedAt: row.verifiedAt,
        createdAt: row.createdAt,
        recordHost: VERIFICATION_RECORD_PREFIX,
        recordValue: recordValueFor(row.verificationToken),
      };
    }),

  verify: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });

      const row = await ctx.prisma.verifiedDomain.findFirst({
        where: { id: input.id, organizationId: input.orgId },
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Verified domain not found",
        });
      }

      if (row.verifiedAt) {
        return { id: row.id, domain: row.domain, verifiedAt: row.verifiedAt };
      }

      const recordFqdn = recordFqdnFor(row.domain);
      const expected = recordValueFor(row.verificationToken);

      let records: string[][] = [];
      try {
        records = await resolveTxtFresh(recordFqdn);
      } catch {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Could not find a TXT record at "${recordFqdn}". DNS changes may take up to 24h to propagate.`,
        });
      }

      const flat = records.map((chunks) => chunks.join(""));
      const matched = flat.includes(expected);

      if (!matched) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `TXT record at "${recordFqdn}" does not contain the expected value "${expected}". Found ${flat.length} record(s).`,
        });
      }

      const updated = await ctx.prisma.verifiedDomain.update({
        where: { id: row.id },
        data: { verifiedAt: new Date() },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "verifiedDomain",
        resourceId: updated.id,
        action: "verify",
        before: { verifiedAt: null },
        after: { verifiedAt: updated.verifiedAt },
      });

      return {
        id: updated.id,
        domain: updated.domain,
        verifiedAt: updated.verifiedAt,
      };
    }),

  delete: protectedOrganizationProcedure
    .input(z.object({ orgId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organization:update",
      });

      const row = await ctx.prisma.verifiedDomain.findFirst({
        where: { id: input.id, organizationId: input.orgId },
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Verified domain not found",
        });
      }

      // Refuse to drop a verified domain that still has an active SSO
      // configuration. Otherwise the SsoConfig would be orphaned: it would
      // continue to enforce SSO at sign-in but disappear from the UI (the
      // listing is scoped to verified domains) and become undeletable through
      // the normal flow. Force admins to explicitly remove the SSO config
      // first so the dependency is acknowledged.
      const ssoConfig = await ctx.prisma.ssoConfig.findUnique({
        where: { domain: row.domain },
      });
      if (ssoConfig) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `An SSO configuration is active for "${row.domain}". Remove the SSO configuration before deleting this domain.`,
        });
      }

      await ctx.prisma.verifiedDomain.delete({ where: { id: row.id } });

      await auditLog({
        session: ctx.session,
        resourceType: "verifiedDomain",
        resourceId: row.id,
        action: "delete",
        before: {
          domain: row.domain,
          organizationId: row.organizationId,
          verifiedAt: row.verifiedAt,
        },
      });

      return { id: row.id };
    }),
});
