import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient, Role } from "@langfuse/shared";

import { auditLog } from "@/src/features/audit-logs/server";
import { getSfdcService } from "@/src/ee/features/sfdc-sync/server";
import {
  createWithinEntitlementLimit,
  hasEntitlement,
} from "@/src/features/entitlements/server";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { throwIfHigherProjectRole } from "@/src/features/rbac/server/throwIfHigherProjectRole";
import { throwIfHigherRole } from "@/src/features/rbac/server/throwIfHigherRole";
import { requireGatewayEnabledForRole } from "@/src/features/ai-gateway/server/availability";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

async function createProjectMembershipOrThrowIfDuplicate({
  prisma,
  data,
}: {
  prisma: PrismaClient | Prisma.TransactionClient;
  data: {
    userId: string;
    projectId: string;
    role: Role;
    orgMembershipId: string;
  };
}) {
  try {
    return await prisma.projectMembership.create({ data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User is already a member of this project",
      });
    }
    throw error;
  }
}

async function createOrgMembershipOrThrowIfDuplicate({
  prisma,
  data,
}: {
  prisma: PrismaClient | Prisma.TransactionClient;
  data: {
    userId: string;
    orgId: string;
    role: Role;
  };
}) {
  try {
    return await prisma.organizationMembership.create({ data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User is already a member of this organization",
      });
    }
    throw error;
  }
}

type InviteOrganizationMemberParams = {
  ctx: Pick<OrgAuthedContext, "session" | "prisma">;
  input: {
    orgId: string;
    email: string;
    orgRole: Role;
    projectId?: string;
    projectRole?: Role;
  };
  /** Callers pick the email, e.g. the generic organization invite or the AI Gateway invite. */
  sendInvitationEmail: (recipient: {
    to: string;
    orgName: string;
    userExists: boolean;
  }) => Promise<void>;
};

/**
 * Adds a user to the organization, or creates a pending invitation when no
 * account exists yet, within the member seat limit, then sends the email.
 */
export async function inviteOrganizationMember({
  ctx,
  input,
  sendInvitationEmail,
}: InviteOrganizationMemberParams) {
  /**
   * Create a new organization membership
   * - Checks for:
   *   - project is in org (throws if not)
   *   - scope: organizationMembers:CUD if not only project-role is set, then projectMembers:CUD
   *   - orgRole is not higher than own role
   *   - if project role
   *     - projectRole is not higher than own role
   *     - entitlement for project roles if projectRole is set
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

  // The project must belong to the target org before its project-level
  // rights can stand in for organizationMembers:CUD below.
  const project = input.projectId
    ? await ctx.prisma.project.findFirst({
        where: {
          id: input.projectId,
          orgId: input.orgId,
          deletedAt: null,
        },
      })
    : null;
  if (input.projectId && !project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }

  if (
    // Require only project-level access rights if no orgRole is set but a projectId is
    project &&
    input.orgRole === Role.NONE
  ) {
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: project.id,
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
  requireGatewayEnabledForRole(input.orgId, input.orgRole);

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

  // Members and pending invitations both consume a seat, so the limit
  // check counts them together. Reads through the caller-supplied client
  // so it can run inside the limit transaction.
  const countSeatsInUse = async (tx: Prisma.TransactionClient) => {
    const memberCount = await tx.organizationMembership.count({
      where: { orgId: input.orgId },
    });
    const pendingInviteCount = await tx.membershipInvitation.count({
      where: { orgId: input.orgId },
    });
    return memberCount + pendingInviteCount;
  };

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
          await createProjectMembershipOrThrowIfDuplicate({
            prisma: ctx.prisma,
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
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User is already a member of this organization",
      });
    }

    // A project membership can outlive this org's membership (e.g. a stray
    // row referencing another org). Reject the duplicate before creating
    // the org membership so a failed project insert cannot leave a
    // committed org membership (and consumed seat) behind.
    if (
      project &&
      input.projectRole &&
      input.projectRole !== Role.NONE &&
      (await ctx.prisma.projectMembership.findUnique({
        where: {
          projectId_userId: { projectId: project.id, userId: user.id },
        },
      }))
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User is already a member of this project",
      });
    }

    // create org membership as user is not a member yet, unless that
    // would exceed the member limit. On limited plans this runs inside the
    // entitlement transaction, so creating the project membership here too
    // keeps both inserts atomic: a duplicate-project-membership rejection
    // rolls back the org membership instead of leaving a consumed seat.
    const { orgMembership, projectMembership } =
      await createWithinEntitlementLimit({
        prisma: ctx.prisma,
        orgId: input.orgId,
        entitlementLimit: "organization-member-count",
        sessionUser: ctx.session.user,
        countCurrentUsage: countSeatsInUse,
        create: async (tx) => {
          const createdOrgMembership =
            await createOrgMembershipOrThrowIfDuplicate({
              prisma: tx,
              data: {
                userId: user.id,
                orgId: input.orgId,
                role: input.orgRole,
              },
            });
          const createdProjectMembership =
            project && input.projectRole && input.projectRole !== Role.NONE
              ? await createProjectMembershipOrThrowIfDuplicate({
                  prisma: tx,
                  data: {
                    userId: user.id,
                    projectId: project.id,
                    role: input.projectRole,
                    orgMembershipId: createdOrgMembership.id,
                  },
                })
              : null;
          return {
            orgMembership: createdOrgMembership,
            projectMembership: createdProjectMembership,
          };
        },
      });
    await auditLog({
      session: ctx.session,
      resourceType: "orgMembership",
      resourceId: orgMembership.id,
      action: "create",
      after: orgMembership,
    });
    // SFDC: link existing lead to org as a member.
    await getSfdcService()?.setUserRole({
      orgId: input.orgId,
      userId: user.id,
      email: user.email,
      role: input.orgRole,
    });
    if (projectMembership) {
      await auditLog({
        session: ctx.session,
        resourceType: "projectMembership",
        resourceId:
          projectMembership.projectId + "--" + projectMembership.userId,
        action: "create",
        after: projectMembership,
      });
    }
    await sendInvitationEmail({
      to: input.email,
      orgName: org.name,
      userExists: true,
    });
  } else {
    try {
      // create the invitation unless that would exceed the member limit
      const invitation = await createWithinEntitlementLimit({
        prisma: ctx.prisma,
        orgId: input.orgId,
        entitlementLimit: "organization-member-count",
        sessionUser: ctx.session.user,
        countCurrentUsage: countSeatsInUse,
        create: (tx) =>
          tx.membershipInvitation.create({
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
          }),
      });

      await auditLog({
        session: ctx.session,
        resourceType: "membershipInvitation",
        resourceId: invitation.id,
        action: "create",
        after: invitation,
      });
      await sendInvitationEmail({
        to: input.email,
        orgName: org.name,
        userExists: false,
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
}
