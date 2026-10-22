import { Role } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { sendGatewayInvitationEmail } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { organizationRoleAccessRights } from "@/src/features/rbac";
import { inviteOrganizationMember } from "@/src/features/rbac/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

const MEMBER_PREVIEW_LIMIT = 4;
const EMAIL_SEND_CONCURRENCY = 10;

/** Org roles whose members can create their own gateway keys. */
const GATEWAY_USER_ROLES = Object.values(Role).filter((role) =>
  organizationRoleAccessRights[role].includes("gateway:invoke"),
);

function isEmailConfigured() {
  return Boolean(env.SMTP_CONNECTION_URL && env.EMAIL_FROM_ADDRESS);
}

type GatewayTeamContext = Pick<OrgAuthedContext, "session" | "prisma">;

/**
 * Owns every email the gateway setup sends: invitations for new people (as
 * organization members) and the announcement to existing members who can use
 * the gateway.
 */
export class GatewayTeamService {
  constructor(private readonly prisma: PrismaClient) {}

  async getInviteSummary(params: {
    organizationId: string;
    currentUserId: string;
  }) {
    const where = this.notifiableMembersWhere(params);
    const [memberCount, previewMembers] = await Promise.all([
      this.prisma.organizationMembership.count({ where }),
      this.prisma.organizationMembership.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: MEMBER_PREVIEW_LIMIT,
        select: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      }),
    ]);
    return {
      isEmailConfigured: isEmailConfigured(),
      notifiableMemberCount: memberCount,
      notifiableMemberPreview: previewMembers.map(({ user }) => user),
    };
  }

  async inviteTeam(params: {
    ctx: GatewayTeamContext;
    organizationId: string;
    emails: string[];
    notifyMembers: boolean;
  }) {
    const { ctx, organizationId } = params;
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    const inviter = {
      inviterName: ctx.session.user.name ?? ctx.session.user.email ?? "",
      inviterEmail: ctx.session.user.email ?? "",
    };
    const emails = [
      ...new Set(params.emails.map((email) => email.trim().toLowerCase())),
    ];

    const failed: Array<{ email: string; message: string }> = [];
    for (const email of emails) {
      try {
        await inviteOrganizationMember({
          ctx,
          input: { orgId: organizationId, email, orgRole: Role.MEMBER },
          sendInvitationEmail: ({ to, orgName, userExists }) =>
            sendGatewayInvitationEmail({
              env,
              audience: { kind: "invitee", hasAccount: userExists },
              to,
              orgName,
              orgId: organizationId,
              ...inviter,
            }),
        });
      } catch (error) {
        failed.push({
          email,
          message: error instanceof Error ? error.message : "Invitation failed",
        });
      }
    }

    const notifiedCount = params.notifyMembers
      ? await this.notifyMembers({
          ctx,
          organizationId,
          orgName: organization.name,
          excludeEmails: new Set(emails),
          inviter,
        })
      : 0;

    return {
      invitedCount: emails.length - failed.length,
      failed,
      notifiedCount,
    };
  }

  private async notifyMembers(params: {
    ctx: GatewayTeamContext;
    organizationId: string;
    orgName: string;
    excludeEmails: Set<string>;
    inviter: { inviterName: string; inviterEmail: string };
  }) {
    if (!isEmailConfigured()) return 0;

    const memberships = await this.prisma.organizationMembership.findMany({
      where: this.notifiableMembersWhere({
        organizationId: params.organizationId,
        currentUserId: params.ctx.session.user.id,
      }),
      select: { user: { select: { email: true } } },
    });
    const recipients = memberships
      .map(({ user }) => user.email?.toLowerCase())
      .filter(
        (email): email is string =>
          email !== undefined && !params.excludeEmails.has(email),
      );

    for (let i = 0; i < recipients.length; i += EMAIL_SEND_CONCURRENCY) {
      await Promise.all(
        recipients.slice(i, i + EMAIL_SEND_CONCURRENCY).map((to) =>
          sendGatewayInvitationEmail({
            env,
            audience: { kind: "member" },
            to,
            orgName: params.orgName,
            orgId: params.organizationId,
            ...params.inviter,
          }),
        ),
      );
    }
    return recipients.length;
  }

  private notifiableMembersWhere(params: {
    organizationId: string;
    currentUserId: string;
  }) {
    return {
      orgId: params.organizationId,
      role: { in: GATEWAY_USER_ROLES },
      userId: { not: params.currentUserId },
      user: { email: { not: null } },
    };
  }
}
