import { LangfuseConflictError } from "@langfuse/shared";
import { logger, traceException } from "@langfuse/shared/src/server";

import {
  getSfdcService,
  type SetUserRoleInput,
  type SfdcService,
} from "@/src/ee/features/sfdc-sync/server/sfdcService";
import { EntitlementLimitExceededError } from "@/src/features/entitlements/server/hasEntitlementLimit";
import {
  authorizeMemberInvite,
  inviteMember,
  MemberInviteError,
} from "@/src/features/rbac/server/inviteOrganizationMember";

type MemberInviteFailureReason =
  | "already_member"
  | "pending_invite"
  | "seat_limit"
  | "other";

type InviteMemberParams = Parameters<typeof inviteMember>[0];

/** Trims, lower-cases and dedupes addresses, as invitations store them. */
export function normalizeInviteEmails(emails: string[]) {
  const normalized = emails.map((email) => email.trim().toLowerCase());
  return [...new Set(normalized)].filter((email) => email.length > 0);
}

/**
 * Invites several emails with one set of roles. The request is authorized
 * once; each email then succeeds or fails on its own, in order, so earlier
 * invitations stay when a later one hits the seat limit.
 */
export async function inviteOrganizationMembers({
  ctx,
  input: { emails, ...roles },
  sendInvitationEmail,
}: {
  ctx: InviteMemberParams["ctx"];
  input: Omit<InviteMemberParams["input"], "email"> & { emails: string[] };
  sendInvitationEmail: InviteMemberParams["sendInvitationEmail"];
}) {
  const target = await authorizeMemberInvite({ ctx, input: roles });
  const sfdcUserRoles: SetUserRoleInput[] = [];
  const result = {
    invited: [] as string[],
    added: [] as string[],
    // Existing members who only gained a project role: no email goes to them.
    addedToProject: [] as string[],
    failed: [] as Array<{ email: string; reason: MemberInviteFailureReason }>,
  };
  // One at a time: each address's result stands on its own, and 50 take about 2 s.
  for (const email of emails) {
    try {
      const outcome = await inviteMember({
        ctx,
        target,
        input: { ...roles, email },
        sendInvitationEmail,
        syncSfdcUserRole: async (input) => {
          sfdcUserRoles.push(input);
        },
      });
      result[outcome].push(email);
    } catch (error) {
      const reason = getFailureReason(error);
      // One address failing must not fail the others, so an unexpected error is
      // reported here instead of surfacing as the request's 5xx.
      if (reason === "other") {
        logger.error("Failed to invite an organization member", {
          orgId: roles.orgId,
          error,
        });
        traceException(error);
      }
      result.failed.push({ email, reason });
    }
  }
  syncSfdcUserRolesInBackground(getSfdcService(), sfdcUserRoles);

  return result;
}

function getFailureReason(error: unknown): MemberInviteFailureReason {
  if (error instanceof MemberInviteError) return error.reason;
  if (error instanceof LangfuseConflictError) return "already_member";
  if (error instanceof EntitlementLimitExceededError) return "seat_limit";
  return "other";
}

/**
 * Each sync is a Mulesoft round trip of seconds, so a long list would hold
 * the response for minutes. They run in the background instead; each sync
 * logs its own delivery failures.
 */
export function syncSfdcUserRolesInBackground(
  sfdc: SfdcService | null,
  inputs: SetUserRoleInput[],
) {
  if (!sfdc || inputs.length === 0) return;
  Promise.all(inputs.map((input) => sfdc.setUserRole(input))).catch((error) => {
    logger.error("Failed to sync invited members to SFDC", { error });
  });
}
