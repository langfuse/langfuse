import {
  createTRPCRouter,
  protectedOrganizationProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod/v4";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { TRPCError } from "@trpc/server";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import {
  QueueJobs,
  redis,
  ProjectDeleteQueue,
  getEnvironmentsForProject,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

export const projectsRouter = createTRPCRouter({
  create: protectedOrganizationProcedure
    .input(
      z.object({
        name: z.string(),
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
        environments: z.array(z.string()).optional().default(["default"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:update",
      });

      // If environments are specified and not just default, use retention configuration
      if (input.environments && input.environments.length > 0 &&
          !(input.environments.length === 1 && input.environments[0] === "default")) {

        if (input.retention === null || input.retention === 0) {
          // Delete retention configuration if retention is disabled
          await ctx.prisma.retentionConfiguration.deleteMany({
            where: {
              projectId: input.projectId,
            },
          });
        } else {
          // Create or update retention configuration
          await ctx.prisma.retentionConfiguration.upsert({
            where: {
              projectId: input.projectId,
            },
            create: {
              projectId: input.projectId,
              retentionDays: input.retention,
              environments: input.environments,
            },
            update: {
              retentionDays: input.retention,
              environments: input.environments,
            },
          });
        }

        // Clear project-level retention when using environment-specific config
        await ctx.prisma.project.update({
          where: {
            id: input.projectId,
            orgId: ctx.session.orgId,
          },
          data: {
            retentionDays: null,
          },
        });
      } else {
        // Use project-level retention (backward compatibility)
        await ctx.prisma.project.update({
          where: {
            id: input.projectId,
            orgId: ctx.session.orgId,
          },
          data: {
            retentionDays: input.retention,
          },
        });

        // Remove any existing retention configuration
        await ctx.prisma.retentionConfiguration.deleteMany({
          where: {
            projectId: input.projectId,
          },
        });
      }

      const project = await ctx.prisma.project.findUnique({
        where: {
          id: input.projectId,
        },
        include: {
          retentionConfiguration: true,
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

  getRetentionConfiguration: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:read",
      });

      const project = await ctx.prisma.project.findUnique({
        where: {
          id: input.projectId,
          orgId: ctx.session.orgId,
        },
        include: {
          retentionConfiguration: true,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      // Return retention configuration or fall back to project-level retention
      if (project.retentionConfiguration) {
        return {
          retention: project.retentionConfiguration.retentionDays,
          environments: project.retentionConfiguration.environments,
          isEnvironmentSpecific: true,
        };
      } else {
        return {
          retention: project.retentionDays ?? 0,
          environments: ["default"],
          isEnvironmentSpecific: false,
        };
      }
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
      const beforeProject = await ctx.prisma.project.findUnique({
        where: {
          id: input.projectId,
        },
      });
      if (!beforeProject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }
      await auditLog({
        session: ctx.session,
        resourceType: "project",
        resourceId: input.projectId,
        before: beforeProject,
        action: "delete",
      });

      // API keys need to be deleted from cache. Otherwise, they will still be valid.
      await new ApiAuthService(ctx.prisma, redis).invalidateProjectApiKeys(
        input.projectId,
      );

      // Delete API keys from DB
      await ctx.prisma.apiKey.deleteMany({
        where: {
          projectId: input.projectId,
          scope: "PROJECT",
        },
      });

      await ctx.prisma.project.update({
        where: {
          id: input.projectId,
          orgId: ctx.session.orgId,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      const projectDeleteQueue = ProjectDeleteQueue.getInstance();
      if (!projectDeleteQueue) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "ProjectDeleteQueue is not available. Please try again later.",
        });
      }

      await projectDeleteQueue.add(QueueJobs.ProjectDelete, {
        timestamp: new Date(),
        id: randomUUID(),
        payload: {
          projectId: input.projectId,
          orgId: ctx.session.orgId,
        },
        name: QueueJobs.ProjectDelete,
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

      await auditLog({
        session: ctx.session,
        resourceType: "project",
        resourceId: input.projectId,
        action: "transfer",
        before: { orgId: ctx.session.orgId },
        after: { orgId: input.targetOrgId },
      });

      await ctx.prisma.$transaction([
        ctx.prisma.projectMembership.deleteMany({
          where: {
            projectId: input.projectId,
          },
        }),
        ctx.prisma.project.update({
          where: {
            id: input.projectId,
            orgId: ctx.session.orgId,
          },
          data: {
            orgId: input.targetOrgId,
          },
        }),
      ]);

      // API keys need to be deleted from cache. Otherwise, they will still be valid.
      // It has to be called after the db is done to prevent new API keys from being cached.
      await new ApiAuthService(ctx.prisma, redis).invalidateProjectApiKeys(
        input.projectId,
      );
    }),

  environmentFilterOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => getEnvironmentsForProject(input)),
});
