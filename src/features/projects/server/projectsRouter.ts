import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import * as z from "zod";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { TRPCError } from "@trpc/server";
import { projectNameSchema } from "@/src/features/auth/lib/projectNameSchema";

export const projectsRouter = createTRPCRouter({
  all: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.prisma.membership.findMany({
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

      const cloudConfigSchema = z.object({
        plan: z.enum(["Hobby", "Pro", "Team", "Enterprise"]).optional(),
        monthlyObservationLimit: z.number().int().positive().optional(),
      });
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
          members: {
            create: {
              userId: ctx.session.user.id,
              role: "OWNER",
            },
          },
        },
      });

      return {
        id: project.id,
        name: project.name,
        role: "OWNER",
      };
    }),

  update: protectedProcedure
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

      await ctx.prisma.project.update({
        where: {
          id: input.projectId,
        },
        data: {
          name: input.newName,
        },
      });
      return true;
    }),

  delete: protectedProcedure
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

      await ctx.prisma.project.delete({
        where: {
          id: input.projectId,
        },
      });

      return true;
    }),

  transfer: protectedProcedure
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

      return ctx.prisma.$transaction([
        // Add new owner, upsert to update role if already exists
        ctx.prisma.membership.upsert({
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
        ctx.prisma.membership.update({
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
