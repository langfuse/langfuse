import { useState } from "react";
import { z } from "zod/v4";

import { MAX_TEAM_INVITES } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import type { TeamInviteFailure } from "@/src/features/ai-gateway/types/teamInviteFailure";
import type { RouterOutputs } from "@/src/utils/api";

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

  const hasInvalidEmail = emails.some(
    (email) => !z.email().safeParse(email).success,
  );
  const hasTooManyEmails = emails.length > MAX_TEAM_INVITES;

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
    errorMessage: hasTooManyEmails
      ? `You can invite up to ${MAX_TEAM_INVITES} people at once.`
      : undefined,
    startAttempt,
    keepFailed,
  };
}
