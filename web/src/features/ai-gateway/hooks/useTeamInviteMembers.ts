import { keepPreviousData } from "@tanstack/react-query";
import { z } from "zod/v4";

import { MAX_TEAM_INVITES } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import type {
  TeamInviteMember,
  TeamInviteMembers,
} from "@/src/features/ai-gateway/types/teamInviteMembers";
import { api } from "@/src/utils/api";

/**
 * Looks up which invitee addresses already belong to the organization.
 * `knownMembers` (e.g. the member preview) resolve immediately, so picking one
 * does not wait for the lookup.
 */
export function useTeamInviteMembers({
  organizationId,
  emails,
  knownMembers = [],
}: {
  organizationId: string;
  emails: string[];
  /** Other members who can use the gateway, like the notifiable member preview. */
  knownMembers?: Array<Pick<TeamInviteMember, "name"> & { email: string }>;
}): TeamInviteMembers {
  const lookupEmails = emails
    .filter((email) => z.email().safeParse(email).success)
    .slice(0, MAX_TEAM_INVITES);
  const query = api.aiGateway.getInviteeMembers.useQuery(
    { orgId: organizationId, emails: lookupEmails },
    { enabled: lookupEmails.length > 0, placeholderData: keepPreviousData },
  );

  const members = new Map<string, TeamInviteMember | null>(
    (query.data ?? []).map(({ email, member }) => [email, member]),
  );
  for (const { email, name } of knownMembers) {
    members.set(email.toLowerCase(), {
      name,
      isSelf: false,
      canUseGateway: true,
    });
  }
  return members;
}
