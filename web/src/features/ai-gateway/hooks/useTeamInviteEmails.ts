import { useState } from "react";

import { MAX_TEAM_INVITES } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import type { TeamInviteFailure } from "@/src/features/ai-gateway/types/teamInviteFailure";
import type { RouterOutputs } from "@/src/utils/api";
import { isEmail } from "@/src/utils/isEmail";

type PickedMember = Pick<
  RouterOutputs["aiGateway"]["getMemberSuggestions"][number],
  "email" | "name"
>;

/**
 * Invitee list for one invite attempt, keeping only failed addresses for a
 * retry, plus the text still being typed, which doubles as the member search.
 * Picked members are kept so their chips show a name before any lookup returns.
 */
export function useTeamInviteEmails() {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [failures, setFailures] = useState<TeamInviteFailure[]>([]);
  const [pickedMembers, setPickedMembers] = useState<PickedMember[]>([]);

  const invalidEmail = emails.find((email) => !isEmail(email));
  const hasInvalidEmail = invalidEmail !== undefined;
  const hasTooManyEmails = emails.length > MAX_TEAM_INVITES;

  /** Names the first invalid entry, since a long list scrolls it out of sight. */
  function getErrorMessage() {
    if (hasTooManyEmails)
      return `You can invite up to ${MAX_TEAM_INVITES} people at once.`;
    if (hasInvalidEmail)
      return `“${invalidEmail}” isn't an email address. Select it to fix it.`;
    return undefined;
  }

  function addMember(member: PickedMember) {
    const email = member.email.toLowerCase();
    setDraft("");
    setPickedMembers((current) => [...current, member]);
    setEmails((current) =>
      current.includes(email) ? current : [...current, email],
    );
  }

  function startAttempt() {
    setFailures([]);
  }

  function keepFailed(failed: TeamInviteFailure[]) {
    setFailures(failed);
    setEmails(failed.map((failure) => failure.email));
  }

  return {
    emails,
    setEmails,
    draft,
    setDraft,
    pickedMembers,
    addMember,
    failures,
    isValid: !hasInvalidEmail && !hasTooManyEmails,
    errorMessage: getErrorMessage(),
    startAttempt,
    keepFailed,
  };
}
