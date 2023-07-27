import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { MembershipRole } from "@prisma/client";
import * as z from "zod";

export const projectMembersRouter = createTRPCRouter({
  get: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "members:read",
      });

      return await ctx.prisma.membership.findMany({
        where: {
          projectId: input.projectId,
          project: {
            members: {
              some: {
                userId: ctx.session.user.id,
              },
            },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    }),
  delete: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "members:delete",
      });

      if (input.userId === ctx.session.user.id)
        throw new Error("You cannot remove yourself from a project");

      return ctx.prisma.membership.delete({
        where: {
          projectId_userId: {
            projectId: input.projectId,
            userId: input.userId,
          },
        },
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        email: z.string().email(),
        role: z.enum([MembershipRole.ADMIN, MembershipRole.MEMBER]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "members:create",
      });

      const user = await ctx.prisma.user.findUnique({
        where: {
          email: input.email,
        },
      });
      if (!user) throw new Error("User not found");

      return await ctx.prisma.membership.create({
        data: {
          userId: user.id,
          projectId: input.projectId,
          role: input.role,
        },
      });
    }),
});
