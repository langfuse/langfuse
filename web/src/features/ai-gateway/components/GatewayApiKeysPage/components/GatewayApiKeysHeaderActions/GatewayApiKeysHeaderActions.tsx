import { BookOpen, Plus, UserPlus } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { CreateGatewayApiKeyDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/CreateGatewayApiKeyDialogController";
import { TeamInviteDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/TeamInviteDialogController/TeamInviteDialogController";
import { UsageInstructionsDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/UsageInstructionsDialogController/UsageInstructionsDialogController";

export type GatewayApiKeysHeaderActionsProps = {
  organizationId: string;
  /** Owners and admins only: inviting needs gateway management and member management. */
  canInvite: boolean;
};

/** "Notify team", "Usage instructions" and "Create key" in the page header of Gateway keys. */
export function GatewayApiKeysHeaderActions({
  organizationId,
  canInvite,
}: GatewayApiKeysHeaderActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {canInvite ? (
        <TeamInviteDialogController organizationId={organizationId}>
          {({ openDialog }) => (
            <Button variant="outline" onClick={openDialog}>
              <UserPlus size="base" __rawClassName="mr-1.5" />
              Notify team
            </Button>
          )}
        </TeamInviteDialogController>
      ) : null}
      <UsageInstructionsDialogController organizationId={organizationId}>
        {({ openDialog }) => (
          <Button variant="outline" onClick={openDialog}>
            <BookOpen size="base" __rawClassName="mr-1.5" />
            Usage instructions
          </Button>
        )}
      </UsageInstructionsDialogController>
      <CreateGatewayApiKeyDialogController organizationId={organizationId}>
        {({ openDialog }) => (
          <Button onClick={openDialog}>
            <Plus size="base" __rawClassName="mr-1.5" />
            Create key
          </Button>
        )}
      </CreateGatewayApiKeyDialogController>
    </div>
  );
}
