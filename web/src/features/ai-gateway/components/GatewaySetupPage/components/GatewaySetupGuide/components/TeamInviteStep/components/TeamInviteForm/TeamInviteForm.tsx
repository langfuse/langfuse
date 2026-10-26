import { useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { TeamInviteFailuresAlert } from "@/src/features/ai-gateway/components/TeamInviteFailuresAlert";
import { TeamInviteFields } from "@/src/features/ai-gateway/components/TeamInviteFields/TeamInviteFields";
import type {
  GatewayNotifiableMembers,
  GatewayTeamInviteResult,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { getInviteeKind } from "@/src/features/ai-gateway/fns/getInviteeKind";
import type { useTeamInviteEmails } from "@/src/features/ai-gateway/hooks/useTeamInviteEmails";
import type { TeamInviteMembers } from "@/src/features/ai-gateway/types/teamInviteMembers";

export type TeamInviteFormProps = {
  /** Undefined while loading. */
  notifiableMembers: GatewayNotifiableMembers | undefined;
  invitees: ReturnType<typeof useTeamInviteEmails>;
  inviteeMembers: TeamInviteMembers;
  isInviting: boolean;
  /** Resolves to null when the request failed and was already reported. */
  onInvite: (params: {
    emails: string[];
    notifyMembers: boolean;
  }) => Promise<GatewayTeamInviteResult | null>;
  onFinish: (outcome: { isSkipped: boolean }) => void;
};

/** Picked addresses, or every member plus the addresses that are not members. */
function getRecipientCount({
  emails,
  members,
  allMemberCount,
}: {
  emails: string[];
  members: TeamInviteMembers;
  allMemberCount: number | undefined;
}) {
  if (allMemberCount === undefined) return emails.length;
  const nonMemberCount = emails.filter(
    (email) => getInviteeKind(email, members) !== "member",
  ).length;
  return allMemberCount + nonMemberCount;
}

function getNotifyLabel(recipientCount: number) {
  if (recipientCount === 0) return "Notify people";
  if (recipientCount === 1) return "Notify 1 person";
  return `Notify ${recipientCount} people`;
}

export function TeamInviteForm({
  notifiableMembers,
  invitees,
  inviteeMembers,
  isInviting,
  onInvite,
  onFinish,
}: TeamInviteFormProps) {
  const [isAllSelected, setIsAllSelected] = useState(false);
  // Retrying failed invites must not announce the gateway to every member again.
  const [haveMembersBeenNotified, setHaveMembersBeenNotified] = useState(false);

  const canNotify =
    !haveMembersBeenNotified &&
    notifiableMembers !== undefined &&
    notifiableMembers.isEmailConfigured &&
    notifiableMembers.count > 0;
  const willNotifyAll = canNotify && isAllSelected;
  const recipientCount = getRecipientCount({
    emails: invitees.emails,
    members: inviteeMembers,
    allMemberCount: willNotifyAll ? notifiableMembers.count : undefined,
  });

  async function handleSend() {
    invitees.startAttempt();
    const result = await onInvite({
      emails: invitees.emails,
      notifyMembers: willNotifyAll,
    });
    if (!result) return;
    if (willNotifyAll) setHaveMembersBeenNotified(true);
    if (result.failed.length > 0) {
      invitees.keepFailed(result.failed);
      return;
    }
    onFinish({ isSkipped: false });
  }

  function handleSkip() {
    onFinish({ isSkipped: true });
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <TeamInviteFields
        emails={invitees.emails}
        onEmailsChange={invitees.setEmails}
        members={inviteeMembers}
        errorMessage={invitees.errorMessage}
        memberSuggestions={
          canNotify
            ? {
                memberCount: notifiableMembers.count,
                previewMembers: notifiableMembers.preview,
                isAllSelected,
                onAllSelectedChange: setIsAllSelected,
              }
            : undefined
        }
      />
      {invitees.failures.length > 0 ? (
        <TeamInviteFailuresAlert failures={invitees.failures} />
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          text={getNotifyLabel(recipientCount)}
          loading={isInviting}
          disabled={!invitees.isValid || recipientCount === 0}
          onClick={handleSend}
        />
        <Button text="Skip for now" variant="ghost" onClick={handleSkip} />
      </div>
    </div>
  );
}
