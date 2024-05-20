import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProcedure,
} from "@/src/server/api/trpc";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import * as z from "zod";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

export const organizationsRouter = createTRPCRouter({
  create: protectedProcedure
    .input(organizationNameSchema)
    .mutation(async ({ input, ctx }) => {
      const organization = await ctx.prisma.organization.create({
        data: {
          name: input.name,
          organizationMemberships: {
            create: {
              userId: ctx.session.user.id,
              role: "OWNER",
            },
          },
        },
      });
      await auditLog({
        resourceType: "organization",
        resourceId: organization.id,
        action: "create",
        orgId: organization.id,
        orgRole: "OWNER",
        userId: ctx.session.user.id,
        after: organization,
      });

      return {
        id: organization.id,
        name: organization.name,
        role: "OWNER",
      };
    }),
  update: protectedOrganizationProcedure
    .input(
      organizationNameSchema.extend({
        orgId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizations:update",
      });
      const beforeOrganization = await ctx.prisma.organization.findFirst({
        where: {
          id: input.orgId,
          organizationMemberships: {
            some: {
              userId: ctx.session.user.id,
              role: "OWNER",
            },
          },
        },
      });
      if (!beforeOrganization) {
        throw new Error("You do not have access to this organization");
      }
      const afterOrganization = await ctx.prisma.organization.update({
        where: {
          id: input.orgId,
          organizationMemberships: {
            some: {
              userId: ctx.session.user.id,
              role: "OWNER",
            },
          },
        },
        data: {
          name: input.name,
        },
      });

      await auditLog({
        session: ctx.session,
        resourceType: "organization",
        resourceId: input.orgId,
        action: "update",
        before: beforeOrganization,
        after: afterOrganization,
      });

      return true;
    }),
});
