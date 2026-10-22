import { useState } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { TeamInviteFields } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/components/TeamInviteFields/TeamInviteFields";
import { isEmailAddress } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/fns/isEmailAddress";
import { useGatewayTeamInvite } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/hooks/useGatewayTeamInvite";

export type TeamInviteFormProps = {
  organizationId: string;
  onFinish: () => void;
};

export function TeamInviteForm({
  organizationId,
  onFinish,
}: TeamInviteFormProps) {
  const { summary, inviteTeam, isInviting } =
    useGatewayTeamInvite(organizationId);
  const [emails, setEmails] = useState<string[]>([]);
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [failures, setFailures] = useState<
    Array<{ email: string; message: string }>
  >([]);

  const canNotify =
    summary !== undefined &&
    summary.isEmailConfigured &&
    summary.notifiableMemberCount > 0;
  const willNotify = canNotify && notifyMembers;
  const hasInvalidEmail = emails.some((email) => !isEmailAddress(email));
  const sendLabel =
    emails.length > 0
      ? `Send ${emails.length} invite${emails.length === 1 ? "" : "s"}`
      : "Notify members";

  async function handleSend() {
    const result = await inviteTeam({ emails, notifyMembers: willNotify });
    if (!result) return;
    if (result.failed.length > 0) {
      setFailures(result.failed);
      setEmails(result.failed.map((failure) => failure.email));
      return;
    }
    onFinish();
  }

  return (
    <div className="flex flex-col gap-4 pt-1">
      <TeamInviteFields
        emails={emails}
        onEmailsChange={setEmails}
        notifyMembers={
          canNotify
            ? {
                memberCount: summary.notifiableMemberCount,
                previewMembers: summary.notifiableMemberPreview,
                checked: notifyMembers,
                onCheckedChange: setNotifyMembers,
              }
            : undefined
        }
      />
      {failures.length > 0 ? (
        <Alert variant="destructive">
          <Alert.Title>Some invitations were not sent</Alert.Title>
          <Alert.Description>
            <ul className="ph-no-capture">
              {failures.map((failure) => (
                <li key={failure.email}>
                  {failure.email}: {failure.message}
                </li>
              ))}
            </ul>
          </Alert.Description>
        </Alert>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          text={sendLabel}
          loading={isInviting}
          disabled={hasInvalidEmail || (emails.length === 0 && !willNotify)}
          onClick={handleSend}
        />
        <Button text="Skip for now" variant="ghost" onClick={onFinish} />
      </div>
    </div>
  );
}
