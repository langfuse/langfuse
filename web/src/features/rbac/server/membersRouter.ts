import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod";
import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import { paginationZod, type PrismaClient, Role } from "@langfuse/shared";
import { sendMembershipInvitationEmail } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

// Record as it allows to type check that all roles are included
const orderedRoles: Record<Role, number> = {
  [Role.OWNER]: 4,
  [Role.ADMIN]: 3,
  [Role.MEMBER]: 2,
  [Role.VIEWER]: 1,
  [Role.NONE]: 0,
};
function throwIfHigherRole({ ownRole, role }: { ownRole: Role; role: Role }) {
  if (orderedRoles[ownRole] < orderedRoles[role]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot grant/edit a role higher than your own",
    });
  }
}

/**
 * Throw if the user tries to set a project role that is higher than their own
 * role determined by MAX(orgRole, projectRole)
 */
async function throwIfHigherProjectRole({
  orgCtx, // context by protectedOrganizationProcedure
  projectId,
  projectRole,
}: {
  orgCtx: {
    session: {
      orgId: string;
      orgRole: Role;
      user: {
        id: string;
      };
    };
    prisma: PrismaClient;
  };
  projectId: string;
  projectRole: Role;
}) {
  const projectMembership = await orgCtx.prisma.projectMembership.findFirst({
    where: {
      projectId,
      userId: orgCtx.session.user.id,
      organizationMembership: {
        orgId: orgCtx.session.orgId,
      },
    },
  });

  const ownRoleValue: number = projectMembership
    ? Math.max(
        orderedRoles[projectMembership.role],
        orderedRoles[orgCtx.session.orgRole],
      )
    : orderedRoles[orgCtx.session.orgRole];

  if (ownRoleValue < orderedRoles[projectRole]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You cannot grant/edit a role higher than your own",
    });
  }
}

export const membersRouter = createTRPCRouter({
  all: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        projectId: z.string().optional(), // optional, view project_role for specific project
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:read",
      });
      const orgMemberships = await ctx.prisma.organizationMembership.findMany({
        where: {
          orgId: input.orgId,
        },
        include: {
          user: {
            select: {
              image: true,
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          user: {
            email: "asc",
          },
        },
        take: input.limit,
        skip: input.page * input.limit,
      });

      const totalCount = await ctx.prisma.organizationMembership.count({
        where: {
          orgId: input.orgId,
        },
      });

      const projectMemberships = input.projectId
        ? await ctx.prisma.projectMembership.findMany({
            select: {
              userId: true,
              role: true,
            },
            where: {
              orgMembershipId: {
                in: orgMemberships.map((m) => m.id),
              },
              projectId: input.projectId,
            },
          })
        : [];

      return {
        memberships: orgMemberships.map((om) => ({
          ...om,
          projectRole: projectMemberships.find((pm) => pm.userId === om.userId)
            ?.role,
        })),
        totalCount,
      };
    }),
  allInvites: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:read",
      });
      const invitations = await ctx.prisma.membershipInvitation.findMany({
        where: {
          orgId: input.orgId,
        },
        include: {
          invitedByUser: {
            select: {
              name: true,
              image: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: input.limit,
        skip: input.page * input.limit,
      });
      const totalCount = await ctx.prisma.membershipInvitation.count({
        where: {
          orgId: input.orgId,
        },
      });

      return {
        invitations: invitations.map((i) => ({
          ...i,
        })),
        totalCount,
      };
    }),
  create: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        email: z.string().email(),
        orgRole: z.nativeEnum(Role),
        // in case a projectRole should be set for a specific project
        projectId: z.string().optional(),
        projectRole: z.nativeEnum(Role).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });
      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: input.orgRole,
      });

      // check for entilement (project role)
      if (input.projectId && input.projectRole) {
        const entitled = hasEntitlement({
          entitlement: "rbac-project-roles",
          sessionUser: ctx.session.user,
          orgId: input.orgId,
        });
        if (!entitled)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Organization does not have the required entitlement to set project roles",
          });
      }

      const user = await ctx.prisma.user.findUnique({
        where: {
          email: input.email.toLowerCase(),
        },
      });

      // security check if project is in org
      const project = input.projectId
        ? await ctx.prisma.project.findFirst({
            where: {
              id: input.projectId,
              orgId: input.orgId,
            },
          })
        : null;
      if (project && input.projectRole)
        await throwIfHigherProjectRole({
          orgCtx: ctx,
          projectId: project.id,
          projectRole: input.projectRole,
        });

      const org = await ctx.prisma.organization.findFirst({
        where: {
          id: input.orgId,
        },
      });
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Org not found" });
      }

      if (user) {
        const existingOrgMembership =
          await ctx.prisma.organizationMembership.findFirst({
            where: {
              orgId: input.orgId,
              userId: user.id,
            },
          });
        if (existingOrgMembership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "User is already a member of this organization",
          });
        }
        const orgMembership = await ctx.prisma.organizationMembership.create({
          data: {
            userId: user.id,
            orgId: input.orgId,
            role: input.orgRole,
          },
        });
        await auditLog({
          session: ctx.session,
          resourceType: "orgMembership",
          resourceId: orgMembership.id,
          action: "create",
          after: orgMembership,
        });
        if (project && input.projectRole && input.projectRole !== Role.NONE) {
          const projectMembership = await ctx.prisma.projectMembership.create({
            data: {
              userId: user.id,
              projectId: project.id,
              role: input.projectRole,
              orgMembershipId: orgMembership.id,
            },
          });
          await auditLog({
            session: ctx.session,
            resourceType: "projectMembership",
            resourceId:
              projectMembership.projectId + "--" + projectMembership.userId,
            action: "create",
            after: projectMembership,
          });
        }
        await sendMembershipInvitationEmail({
          inviterEmail: ctx.session.user.email!,
          inviterName: ctx.session.user.name!,
          to: input.email,
          orgName: org.name,
          env: env,
        });
      } else {
        const invitation = await ctx.prisma.membershipInvitation.create({
          data: {
            orgId: input.orgId,
            projectId:
              project && input.projectRole && input.projectRole !== Role.NONE
                ? project.id
                : null,
            email: input.email.toLowerCase(),
            orgRole: input.orgRole,
            projectRole:
              input.projectRole && input.projectRole !== Role.NONE && project
                ? input.projectRole
                : null,
            invitedByUserId: ctx.session.user.id,
          },
        });
        await auditLog({
          session: ctx.session,
          resourceType: "membershipInvitation",
          resourceId: invitation.id,
          action: "create",
          after: invitation,
        });
        await sendMembershipInvitationEmail({
          inviterEmail: ctx.session.user.email!,
          inviterName: ctx.session.user.name!,
          to: input.email,
          orgName: org.name,
          env: env,
        });

        return invitation;
      }
    }),
  deleteMembership: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        orgMembershipId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const orgMembership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          orgId: input.orgId,
          id: input.orgMembershipId,
        },
        include: {
          ProjectMemberships: true,
        },
      });
      if (!orgMembership) throw new TRPCError({ code: "NOT_FOUND" });

      // User is only allowed to delete their own membership if they do not have the required scope
      const hasAccess = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });
      if (!hasAccess && orgMembership.userId !== ctx.session.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });

      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: orgMembership.role,
      });

      if (orgMembership.role === Role.OWNER) {
        // check if there are other remaining owners
        const owners = await ctx.prisma.organizationMembership.count({
          where: {
            orgId: input.orgId,
            role: Role.OWNER,
          },
        });
        if (owners === 1) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Cannot remove the last owner of an organization. Assign new owner or delete organization.",
          });
        }
      }

      await auditLog({
        session: ctx.session,
        resourceType: "orgMembership",
        resourceId: orgMembership.id,
        action: "delete",
        before: orgMembership,
      });

      return await ctx.prisma.organizationMembership.delete({
        where: {
          id: orgMembership.id,
          orgId: input.orgId,
        },
      });
    }),
  deleteInvite: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        inviteId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });
      const invitation = await ctx.prisma.membershipInvitation.findFirst({
        where: {
          orgId: input.orgId,
          id: input.inviteId,
        },
      });
      if (!invitation) throw new TRPCError({ code: "NOT_FOUND" });

      await auditLog({
        session: ctx.session,
        resourceType: "membershipInvitation",
        resourceId: invitation.id,
        action: "delete",
        before: invitation,
      });

      return await ctx.prisma.membershipInvitation.delete({
        where: {
          id: invitation.id,
          orgId: input.orgId,
        },
      });
    }),
  updateOrgMembership: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        orgMembershipId: z.string(),
        role: z.nativeEnum(Role),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });

      const membership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          orgId: input.orgId,
          id: input.orgMembershipId,
        },
      });
      if (!membership) throw new TRPCError({ code: "NOT_FOUND" });

      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: input.role, // new
      });
      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: membership.role, // old
      });

      // check if this is the only remaining owner
      const otherOwners = await ctx.prisma.organizationMembership.count({
        where: {
          orgId: input.orgId,
          role: Role.OWNER,
          id: {
            not: membership.id,
          },
        },
      });
      if (otherOwners === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Cannot remove the last owner of an organization. Assign new owner or delete organization.",
        });
      }

      await auditLog({
        session: ctx.session,
        resourceType: "orgMembership",
        resourceId: membership.id,
        action: "update",
        before: membership,
      });

      return await ctx.prisma.organizationMembership.update({
        where: {
          id: membership.id,
          orgId: input.orgId,
        },
        data: {
          role: input.role,
        },
      });
    }),
  updateProjectRole: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        orgMembershipId: z.string(),
        userId: z.string(),
        projectId: z.string(),
        projectRole: z.nativeEnum(Role).nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });

      // check org membership id, can be trusted after this check
      const orgMembership = await ctx.prisma.organizationMembership.findUnique({
        where: {
          id: input.orgMembershipId,
          orgId: input.orgId,
        },
      });
      if (!orgMembership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization membership not found",
        });
      }

      const projectMembership = await ctx.prisma.projectMembership.findFirst({
        where: {
          projectId: input.projectId,
          userId: input.userId,
          orgMembershipId: input.orgMembershipId,
        },
      });

      // check existing project role if it is higher than own role
      if (projectMembership) {
        await throwIfHigherProjectRole({
          orgCtx: ctx,
          projectId: input.projectId,
          projectRole: projectMembership.role,
        });
      }

      // If the project role is set to null, delete the project membership
      if (input.projectRole === null || input.projectRole === Role.NONE) {
        if (projectMembership) {
          await ctx.prisma.projectMembership.delete({
            where: {
              projectId_userId: {
                projectId: input.projectId,
                userId: input.userId,
              },
              orgMembershipId: input.orgMembershipId,
            },
          });

          await auditLog({
            session: ctx.session,
            resourceType: "projectMembership",
            resourceId: `${input.orgMembershipId}--${input.projectId}`,
            action: "delete",
            before: projectMembership,
          });
        }
        return null;
      }

      // check new project role if it is higher than own role
      await throwIfHigherProjectRole({
        orgCtx: ctx,
        projectId: input.projectId,
        projectRole: input.projectRole,
      });

      // Create/update
      const updatedProjectMembership =
        await ctx.prisma.projectMembership.upsert({
          where: {
            projectId_userId: {
              projectId: input.projectId,
              userId: input.userId,
            },
            orgMembershipId: input.orgMembershipId,
          },
          update: {
            role: input.projectRole,
          },
          create: {
            projectId: input.projectId,
            userId: input.userId,
            role: input.projectRole,
            orgMembershipId: input.orgMembershipId,
          },
        });

      await auditLog({
        session: ctx.session,
        resourceType: "projectMembership",
        resourceId: input.projectId + "--" + input.userId,
        action: "update",
        before: projectMembership,
      });

      return updatedProjectMembership;
    }),
});
