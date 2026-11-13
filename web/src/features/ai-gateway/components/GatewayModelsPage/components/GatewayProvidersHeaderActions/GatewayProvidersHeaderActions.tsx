import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";

export type GatewayProvidersHeaderActionsProps = {
  organizationId: string;
};

/** "Add connection" in the page header of the Connections tab; managers only. */
export function GatewayProvidersHeaderActions({
  organizationId,
}: GatewayProvidersHeaderActionsProps) {
  return (
    <ProviderDialogController
      organizationId={organizationId}
      surface="overview"
    >
      {({ openAddDialog }) => (
        <Button onClick={openAddDialog}>
          <Plus size="base" __rawClassName="mr-1.5" />
          Add connection
        </Button>
      )}
    </ProviderDialogController>
  );
}
