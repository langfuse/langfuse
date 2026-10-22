import { Role } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import { sendGatewayInvitationEmail } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  inviteOrganizationMember,
  OrganizationMembersService,
} from "@/src/features/rbac/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

const MEMBER_PREVIEW_LIMIT = 4;
const EMAIL_SEND_CONCURRENCY = 10;
const GATEWAY_USER_SCOPE = "gateway:invoke";

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
  private readonly members: OrganizationMembersService;

  constructor(prisma: PrismaClient) {
    this.members = new OrganizationMembersService(prisma);
  }

  async getNotifiableMembers(params: {
    organizationId: string;
    currentUserId: string;
  }) {
    const query = {
      organizationId: params.organizationId,
      scope: GATEWAY_USER_SCOPE,
      excludeUserId: params.currentUserId,
    } as const;
    const [count, preview] = await Promise.all([
      this.members.countMembersWithScope(query),
      this.members.findMembersWithScope({
        ...query,
        limit: MEMBER_PREVIEW_LIMIT,
      }),
    ]);
    return { isEmailConfigured: isEmailConfigured(), count, preview };
  }

  async inviteTeam(params: {
    ctx: GatewayTeamContext;
    organizationId: string;
    emails: string[];
    notifyMembers: boolean;
  }) {
    const { ctx, organizationId } = params;
    const orgName = await this.members.getOrganizationName(organizationId);
    const inviter = {
      inviterName: ctx.session.user.name ?? ctx.session.user.email ?? "",
      inviterEmail: ctx.session.user.email ?? "",
    };
    const emails = [
      ...new Set(params.emails.map((email) => email.trim().toLowerCase())),
    ];

    const invited = new Set<string>();
    const failed: Array<{ email: string; message: string }> = [];
    for (const email of emails) {
      try {
        await inviteOrganizationMember({
          ctx,
          input: { orgId: organizationId, email, orgRole: Role.MEMBER },
          sendInvitationEmail: ({ to, userExists }) =>
            sendGatewayInvitationEmail({
              env,
              audience: { kind: "invitee", hasAccount: userExists },
              to,
              orgName,
              orgId: organizationId,
              ...inviter,
            }),
        });
        invited.add(email);
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
          orgName,
          excludeEmails: invited,
          inviter,
        })
      : 0;

    return {
      invitedCount: invited.size,
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

    const members = await this.members.findMembersWithScope({
      organizationId: params.organizationId,
      scope: GATEWAY_USER_SCOPE,
      excludeUserId: params.ctx.session.user.id,
    });
    const recipients = members
      .map(({ email }) => email.toLowerCase())
      .filter((email) => !params.excludeEmails.has(email));

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
}
