import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";
import { TeamInviteDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/TeamInviteDialogController/components/TeamInviteDialog";
import { showInviteOutcome } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/TeamInviteDialogController/fns/showInviteOutcome";

export function TeamInviteDialogController({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const invite = api.aiGateway.inviteTeam.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-team-invite"),
  });

  async function handleInvite(emails: string[]) {
    try {
      const result = await invite.mutateAsync({
        orgId: organizationId,
        emails,
        notifyMembers: false,
      });
      if (result.failed.length === 0) showInviteOutcome(result);
      return result.failed;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-team-invite");
      return null;
    }
  }

  return (
    <DialogController
      onBeforeClose={() => !invite.isPending}
      renderDialog={({ closeDialog }) => (
        <TeamInviteDialog
          isInviting={invite.isPending}
          errorMessage={invite.error?.message}
          onInvite={handleInvite}
          onInvited={closeDialog}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openDialog: () => {
            invite.reset();
            openDialog();
          },
        })
      }
    </DialogController>
  );
}
