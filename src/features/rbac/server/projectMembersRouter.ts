import { sendProjectInvitation } from "@/src/features/email/lib/project-invitation";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { MembershipRole } from "@prisma/client";
import * as z from "zod";

export const projectMembersRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "members:read",
      });

      const memberships = await ctx.prisma.membership.findMany({
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

      const invitations = await ctx.prisma.membershipInvitation.findMany({
        where: {
          projectId: input.projectId,
        },
        include: {
          sender: {
            select: {
              name: true,
            },
          },
        },
      });

      return { memberships: memberships, invitations: invitations };
    }),
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "members:delete",
      });

      if (input.userId === ctx.session.user.id)
        throw new Error("You cannot remove yourself from a project");

      // use deleteMany to protect against deleting owner with where clause
      return ctx.prisma.membership.deleteMany({
        where: {
          projectId: input.projectId,
          userId: input.userId,
          role: {
            not: MembershipRole.OWNER,
          },
        },
      });
    }),
  deleteInvitation: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "members:delete",
      });

      return await ctx.prisma.membershipInvitation.delete({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
    }),
  create: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        email: z.string().email(),
        role: z.enum([
          MembershipRole.ADMIN,
          MembershipRole.MEMBER,
          MembershipRole.VIEWER,
        ]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "members:create",
      });

      const user = await ctx.prisma.user.findUnique({
        where: {
          email: input.email.toLowerCase(),
        },
      });
      if (user) {
        return await ctx.prisma.membership.create({
          data: {
            userId: user.id,
            projectId: input.projectId,
            role: input.role,
          },
        });
      } else {
        const invitation = await ctx.prisma.membershipInvitation.create({
          data: {
            projectId: input.projectId,
            email: input.email.toLowerCase(),
            role: input.role,
            senderId: ctx.session.user.id,
          },
        });

        const project = await ctx.prisma.project.findFirst({
          where: {
            id: input.projectId,
          },
        });

        if (!project) throw new Error("Project not found");

        await sendProjectInvitation(
          input.email,
          ctx.session.user.name!,
          ctx.session.user.email!,
          project.name,
        );

        return invitation;
      }
    }),
});
