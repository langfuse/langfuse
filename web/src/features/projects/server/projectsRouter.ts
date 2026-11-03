import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import { ProjectService } from "@/src/features/projects/server/projectService";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";
import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { TRPCError } from "@trpc/server";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import {
  redis,
  getEnvironmentsForProject,
  invalidateCachedOrgApiKeys,
} from "@langfuse/shared/src/server";
import { StringNoHTMLNonEmpty } from "@langfuse/shared";
import { buildAdminOrgContext } from "@/src/features/organizations/server/adminOrgContext";
import { emitChbProjectEvent } from "@/src/ee/features/billing/server/chb/chbProjectEvents";

export const projectsRouter = createTRPCRouter({
  create: protectedOrganizationProcedure
    .input(
      z.object({
        name: StringNoHTMLNonEmpty,
        orgId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "projects:create",
      });

      const existingProject = await ctx.prisma.project.findFirst({
        where: {
          name: input.name,
          orgId: input.orgId,
          deletedAt: null,
        },
      });

      if (existingProject) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A project with this name already exists in your organization",
        });
      }

      const project = await ctx.prisma.project.create({
        data: {
          name: input.name,
          orgId: input.orgId,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "project",
        resourceId: project.id,
        action: "create",
        after: project,
      });

      // Refresh org-scoped keys' baked projectIds now that a project exists.
      await invalidateCachedOrgApiKeys(input.orgId);

      // Best-effort CHB metering signal; no-op unless the org is CHB-billed
      emitChbProjectEvent({
        type: "LANGFUSE_PROJECT_CREATED",
        orgId: input.orgId,
        projectId: project.id,
      });

      return {
        id: project.id,
        name: project.name,
        role: "OWNER",
      };
    }),

  update: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        newName: projectNameSchema.shape.name,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:update",
      });

      // check if the project name is already taken by another project
      const otherProjectWithSameName = await ctx.prisma.project.findFirst({
        where: {
          name: input.newName,
          orgId: ctx.session.orgId,
          deletedAt: null,
          id: {
            not: input.projectId,
          },
        },
      });
      if (otherProjectWithSameName) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A project with this name already exists in your organization",
        });
      }

      const project = await ctx.prisma.project.update({
        where: {
          id: input.projectId,
          orgId: ctx.session.orgId,
        },
        data: {
          name: input.newName,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "project",
        resourceId: input.projectId,
        action: "update",
        after: project,
      });
      return true;
    }),

  setRetention: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        retention: z.number().int().gte(3).nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:update",
      });
      if (input.retention !== null && input.retention > 0) {
        throwIfNoEntitlement({
          entitlement: "data-retention",
          sessionUser: ctx.session.user,
          projectId: input.projectId,
        });
      }

      const project = await ctx.prisma.project.update({
        where: {
          id: input.projectId,
          orgId: ctx.session.orgId,
        },
        data: {
          retentionDays: input.retention,
        },
      });
      await auditLog({
        session: ctx.session,
        resourceType: "project",
        resourceId: input.projectId,
        action: "update",
        after: project,
      });
      return true;
    }),

  deletionProtection: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:delete",
      });
      return {
        isGatewayIngestionProject: await new GatewayConfigService(
          ctx.prisma,
        ).isIngestionProject({
          organizationId: ctx.session.orgId,
          projectId: input.projectId,
        }),
      };
    }),

  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: ctx.session.projectId,
        scope: "project:delete",
      });
      await new ProjectService(
        ctx.prisma,
        new ApiAuthService(ctx.prisma, redis),
      ).delete({
        organizationId: ctx.session.orgId,
        projectId: input.projectId,
        actor: { session: ctx.session },
        canManageGateway: hasOrganizationAccess({
          session: ctx.session,
          organizationId: ctx.session.orgId,
          scope: "gateway:manage",
        }),
      });

      return true;
    }),

  transfer: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        targetOrgId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // source org
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: ctx.session.orgId,
        scope: "projects:transfer_org",
      });
      // destination org
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.targetOrgId,
        scope: "projects:transfer_org",
      });

      const project = await ctx.prisma.project.findUnique({
        where: {
          id: input.projectId,
          deletedAt: null,
        },
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      await new ProjectService(
        ctx.prisma,
        new ApiAuthService(ctx.prisma, redis),
      ).transfer({
        organizationId: ctx.session.orgId,
        targetOrganizationId: input.targetOrgId,
        projectId: input.projectId,
        actor: { session: ctx.session },
      });
    }),

  environmentFilterOptions: protectedProjectProcedure
    .input(
      z.object({ projectId: z.string(), fromTimestamp: z.date().optional() }),
    )
    .query(async ({ input }) => getEnvironmentsForProject(input)),

  // Admin-only fallback for useProject: returns the project and its org in the
  // same shape as session.user.organizations[number], since admins are not
  // members of customer projects and have no session entry.
  byId: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx }) => {
      const organization = await buildAdminOrgContext(ctx);
      const project = organization?.projects.find(
        (p) => p.id === ctx.session.projectId,
      );
      if (!organization || !project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }
      return { project, organization };
    }),
});
