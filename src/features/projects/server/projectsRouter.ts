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
});
