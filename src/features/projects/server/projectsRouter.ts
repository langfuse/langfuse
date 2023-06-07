import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod";

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
      })
    )
    .mutation(async ({ input, ctx }) => {
      // check that no project with this name exists
      const existingProject = await ctx.prisma.project.findFirst({
        where: {
          name: input.name,
        },
      });
      if (existingProject) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A project with this name already exists",
        });
      }

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
});
