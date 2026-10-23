import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { TeamInviteFailuresAlert } from "@/src/features/ai-gateway/components/TeamInviteFailuresAlert";
import { TeamInviteFields } from "@/src/features/ai-gateway/components/TeamInviteFields/TeamInviteFields";
import { useTeamInviteEmails } from "@/src/features/ai-gateway/hooks/useTeamInviteEmails";
import type { TeamInviteFailure } from "@/src/features/ai-gateway/types/teamInviteFailure";

export type TeamInviteDialogProps = {
  isInviting: boolean;
  errorMessage: string | undefined;
  /** Resolves to the addresses that were not invited, or null when the request failed. */
  onInvite: (emails: string[]) => Promise<TeamInviteFailure[] | null>;
  /** Called once no address failed. */
  onInvited: () => void;
};

export function TeamInviteDialog({
  isInviting,
  errorMessage,
  onInvite,
  onInvited,
}: TeamInviteDialogProps) {
  const invitees = useTeamInviteEmails();

  async function handleSend() {
    invitees.startAttempt();
    const failed = await onInvite(invitees.emails);
    if (!failed) return;
    if (failed.length === 0) {
      onInvited();
      return;
    }
    invitees.keepFailed(failed);
  }

  return (
    <Dialog
      title="Invite people"
      actions={[
        {
          label: "Send invites",
          loading: isInviting,
          disabled:
            isInviting || invitees.emails.length === 0 || !invitees.isValid,
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
          emails={invitees.emails}
          onEmailsChange={invitees.setEmails}
          errorMessage={invitees.errorMessage}
        />
        {errorMessage ? (
          <Alert variant="destructive">
            <Alert.Title>Invitations could not be sent</Alert.Title>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert>
        ) : null}
        {invitees.failures.length > 0 ? (
          <TeamInviteFailuresAlert failures={invitees.failures} />
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}
