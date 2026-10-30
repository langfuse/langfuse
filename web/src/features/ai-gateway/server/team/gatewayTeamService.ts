import { createHash, randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";

import { Role } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  logger,
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

const MEMBER_SUGGESTION_LIMIT = 4;
const GATEWAY_USER_SCOPE = "gateway:invoke";

type GatewayInvitationEmail = Extract<
  NotificationEventType,
  { type: "AI_GATEWAY_INVITATION" }
>;

/** Client errors carry messages written for the user; others may leak internals. */
function getClientErrorMessage(error: unknown) {
  if (!(error instanceof TRPCError)) return null;
  const status = getHTTPStatusCodeFromError(error);
  return status >= 400 && status < 500 ? error.message : null;
}

/** Job ids are logged and used as Redis keys, so they carry a hash, not the address. */
function getInvitationJobId(payload: GatewayInvitationEmail) {
  const recipientHash = createHash("sha256")
    .update(payload.to.toLowerCase())
    .digest("hex");
  return `ai-gateway-invitation-${payload.orgId}-${payload.audience.kind}-${recipientHash}`;
}

function isEmailConfigured() {
  return Boolean(env.SMTP_CONNECTION_URL && env.EMAIL_FROM_ADDRESS);
}

/** Addresses are stored lowercase, so lookups and dedupe compare lowercase. */
function normalizeEmails(emails: string[]) {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()))];
}

type GatewayTeamContext = Pick<OrgAuthedContext, "session" | "prisma">;

/**
 * Owns every email the gateway setup sends: invitations for new people (with
 * the AI Gateway organization role) and the announcement to existing members who can use
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
    const count = await this.members.countMembersWithScope({
      organizationId: params.organizationId,
      scope: GATEWAY_USER_SCOPE,
      excludeUserId: params.currentUserId,
    });
    return { isEmailConfigured: isEmailConfigured(), count };
  }

  /**
   * Members to offer as quick picks: others who can use the gateway, not
   * already picked, optionally narrowed by name or email.
   */
  getMemberSuggestions(params: {
    organizationId: string;
    currentUserId: string;
    search: string;
    excludeEmails: string[];
  }) {
    return this.members.findMembersWithScope({
      organizationId: params.organizationId,
      scope: GATEWAY_USER_SCOPE,
      excludeUserId: params.currentUserId,
      excludeEmails: normalizeEmails(params.excludeEmails),
      search: params.search,
      limit: MEMBER_SUGGESTION_LIMIT,
    });
  }

  /**
   * Pairs each address with its organization member, or null when it would be
   * invited. Mirrors `inviteTeam`: the sender and members whose role can't use
   * the gateway are not notified.
   */
  async getInviteeMembers(params: {
    organizationId: string;
    currentUserId: string;
    emails: string[];
  }) {
    const emails = normalizeEmails(params.emails);
    const members = new Map(
      (
        await this.members.findMembersByEmail({
          organizationId: params.organizationId,
          emails,
          scope: GATEWAY_USER_SCOPE,
        })
      ).map((member) => [member.email.toLowerCase(), member]),
    );
    return emails.map((email) => {
      const member = members.get(email);
      return {
        email,
        member: member
          ? {
              name: member.name,
              isSelf: member.id === params.currentUserId,
              canUseGateway: member.hasScope,
            }
          : null,
      };
    });
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

    const emails = normalizeEmails(params.emails);
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
    let existingMemberCount = 0;
    for (const email of emails) {
      const member = existingMembers.get(email);
      // Typing a member's address means "tell them", so they get the member
      // announcement rather than an "already a member" invitation error.
      if (member) {
        if (member.id === ctx.session.user.id) continue;
        existingMemberCount += 1;
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
          input: { orgId: organizationId, email, orgRole: Role.AI_GATEWAY },
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
        const message = getClientErrorMessage(error);
        if (!message) {
          logger.error(
            "Failed to invite organization member to the AI Gateway",
            {
              organizationId,
              error,
            },
          );
        }
        failed.push({ email, message: message ?? "Invitation failed" });
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
      const jobs = emailJobs.map((payload) => ({
        name: QueueJobs.NotificationJob,
        data: {
          timestamp: new Date(),
          id: randomUUID(),
          payload,
          name: QueueJobs.NotificationJob as const,
        },
        // A repeated send while the same email is still queued is dropped.
        opts: { jobId: getInvitationJobId(payload) },
      }));
      // Failed jobs are kept for inspection, and a kept id would swallow the re-send.
      await Promise.all(
        jobs.map(async ({ opts }) => {
          const existing = await queue.getJob(opts.jobId);
          if (existing && (await existing.isFailed())) await existing.remove();
        }),
      );
      await queue.addBulk(jobs);
    }

    return {
      invitedCount: invited.size,
      /** Typed addresses of members other than the sender, notified or not. */
      existingMemberCount,
      failed,
      notifiedCount: notified.size,
    };
  }
}
