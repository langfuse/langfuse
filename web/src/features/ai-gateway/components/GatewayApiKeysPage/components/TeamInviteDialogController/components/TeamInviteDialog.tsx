import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { TeamInviteFailuresAlert } from "@/src/features/ai-gateway/components/TeamInviteFailuresAlert";
import { TeamInviteFields } from "@/src/features/ai-gateway/components/TeamInviteFields/TeamInviteFields";
import { TEAM_NOTIFY_COPY } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import { useTeamNotifyForm } from "@/src/features/ai-gateway/hooks/useTeamNotifyForm";
import { useTeamRecipients } from "@/src/features/ai-gateway/hooks/useTeamRecipients";
import type { RouterOutputs } from "@/src/utils/api";

export type TeamInviteDialogProps = {
  organizationId: string;
  isInviting: boolean;
  errorMessage: string | undefined;
  /** Resolves to null when the request failed. */
  onInvite: (params: {
    emails: string[];
    notifyMembers: boolean;
  }) => Promise<RouterOutputs["aiGateway"]["inviteTeam"] | null>;
  /** Called once no address failed. */
  onInvited: () => void;
};

export function TeamInviteDialog({
  organizationId,
  isInviting,
  errorMessage,
  onInvite,
  onInvited,
}: TeamInviteDialogProps) {
  const form = useTeamNotifyForm(useTeamRecipients(organizationId));

  async function handleSend() {
    if (await form.send(onInvite)) onInvited();
  }

  return (
    <Dialog
      title={TEAM_NOTIFY_COPY.title}
      actions={[
        {
          label: form.sendLabel,
          loading: isInviting,
          disabled: isInviting || !form.canSend,
          onClick: handleSend,
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          {TEAM_NOTIFY_COPY.description}{" "}
          <Button
            variant="text"
            size="sm"
            text="About roles"
            href={TEAM_NOTIFY_COPY.rolesDocsUrl}
          />
        </p>
        <TeamInviteFields {...form.fieldsProps} />
        {errorMessage ? (
          <Alert variant="destructive">
            <Alert.Title>Notifications could not be sent</Alert.Title>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert>
        ) : null}
        {form.failures.length > 0 ? (
          <TeamInviteFailuresAlert failures={form.failures} />
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}
