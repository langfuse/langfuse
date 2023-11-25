import { sendProjectInvitation } from "@/src/features/email/lib/project-invitation";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { MembershipRole } from "@prisma/client";
import * as z from "zod";

export const projectMembersRouter = createTRPCRouter({
  get: protectedProcedure
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

      const invitations = await ctx.prisma.projectInvitation.findMany({
        where: {
          projectId: input.projectId,
        },
        include: {
          sender: true,
        },
      });

      return { memberships: memberships, invitations: invitations };
    }),
  delete: protectedProcedure
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
  delete_invitation: protectedProcedure
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

      return await ctx.prisma.projectInvitation.deleteMany({
        where: {
          id: input.id,
          projectId: input.projectId,
        },
      });
    }),
  create: protectedProcedure
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
      }

      const invitation = await ctx.prisma.projectInvitation.create({
        data: {
          projectId: input.projectId,
          email: input.email.toLowerCase(),
          role: input.role,
          senderId: ctx.session.user.id,
        },
      });

      const project = await ctx.prisma.project.findFirstOrThrow({
        where: {
          id: input.projectId,
        },
      });

      if (!project) throw new Error("Project not found");

      await sendProjectInvitation(
        input.email,
        ctx.session.user.name ?? `${process.env.EMAIL_FROM_NAME}`,
        project.name,
      );

      return invitation;
    }),
});
