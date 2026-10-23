import { useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { TeamInviteFailuresAlert } from "@/src/features/ai-gateway/components/TeamInviteFailuresAlert";
import { TeamInviteFields } from "@/src/features/ai-gateway/components/TeamInviteFields/TeamInviteFields";
import type {
  GatewayNotifiableMembers,
  GatewayTeamInviteResult,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { useTeamInviteEmails } from "@/src/features/ai-gateway/hooks/useTeamInviteEmails";

export type TeamInviteFormProps = {
  /** Undefined while loading. */
  notifiableMembers: GatewayNotifiableMembers | undefined;
  isInviting: boolean;
  /** Resolves to null when the request failed and was already reported. */
  onInvite: (params: {
    emails: string[];
    notifyMembers: boolean;
  }) => Promise<GatewayTeamInviteResult | null>;
  onFinish: () => void;
};

function getSendLabel(emailCount: number) {
  if (emailCount === 0) return "Notify members";
  if (emailCount === 1) return "Send 1 invite";
  return `Send ${emailCount} invites`;
}

export function TeamInviteForm({
  notifiableMembers,
  isInviting,
  onInvite,
  onFinish,
}: TeamInviteFormProps) {
  const invitees = useTeamInviteEmails();
  const [notifyMembers, setNotifyMembers] = useState(true);
  // Retrying failed invites must not announce the gateway to every member again.
  const [haveMembersBeenNotified, setHaveMembersBeenNotified] = useState(false);

  const canNotify =
    !haveMembersBeenNotified &&
    notifiableMembers !== undefined &&
    notifiableMembers.isEmailConfigured &&
    notifiableMembers.count > 0;
  const willNotify = canNotify && notifyMembers;
  const sendLabel = getSendLabel(invitees.emails.length);

  async function handleSend() {
    invitees.startAttempt();
    const result = await onInvite({
      emails: invitees.emails,
      notifyMembers: willNotify,
    });
    if (!result) return;
    if (willNotify) setHaveMembersBeenNotified(true);
    if (result.failed.length > 0) {
      invitees.keepFailed(result.failed);
      return;
    }
    onFinish();
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <TeamInviteFields
        emails={invitees.emails}
        onEmailsChange={invitees.setEmails}
        errorMessage={invitees.errorMessage}
        notifyMembers={
          canNotify
            ? {
                memberCount: notifiableMembers.count,
                previewMembers: notifiableMembers.preview,
                checked: notifyMembers,
                onCheckedChange: setNotifyMembers,
              }
            : undefined
        }
      />
      {invitees.failures.length > 0 ? (
        <TeamInviteFailuresAlert failures={invitees.failures} />
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          text={sendLabel}
          loading={isInviting}
          disabled={
            !invitees.isValid || (invitees.emails.length === 0 && !willNotify)
          }
          onClick={handleSend}
        />
        <Button text="Skip for now" variant="ghost" onClick={onFinish} />
      </div>
    </div>
  );
}
