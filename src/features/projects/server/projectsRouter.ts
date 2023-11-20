import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import * as z from "zod";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";

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
