import { useId, useState } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { EmailTagInput } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/EmailTagInput/EmailTagInput";
import { NotifyMembersToggle } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/NotifyMembersToggle";
import { isEmailAddress } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/fns/isEmailAddress";
import { useGatewayTeamInvite } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/hooks/useGatewayTeamInvite";

export type TeamInviteFormProps = {
  organizationId: string;
  onFinish: () => void;
};

export function TeamInviteForm({
  organizationId,
  onFinish,
}: TeamInviteFormProps) {
  const inputId = useId();
  const hintId = useId();
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
    summary.notifiableMemberCount > 0 &&
    summary.membersNotifiedAt === null;
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
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex max-w-xl flex-col gap-1.5">
        <EmailTagInput
          id={inputId}
          value={emails}
          onChange={setEmails}
          aria-describedby={hintId}
        />
        <p id={hintId} className="text-muted-foreground text-xs">
          Separate with a comma or Enter. They join as Member.
        </p>
      </div>
      {canNotify ? (
        <NotifyMembersToggle
          memberCount={summary.notifiableMemberCount}
          previewMembers={summary.notifiableMemberPreview}
          checked={notifyMembers}
          onCheckedChange={setNotifyMembers}
        />
      ) : null}
      {failures.length > 0 ? (
        <Alert variant="destructive">
          <Alert.Title>Some invitations were not sent</Alert.Title>
          <Alert.Description>
            <ul>
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
