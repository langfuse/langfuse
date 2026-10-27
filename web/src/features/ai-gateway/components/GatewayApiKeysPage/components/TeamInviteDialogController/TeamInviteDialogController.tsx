import type { ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";
import { TeamInviteDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/TeamInviteDialogController/components/TeamInviteDialog";
import { showInviteOutcome } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/TeamInviteDialogController/fns/showInviteOutcome";
import { toTeamInviteSentEvent } from "@/src/features/ai-gateway/fns/toTeamInviteSentEvent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function TeamInviteDialogController({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const invite = api.aiGateway.inviteTeam.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-team-invite"),
  });

  async function handleInvite(params: {
    emails: string[];
    notifyMembers: boolean;
  }) {
    try {
      const result = await invite.mutateAsync({
        orgId: organizationId,
        ...params,
      });
      capture(
        "ai_gateway:team_invite_sent",
        toTeamInviteSentEvent({
          orgId: organizationId,
          surface: "api_keys_page",
          ...params,
          result,
        }),
      );
      if (result.failed.length === 0) showInviteOutcome(result);
      return result;
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
          organizationId={organizationId}
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
