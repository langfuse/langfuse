import { useState } from "react";

import type { TeamInviteFieldsProps } from "@/src/features/ai-gateway/components/TeamInviteFields/TeamInviteFields";
import { getInviteeKind } from "@/src/features/ai-gateway/fns/getInviteeKind";
import type { useTeamRecipients } from "@/src/features/ai-gateway/hooks/useTeamRecipients";
import type { TeamInviteFailure } from "@/src/features/ai-gateway/types/teamInviteFailure";
import type { TeamInviteMembers } from "@/src/features/ai-gateway/types/teamInviteMembers";

/**
 * Picked addresses that get an email, or every member plus the picked people
 * outside the organization. People outside are invited even without email;
 * members only hear about it when email is configured.
 */
function getRecipientCount({
  emails,
  members,
  allMemberCount,
  isEmailConfigured,
}: {
  emails: string[];
  members: TeamInviteMembers;
  allMemberCount: number | undefined;
  isEmailConfigured: boolean;
}) {
  const kinds = emails.map((email) => getInviteeKind(email, members));
  const outsiderCount = kinds.filter(
    (kind) => kind === "external" || kind === "pending",
  ).length;
  if (allMemberCount !== undefined) return allMemberCount + outsiderCount;
  if (!isEmailConfigured) return outsiderCount;
  return outsiderCount + kinds.filter((kind) => kind === "member").length;
}

/**
 * Mirrors the server's name or email match, so results still showing for an
 * older search are neither offered nor picked by Enter.
 */
function matchesSearch(
  member: { name: string | null; email: string },
  search: string,
) {
  const term = search.trim().toLowerCase();
  return [member.name, member.email].some((value) =>
    value?.toLowerCase().includes(term),
  );
}

function getNotifyLabel(recipientCount: number) {
  if (recipientCount === 0) return "Notify people";
  if (recipientCount === 1) return "Notify 1 person";
  return `Notify ${recipientCount} people`;
}

/**
 * Notify-your-team form state shared by the setup step and the dialog: whether
 * every member is picked, the send label, and one send attempt that keeps only
 * failed addresses for a retry.
 */
export function useTeamNotifyForm({
  notifiableMembers,
  suggestedMembers,
  invitees,
  inviteeMembers,
}: ReturnType<typeof useTeamRecipients>) {
  const [isAllSelected, setIsAllSelected] = useState(false);
  // Retrying failed invites must not announce the gateway to every member again.
  const [haveMembersBeenNotified, setHaveMembersBeenNotified] = useState(false);

  const canNotify =
    !haveMembersBeenNotified &&
    notifiableMembers !== undefined &&
    notifiableMembers.isEmailConfigured &&
    notifiableMembers.count > 0;
  const notifyMembers = canNotify && isAllSelected;
  const recipientCount = getRecipientCount({
    emails: invitees.emails,
    members: inviteeMembers,
    allMemberCount: notifyMembers ? notifiableMembers.count : undefined,
    // Assume email works until the config loads, so the label does not flicker.
    isEmailConfigured: notifiableMembers?.isEmailConfigured ?? true,
  });

  // Suggestions lag picks and the typed text by one request, so they are re-checked here.
  const currentSuggestions = suggestedMembers.filter(
    (member) =>
      !invitees.emails.includes(member.email.toLowerCase()) &&
      matchesSearch(member, invitees.draft),
  );

  const fieldsProps: TeamInviteFieldsProps = {
    emails: invitees.emails,
    onEmailsChange: invitees.setEmails,
    draft: invitees.draft,
    onDraftChange: invitees.setDraft,
    members: inviteeMembers,
    errorMessage: invitees.errorMessage,
    memberSuggestions: canNotify
      ? {
          memberCount: notifiableMembers.count,
          suggestedMembers: currentSuggestions,
          onMemberAdd: invitees.addMember,
          isAllSelected,
          onAllSelectedChange: setIsAllSelected,
        }
      : undefined,
  };

  /** Resolves to true once every recipient was handled. */
  async function send(
    invite: (params: {
      emails: string[];
      notifyMembers: boolean;
    }) => Promise<{ failed: TeamInviteFailure[] } | null>,
  ) {
    invitees.startAttempt();
    const result = await invite({ emails: invitees.emails, notifyMembers });
    if (!result) return false;
    if (notifyMembers) setHaveMembersBeenNotified(true);
    if (result.failed.length > 0) {
      invitees.keepFailed(result.failed);
      return false;
    }
    return true;
  }

  return {
    fieldsProps,
    failures: invitees.failures,
    sendLabel: getNotifyLabel(recipientCount),
    canSend: invitees.isValid && recipientCount > 0,
    send,
  };
}
