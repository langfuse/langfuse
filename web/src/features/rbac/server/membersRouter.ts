import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  createTRPCRouter,
  protectedOrganizationProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import {
  hasOrganizationAccess,
  throwIfNoOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import { Prisma, type PrismaClient, Role } from "@langfuse/shared";
import { sendMembershipInvitationEmail } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  hasProjectAccess,
  throwIfNoProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import { allMembersRoutes } from "@/src/features/rbac/server/allMembersRoutes";
import { allInvitesRoutes } from "@/src/features/rbac/server/allInvitesRoutes";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

// Record as it allows to type check that all roles are included
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
  ...allMembersRoutes,
  ...allInvitesRoutes,
  create: protectedOrganizationProcedure
    .input(
      z.object({
        orgId: z.string(),
        email: z.string().email(),
        orgRole: z.enum(Role),
        // in case a projectRole should be set for a specific project
        projectId: z.string().optional(),
        projectRole: z.enum(Role).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Create a new organization membership
       * - Checks for:
       *   - scope: organizationMembers:CUD if not only project-role is set, then projectMembers:CUD
       *   - orgRole is not higher than own role
       *   - if project role
       *     - projectRole is not higher than own role
       *     - entitlement for project roles if projectRole is set
       *     - project is in org
       *  - if user exists
       *    - if org membership exists
       *      - if only project role is set (orgRole === Role.NONE)
       *         - create project role
       *         - audit log
       *         - return
       *      - else throw error
       *    - create org membership
       *    - audit log
       *    - if project role is set
       *     - create project role
       *    - audit log
       *    - send email
       * - else
       *  - create membership invitation
       *  - audit log
       *  - send email
       */

      if (
        // Require only project-level access rights if no orgRole is set but a projectId is
        input.projectId &&
        input.orgRole === Role.NONE
      ) {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "projectMembers:CUD",
        });
      } else {
        // Require org-level access rights
        throwIfNoOrganizationAccess({
          session: ctx.session,
          organizationId: input.orgId,
          scope: "organizationMembers:CUD",
        });
      }

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
            code: "FORBIDDEN",
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
              deletedAt: null,
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

        // early return if user is already a member of the org
        if (existingOrgMembership) {
          // user exists and only a project role shall be added
          if (
            input.orgRole === Role.NONE &&
            project &&
            input.projectRole &&
            input.projectRole !== Role.NONE
          ) {
            // Create project role for user
            const newProjectMembership =
              await ctx.prisma.projectMembership.create({
                data: {
                  userId: user.id,
                  projectId: project.id,
                  role: input.projectRole,
                  orgMembershipId: existingOrgMembership.id,
                },
              });

            // audit log
            await auditLog({
              session: ctx.session,
              resourceType: "projectMembership",
              resourceId: project.id + "--" + user.id,
              action: "create",
              after: newProjectMembership,
            });
            return;
          } else {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "User is already a member of this organization",
            });
          }
        }

        // create org membership as user is not a member yet
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
        try {
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
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "A pending membership invitation with this email and organization already exists",
            });
          } else {
            throw error;
          }
        }
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
      /**
       * Delete an organization membership, used in membership table
       */
      const orgMembership = await ctx.prisma.organizationMembership.findFirst({
        where: {
          orgId: input.orgId,
          id: input.orgMembershipId,
        },
        include: {
          ProjectMemberships: true,
        },
      });
      if (!orgMembership)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization membership not found",
        });

      // Check if user has access, either by having the correct role, or being the user themselves that is being deleted
      const hasAccess = hasOrganizationAccess({
        session: ctx.session,
        organizationId: input.orgId,
        scope: "organizationMembers:CUD",
      });
      if (!hasAccess && orgMembership.userId !== ctx.session.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to delete organization members",
        });

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
      /**
       * Delete a membership invitation, used in membership_invitation table
       */
      const invitation = await ctx.prisma.membershipInvitation.findFirst({
        where: {
          orgId: input.orgId,
          id: input.inviteId,
        },
      });
      if (!invitation) throw new TRPCError({ code: "NOT_FOUND" });

      if (
        !(
          hasOrganizationAccess({
            session: ctx.session,
            organizationId: input.orgId,
            scope: "organizationMembers:CUD",
          }) ||
          (invitation.projectId &&
            invitation.orgRole === Role.NONE &&
            hasProjectAccess({
              session: ctx.session,
              projectId: invitation.projectId,
              scope: "projectMembers:CUD",
            }))
        )
      )
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message:
            "You do not have sufficient rights to delete this invitation.",
        });

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
        role: z.enum(Role),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Used by dropdown in membership table to update the organization role of a user
       */

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
        projectRole: z.enum(Role).nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      /**
       * Used by dropdown in membership table to update the project role of a user
       */
      const hasAccess =
        hasOrganizationAccess({
          session: ctx.session,
          organizationId: input.orgId,
          scope: "organizationMembers:CUD",
        }) ||
        hasProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "projectMembers:CUD",
        });
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have the required access rights",
        });
      }

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

      // cannot edit project roles of users with higher org roles
      throwIfHigherRole({
        ownRole: ctx.session.orgRole,
        role: orgMembership.role,
      });

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
        return {
          userId: input.userId,
        };
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
