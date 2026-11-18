import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { GatewayAddBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsHeaderActions/components/GatewayAddBudgetDialogController/GatewayAddBudgetDialogController";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

type GatewayBudgetsHeaderActionsProps = {
  organizationId: string;
  /** The dialog starts on the target type of the open tab. */
  tab: GatewaySpendTab;
};

/** "Add budget" in the page header of the Budgets page; managers only. */
export function GatewayBudgetsHeaderActions({
  organizationId,
  tab,
}: GatewayBudgetsHeaderActionsProps) {
  return (
    <GatewayAddBudgetDialogController organizationId={organizationId}>
      {({ openDialog }) => (
        <Button onClick={() => openDialog(tab)}>
          <Plus size="base" __rawClassName="mr-1.5" />
          Add budget
        </Button>
      )}
    </GatewayAddBudgetDialogController>
  );
}
