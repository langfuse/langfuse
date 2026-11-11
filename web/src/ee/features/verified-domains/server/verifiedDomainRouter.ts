import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { resolveTxtFresh } from "@/src/ee/features/verified-domains/server/dnsLookup";
import { Prisma } from "@langfuse/shared/src/db";
import { TRPCError } from "@trpc/server";
import * as z from "zod";

// Verified domains are infrastructure for multi-tenant SSO; gate every
// mutation on the same entitlement so the API surface matches the UI
// (`useHasEntitlement` already hides the feature on lower plans). Pending
// claims are shareable so squatting no longer locks out enterprise
// customers, but limiting reach to entitled orgs is still cleaner — fewer
// stale rows from hobby orgs poking at the API directly.
const VERIFIED_DOMAIN_ENTITLEMENT = "cloud-multi-tenant-sso" as const;

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
      throwIfNoEntitlement({
        sessionUser: ctx.session.user,
        orgId: input.orgId,
        entitlement: VERIFIED_DOMAIN_ENTITLEMENT,
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
      throwIfNoEntitlement({
        sessionUser: ctx.session.user,
        orgId: input.orgId,
        entitlement: VERIFIED_DOMAIN_ENTITLEMENT,
      });

      // Pending claims are shareable across orgs; only verified claims are
      // exclusive. Block create only when another org has already verified
      // the domain — otherwise a hobby-plan org could squat a global slot
      // for a domain it doesn't own. Verified-claim exclusivity is also
      // enforced at the DB level by a partial unique index on
      // `domain WHERE verified_at IS NOT NULL`.
      const verifiedElsewhere = await ctx.prisma.verifiedDomain.findFirst({
        where: { domain: input.domain, verifiedAt: { not: null } },
      });
      if (
        verifiedElsewhere &&
        verifiedElsewhere.organizationId !== input.orgId
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Domain "${input.domain}" is already verified by another organization.`,
        });
      }

      // Per-org idempotency: returning the existing row lets the UI re-open
      // the same DNS instructions without minting a fresh verification token.
      const existing = await ctx.prisma.verifiedDomain.findUnique({
        where: {
          organizationId_domain: {
            organizationId: input.orgId,
            domain: input.domain,
          },
        },
      });
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

      // Race protection: two parallel creates from the same org or two orgs
      // racing each other after a verified row was just created. The
      // (organizationId, domain) unique index and the partial index on
      // verified rows both surface as Prisma P2002.
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
            message: `Domain "${input.domain}" is already verified by another organization.`,
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
      throwIfNoEntitlement({
        sessionUser: ctx.session.user,
        orgId: input.orgId,
        entitlement: VERIFIED_DOMAIN_ENTITLEMENT,
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

      // Verified-claim exclusivity is enforced by a partial unique index on
      // `domain WHERE verified_at IS NOT NULL`. If another org already
      // verified this domain (e.g. they raced us after we both proved DNS),
      // the update returns P2002. Translate to CONFLICT so the user sees a
      // clean message instead of an opaque 500.
      let updated;
      try {
        updated = await ctx.prisma.verifiedDomain.update({
          where: { id: row.id },
          data: { verifiedAt: new Date() },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Domain "${row.domain}" is already verified by another organization.`,
          });
        }
        throw error;
      }

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
      throwIfNoEntitlement({
        sessionUser: ctx.session.user,
        orgId: input.orgId,
        entitlement: VERIFIED_DOMAIN_ENTITLEMENT,
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

      // Once verified, refuse to drop the row while its SsoConfig is still
      // active — otherwise the config would be orphaned: it would continue
      // to enforce SSO at sign-in but disappear from the UI and become
      // undeletable through the normal flow. Pending claims are exempt:
      // since they're shareable across orgs (any number can claim the same
      // domain unverified), an SsoConfig that exists for the domain
      // necessarily belongs to a *different* org's verified row, and
      // blocking on it would trap stale pending claims permanently.
      if (row.verifiedAt) {
        const ssoConfig = await ctx.prisma.ssoConfig.findUnique({
          where: { domain: row.domain },
        });
        if (ssoConfig) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `An SSO configuration is active for "${row.domain}". Remove the SSO configuration before deleting this domain.`,
          });
        }
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
