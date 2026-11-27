import { TRPCError } from "@trpc/server";
import { Prisma, Role } from "@langfuse/shared";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import type { SetUserRoleInput } from "@/src/ee/features/sfdc-sync/server/sfdcService";
import { createWithinEntitlementLimit } from "@/src/features/entitlements/server/createWithinEntitlementLimit";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import {
  createOrgMembership,
  createProjectMembership,
} from "@langfuse/shared/memberships";
import { throwIfNoOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  ALREADY_ORGANIZATION_MEMBER_MESSAGE,
  ALREADY_PROJECT_MEMBER_MESSAGE,
  PENDING_MEMBERSHIP_INVITE_MESSAGE,
} from "@/src/features/rbac/constants/membershipErrorMessages";
import {
  assertValidOrgOwnershipChange,
  assertValidProjectOwnershipChange,
} from "@/src/features/rbac/server/ownershipChange";
import { requireGatewayEnabledForRole } from "@/src/features/ai-gateway/server/availability";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

type MemberInviteContext = Pick<OrgAuthedContext, "session" | "prisma">;

type MemberInviteRoles = {
  orgId: string;
  orgRole: Role;
  projectId?: string;
  projectRole?: Role;
};

/** The organization and optional project every email of one request is invited to. */
type MemberInviteTarget = {
  org: { id: string; name: string };
  project: { id: string } | null;
};

/** Why one email of a request was not invited; codes and messages stay the ones callers show. */
export class MemberInviteError extends TRPCError {
  readonly reason: "already_member" | "pending_invite";

  constructor(reason: MemberInviteError["reason"], message: string) {
    super({ code: "BAD_REQUEST", message });
    this.reason = reason;
  }
}

type InviteMemberParams = {
  ctx: MemberInviteContext;
  input: MemberInviteRoles & { email: string };
  /** Callers pick the email, e.g. the generic organization invite or the AI Gateway invite. */
  sendInvitationEmail: (recipient: {
    to: string;
    orgName: string;
    userExists: boolean;
  }) => Promise<void>;
  /**
   * Links an existing user to the org in SFDC, one Mulesoft round trip that
   * can take seconds: callers collect the syncs and run them outside their
   * invite loop.
   */
  syncSfdcUserRole: (input: SetUserRoleInput) => Promise<unknown>;
};

/**
 * Adds a user to the organization, or creates a pending invitation when no
 * account exists yet, within the member seat limit, then sends the email.
 */
export async function inviteOrganizationMember(params: InviteMemberParams) {
  const target = await authorizeMemberInvite({
    ctx: params.ctx,
    input: params.input,
  });
  return inviteMember({ ...params, target });
}

/**
 * Checks everything about an invite request that does not depend on the
 * email, and resolves its organization and project:
 * - the project belongs to the org
 * - scope: organizationMembers:CUD, or projectMembers:CUD when only a project role is set
 * - orgRole is not higher than the inviter's role, and the gateway is on for AI_GATEWAY
 * - a project role needs the rbac-project-roles entitlement and is not higher than the inviter's
 */
export async function authorizeMemberInvite({
  ctx,
  input,
}: {
  ctx: MemberInviteContext;
  input: MemberInviteRoles;
}): Promise<MemberInviteTarget> {
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

  await assertValidOrgOwnershipChange({
    tx: ctx.prisma,
    session: ctx.session,
    orgId: input.orgId,
    from: undefined,
    to: input.orgRole,
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

  if (project && input.projectRole)
    await assertValidProjectOwnershipChange({
      tx: ctx.prisma,
      session: ctx.session,
      orgId: input.orgId,
      from: undefined,
      to: input.projectRole,
    });

  const org = await ctx.prisma.organization.findFirst({
    where: {
      id: input.orgId,
    },
  });
  if (!org) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Org not found" });
  }

  return { org, project };
}

/**
 * Invites one email to an authorized target:
 * - an existing user joins the org (and project) at once; an existing member
 *   only gains the project role when no org role is set, with no email
 * - anyone else gets a pending invitation
 * A new member or invitation counts against the seat limit and gets the email;
 * every outcome writes an audit log.
 */
export async function inviteMember({
  ctx,
  target: { org, project },
  input,
  sendInvitationEmail,
  syncSfdcUserRole,
}: InviteMemberParams & { target: MemberInviteTarget }) {
  const user = await ctx.prisma.user.findUnique({
    where: {
      email: input.email.toLowerCase(),
    },
  });

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
        const newProjectMembership = await createProjectMembership(ctx.prisma, {
          orgId: input.orgId,
          userId: user.id,
          projectId: project.id,
          role: input.projectRole,
          orgMembershipId: existingOrgMembership.id,
        });

        // audit log
        await auditLog({
          session: ctx.session,
          resourceType: "projectMembership",
          resourceId: project.id + "--" + user.id,
          action: "create",
          after: newProjectMembership,
        });
        return "addedToProject";
      }
      throw new MemberInviteError(
        "already_member",
        ALREADY_ORGANIZATION_MEMBER_MESSAGE,
      );
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
      throw new MemberInviteError(
        "already_member",
        ALREADY_PROJECT_MEMBER_MESSAGE,
      );
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
          const createdOrgMembership = await createOrgMembership(tx, {
            userId: user.id,
            orgId: input.orgId,
            role: input.orgRole,
          });
          const createdProjectMembership =
            project && input.projectRole && input.projectRole !== Role.NONE
              ? await createProjectMembership(tx, {
                  orgId: input.orgId,
                  userId: user.id,
                  projectId: project.id,
                  role: input.projectRole,
                  orgMembershipId: createdOrgMembership.id,
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
    await syncSfdcUserRole({
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
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new MemberInviteError(
          "pending_invite",
          PENDING_MEMBERSHIP_INVITE_MESSAGE,
        );
      } else {
        throw error;
      }
    }
  }
  return user ? "added" : "invited";
}
