import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { organizationNameSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import * as z from "zod";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { cloudConfigSchema } from "@/src/features/cloud-config/types/cloudConfigSchema";

export const organizationsRouter = createTRPCRouter({
  all: protectedProcedure.query(async ({ ctx }) => {
    const orgs = await ctx.prisma.organization.findMany({
      where: {
        organizationMemberships: {
          some: {
            userId: ctx.session.user.id,
          },
        },
      },
    });
    return orgs;
  }),
  byId: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const organization = await ctx.prisma.organization.findFirst({
        where: {
          id: input.orgId,
        },
        include: {
          projects: true,
        },
      });

      const parsedCloudConfig = cloudConfigSchema.safeParse(
        organization?.cloudConfig,
      );

      // todo: add filter for projects if user has no view access to all projects in org
      return { ...organization, cloudConfig: parsedCloudConfig.data };
    }),
  byProjectId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const project = await ctx.prisma.project.findFirst({
        where: {
          id: input.projectId,
        },
        include: {
          organization: true,
        },
      });

      const parsedCloudConfig = cloudConfigSchema.safeParse(
        project?.organization?.cloudConfig,
      );

      return project?.organization;
    }),
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
