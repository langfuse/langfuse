import { useState } from "react";
import { z } from "zod/v4";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { TeamInviteFields } from "@/src/features/ai-gateway/components/TeamInviteFields/TeamInviteFields";
import { MAX_TEAM_INVITES } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";

type InviteFailure = { email: string; message: string };

export type TeamInviteDialogProps = {
  isInviting: boolean;
  errorMessage: string | undefined;
  /** Resolves to the addresses that were not invited, or null when the request failed. */
  onInvite: (emails: string[]) => Promise<InviteFailure[] | null>;
  /** Called once every address was invited. */
  onInvited: () => void;
};

export function TeamInviteDialog({
  isInviting,
  errorMessage,
  onInvite,
  onInvited,
}: TeamInviteDialogProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [failures, setFailures] = useState<InviteFailure[]>([]);

  const hasInvalidEmail = emails.some(
    (email) => !z.email().safeParse(email).success,
  );
  const hasTooManyEmails = emails.length > MAX_TEAM_INVITES;

  async function handleSend() {
    const failed = await onInvite(emails);
    if (!failed) return;
    if (failed.length === 0) {
      onInvited();
      return;
    }
    setFailures(failed);
    setEmails(failed.map((failure) => failure.email));
  }

  return (
    <Dialog
      title="Invite people"
      actions={[
        {
          label: "Send invites",
          loading: isInviting,
          disabled:
            isInviting ||
            emails.length === 0 ||
            hasInvalidEmail ||
            hasTooManyEmails,
          onClick: handleSend,
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          Invite people to the organization. They can create their own gateway
          keys.
        </p>
        <TeamInviteFields
          emails={emails}
          onEmailsChange={setEmails}
          errorMessage={
            hasTooManyEmails
              ? `You can invite up to ${MAX_TEAM_INVITES} people at once.`
              : undefined
          }
        />
        {errorMessage ? (
          <Alert variant="destructive">
            <Alert.Title>Invitations could not be sent</Alert.Title>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert>
        ) : null}
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
      </Dialog.Body>
    </Dialog>
  );
}
