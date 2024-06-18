import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import * as z from "zod";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { TRPCError } from "@trpc/server";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { cloudConfigSchema } from "@/src/server/auth";

export const projectsRouter = createTRPCRouter({
  all: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.prisma.projectMembership.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      include: {
        project: true,
      },
    });
    const projects = memberships.map((membership) => ({
      id: membership.project.id,
      name: membership.project.name,
      role: membership.role,
    }));

    return projects;
  }),
  byId: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const project = await ctx.prisma.project.findUnique({
        where: {
          id: input.projectId,
        },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const cloudConfig = cloudConfigSchema.safeParse(project.cloudConfig);

      return {
        ...project,
        cloudConfig: cloudConfig.success ? cloudConfig.data : null,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const project = await ctx.prisma.project.create({
        data: {
          name: input.name,
          projectMembers: {
            create: {
              userId: ctx.session.user.id,
              role: "OWNER",
            },
          },
        },
      });
      await auditLog({
        resourceType: "project",
        resourceId: project.id,
        action: "create",
        userId: ctx.session.user.id,
        projectId: project.id,
        userProjectRole: "OWNER",
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
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:update",
      });

      const project = await ctx.prisma.project.update({
        where: {
          id: input.projectId,
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

  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:delete",
      });
      await auditLog({
        session: ctx.session,
        resourceType: "project",
        resourceId: input.projectId,
        action: "delete",
      });

      await ctx.prisma.project.delete({
        where: {
          id: input.projectId,
        },
      });

      return true;
    }),

  transfer: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        newOwnerEmail: z.string().email(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "project:transfer",
      });

      // Check if new owner exists
      const newOwner = await ctx.prisma.user.findUnique({
        where: {
          email: input.newOwnerEmail.toLowerCase(),
        },
      });
      if (!newOwner) throw new Error("User not found");
      if (newOwner.id === ctx.session.user.id)
        throw new Error("You cannot transfer project to yourself");

      await auditLog({
        session: ctx.session,
        resourceType: "project",
        resourceId: input.projectId,
        action: "transfer",
        after: { ownerId: newOwner.id },
      });

      return ctx.prisma.$transaction([
        // Add new owner, upsert to update role if already exists
        ctx.prisma.projectMembership.upsert({
          where: {
            projectId_userId: {
              projectId: input.projectId,
              userId: newOwner.id,
            },
          },
          update: {
            role: "OWNER",
          },
          create: {
            userId: newOwner.id,
            projectId: input.projectId,
            role: "OWNER",
          },
        }),
        // Update old owner to admin
        ctx.prisma.projectMembership.update({
          where: {
            projectId_userId: {
              projectId: input.projectId,
              userId: ctx.session.user.id,
            },
          },
          data: {
            role: "ADMIN",
          },
        }),
      ]);
    }),
});
