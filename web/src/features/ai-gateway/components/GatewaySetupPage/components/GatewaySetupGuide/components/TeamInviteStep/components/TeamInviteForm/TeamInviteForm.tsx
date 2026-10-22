import { useState } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { MAX_TEAM_INVITES } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import { TeamInviteFields } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/components/TeamInviteFields/TeamInviteFields";
import { isEmailAddress } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/fns/isEmailAddress";
import type {
  GatewayNotifiableMembers,
  GatewayTeamInviteResult,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

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

export function TeamInviteForm({
  notifiableMembers,
  isInviting,
  onInvite,
  onFinish,
}: TeamInviteFormProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [failures, setFailures] = useState<
    Array<{ email: string; message: string }>
  >([]);
  // Retrying failed invites must not announce the gateway to every member again.
  const [haveMembersBeenNotified, setHaveMembersBeenNotified] = useState(false);

  const canNotify =
    !haveMembersBeenNotified &&
    notifiableMembers !== undefined &&
    notifiableMembers.isEmailConfigured &&
    notifiableMembers.count > 0;
  const willNotify = canNotify && notifyMembers;
  const hasInvalidEmail = emails.some((email) => !isEmailAddress(email));
  const hasTooManyEmails = emails.length > MAX_TEAM_INVITES;
  const sendLabel =
    emails.length > 0
      ? `Send ${emails.length} invite${emails.length === 1 ? "" : "s"}`
      : "Notify members";

  async function handleSend() {
    const result = await onInvite({ emails, notifyMembers: willNotify });
    if (!result) return;
    if (willNotify) setHaveMembersBeenNotified(true);
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
        errorMessage={
          hasTooManyEmails
            ? `You can invite up to ${MAX_TEAM_INVITES} people at once.`
            : undefined
        }
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
          disabled={
            hasInvalidEmail ||
            hasTooManyEmails ||
            (emails.length === 0 && !willNotify)
          }
          onClick={handleSend}
        />
        <Button text="Skip for now" variant="ghost" onClick={onFinish} />
      </div>
    </div>
  );
}
