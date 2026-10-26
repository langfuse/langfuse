import { useState } from "react";
import { z } from "zod/v4";

import { MAX_TEAM_INVITES } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import type { TeamInviteFailure } from "@/src/features/ai-gateway/types/teamInviteFailure";

/** Invitee list for one invite attempt, keeping only failed addresses for a retry. */
export function useTeamInviteEmails() {
  const [emails, setEmails] = useState<string[]>([]);
  const [failures, setFailures] = useState<TeamInviteFailure[]>([]);

  const hasInvalidEmail = emails.some(
    (email) => !z.email().safeParse(email).success,
  );
  const hasTooManyEmails = emails.length > MAX_TEAM_INVITES;

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
    failures,
    isValid: !hasInvalidEmail && !hasTooManyEmails,
    errorMessage: hasTooManyEmails
      ? `You can invite up to ${MAX_TEAM_INVITES} people at once.`
      : undefined,
    startAttempt,
    keepFailed,
  };
}
