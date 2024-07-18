import * as z from "zod";

import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { ProjectRole } from "@langfuse/shared/src/db";
import { sendProjectInvitationEmail } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

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

      const memberships = await ctx.prisma.projectMembership.findMany({
        where: {
          projectId: input.projectId,
          project: {
            projectMembers: {
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

      const membership = await ctx.prisma.projectMembership.findFirst({
        where: {
          projectId: input.projectId,
          userId: input.userId,
          role: {
            not: ProjectRole.OWNER,
          },
        },
      });

      if (!membership) throw new TRPCError({ code: "NOT_FOUND" });

      await auditLog({
        session: ctx.session,
        resourceType: "membership",
        resourceId: membership.projectId + "--" + membership.userId,
        action: "delete",
        before: membership,
      });

      // use ids from membership to make sure owners cannot delete themselves
      return await ctx.prisma.projectMembership.delete({
        where: {
          projectId_userId: {
            projectId: membership.projectId,
            userId: membership.userId,
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

      await auditLog({
        session: ctx.session,
        resourceType: "membershipInvitation",
        resourceId: input.id,
        action: "delete",
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
          ProjectRole.ADMIN,
          ProjectRole.MEMBER,
          ProjectRole.VIEWER,
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
        const membership = await ctx.prisma.projectMembership.create({
          data: {
            userId: user.id,
            projectId: input.projectId,
            role: input.role,
          },
        });
        await auditLog({
          session: ctx.session,
          resourceType: "membership",
          resourceId: input.projectId + "--" + user.id,
          action: "create",
          after: membership,
        });
        return membership;
      } else {
        const invitation = await ctx.prisma.membershipInvitation.create({
          data: {
            projectId: input.projectId,
            email: input.email.toLowerCase(),
            role: input.role,
            senderId: ctx.session.user.id,
          },
        });
        await auditLog({
          session: ctx.session,
          resourceType: "membershipInvitation",
          resourceId: invitation.id,
          action: "create",
          after: invitation,
        });

        const project = await ctx.prisma.project.findFirst({
          where: {
            id: input.projectId,
          },
        });

        if (!project) throw new Error("Project not found");

        await sendProjectInvitationEmail({
          env,
          to: input.email,
          inviterName: ctx.session.user.name!,
          inviterEmail: ctx.session.user.email!,
          projectName: project.name,
        });

        return invitation;
      }
    }),
});
