import { useTeamInviteEmails } from "@/src/features/ai-gateway/hooks/useTeamInviteEmails";
import { useTeamInviteMembers } from "@/src/features/ai-gateway/hooks/useTeamInviteMembers";
import { useTeamInviteMemberSuggestions } from "@/src/features/ai-gateway/hooks/useTeamInviteMemberSuggestions";
import { api } from "@/src/utils/api";

/**
 * Everything the team picker reads: the members who can be notified, quick
 * picks for the typed text, the picked addresses, and which of them are members.
 */
export function useTeamRecipients(organizationId: string) {
  const notifiableMembersQuery = api.aiGateway.getNotifiableMembers.useQuery({
    orgId: organizationId,
  });
  const notifiableMembers = notifiableMembersQuery.data;
  const invitees = useTeamInviteEmails();
  const suggestedMembers = useTeamInviteMemberSuggestions({
    organizationId,
    search: invitees.draft,
    excludeEmails: invitees.emails,
    enabled:
      notifiableMembers !== undefined &&
      notifiableMembers.isEmailConfigured &&
      notifiableMembers.count > 0,
  });
  const inviteeMembers = useTeamInviteMembers({
    organizationId,
    emails: invitees.emails,
    knownMembers: [...suggestedMembers, ...invitees.pickedMembers],
  });

  return { notifiableMembers, suggestedMembers, invitees, inviteeMembers };
}
