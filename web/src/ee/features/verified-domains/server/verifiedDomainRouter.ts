import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { promises as dns } from "node:dns";
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

const recordNameFor = (domain: string) =>
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
        recordName: recordNameFor(row.domain),
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
          recordName: recordNameFor(existing.domain),
          recordValue: recordValueFor(existing.verificationToken),
        };
      }

      const row = await ctx.prisma.verifiedDomain.create({
        data: {
          organizationId: input.orgId,
          domain: input.domain,
          createdByUserId: ctx.session.user.id,
        },
      });

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
        recordName: recordNameFor(row.domain),
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

      const recordName = recordNameFor(row.domain);
      const expected = recordValueFor(row.verificationToken);

      let records: string[][] = [];
      try {
        records = await dns.resolveTxt(recordName);
      } catch (e: unknown) {
        const code =
          typeof e === "object" && e !== null && "code" in e
            ? String((e as { code: unknown }).code)
            : "UNKNOWN";
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Could not find a TXT record at "${recordName}" (${code}). DNS changes may take up to 24h to propagate.`,
        });
      }

      const flat = records.map((chunks) => chunks.join(""));
      const matched = flat.includes(expected);

      if (!matched) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `TXT record at "${recordName}" does not contain the expected value "${expected}". Found ${flat.length} record(s).`,
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
