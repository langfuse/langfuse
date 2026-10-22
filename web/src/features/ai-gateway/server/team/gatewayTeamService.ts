import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";

import { Role } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  type NotificationEventType,
  NotificationQueue,
  QueueJobs,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  inviteOrganizationMember,
  OrganizationMembersService,
} from "@/src/features/rbac/server";
import type { OrgAuthedContext } from "@/src/server/api/trpc";

const MEMBER_PREVIEW_LIMIT = 4;
const GATEWAY_USER_SCOPE = "gateway:invoke";

type GatewayInvitationEmail = Extract<
  NotificationEventType,
  { type: "AI_GATEWAY_INVITATION" }
>;

function isEmailConfigured() {
  return Boolean(env.SMTP_CONNECTION_URL && env.EMAIL_FROM_ADDRESS);
}

type GatewayTeamContext = Pick<OrgAuthedContext, "session" | "prisma">;

/**
 * Owns every email the gateway setup sends: invitations for new people (as
 * organization members) and the announcement to existing members who can use
 * the gateway. Emails are queued, one job per recipient, and sent by the worker.
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
    const sendsEmail = isEmailConfigured();
    const queue = sendsEmail ? NotificationQueue.getInstance() : null;
    // Checked before inviting so a missing queue does not leave invitations without emails.
    if (sendsEmail && !queue) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The email queue is unavailable. Try again later.",
      });
    }

    const orgName = await this.members.getOrganizationName(organizationId);
    const sender = {
      type: "AI_GATEWAY_INVITATION",
      orgId: organizationId,
      orgName,
      inviterName: ctx.session.user.name ?? ctx.session.user.email ?? "",
      inviterEmail: ctx.session.user.email ?? "",
    } as const;
    const emailJobs: GatewayInvitationEmail[] = [];

    const emails = [
      ...new Set(params.emails.map((email) => email.trim().toLowerCase())),
    ];
    const existingMembers = new Map(
      (
        await this.members.findMembersByEmail({
          organizationId,
          emails,
          scope: GATEWAY_USER_SCOPE,
        })
      ).map((member) => [member.email.toLowerCase(), member]),
    );

    const invited = new Set<string>();
    const notified = new Set<string>();
    const failed: Array<{ email: string; message: string }> = [];
    for (const email of emails) {
      const member = existingMembers.get(email);
      // Typing a member's address means "tell them", so they get the member
      // announcement rather than an "already a member" invitation error.
      if (member) {
        if (member.id === ctx.session.user.id) continue;
        if (!member.hasScope) {
          failed.push({
            email,
            message:
              "Already a member, but their role can't use the AI Gateway",
          });
          continue;
        }
        if (sendsEmail) {
          emailJobs.push({
            ...sender,
            to: email,
            receiverName: member.name ?? undefined,
            audience: { kind: "member" },
          });
          notified.add(email);
        }
        continue;
      }

      try {
        await inviteOrganizationMember({
          ctx,
          input: { orgId: organizationId, email, orgRole: Role.MEMBER },
          sendInvitationEmail: async ({ to, userExists }) => {
            emailJobs.push({
              ...sender,
              to,
              audience: { kind: "invitee", hasAccount: userExists },
            });
          },
        });
        invited.add(email);
      } catch (error) {
        failed.push({
          email,
          message: error instanceof Error ? error.message : "Invitation failed",
        });
      }
    }

    if (params.notifyMembers && sendsEmail) {
      const members = await this.members.findMembersWithScope({
        organizationId,
        scope: GATEWAY_USER_SCOPE,
        excludeUserId: ctx.session.user.id,
      });
      for (const { email, name } of members) {
        const to = email.toLowerCase();
        if (invited.has(to) || notified.has(to)) continue;
        emailJobs.push({
          ...sender,
          to,
          receiverName: name ?? undefined,
          audience: { kind: "member" },
        });
        notified.add(to);
      }
    }

    if (queue && emailJobs.length > 0) {
      await queue.addBulk(
        emailJobs.map((payload) => ({
          name: QueueJobs.NotificationJob,
          data: {
            timestamp: new Date(),
            id: randomUUID(),
            payload,
            name: QueueJobs.NotificationJob,
          },
          // A repeated send while the same email is still queued is dropped.
          opts: {
            jobId: `ai-gateway-invitation-${organizationId}-${payload.audience.kind}-${payload.to}`,
          },
        })),
      );
    }

    return {
      invitedCount: invited.size,
      failed,
      notifiedCount: notified.size,
    };
  }
}
