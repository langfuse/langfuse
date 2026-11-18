import { Plus } from "@langfuse/icons";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Button } from "@/src/components/ui/button";
import { GatewayAddBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsHeaderActions/components/GatewayAddBudgetDialogController/GatewayAddBudgetDialogController";
import { GatewayDefaultBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayDefaultBudgetDialogController/GatewayDefaultBudgetDialogController";
import { GatewayOrganizationBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayOrganizationBudgetDialogController/GatewayOrganizationBudgetDialogController";
import {
  GATEWAY_ORGANIZATION_BUDGETS_TAB,
  type GatewayBudgetsTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewayBudgetsTabs";
import { formatGatewayDefaultBudgetLabel } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/formatGatewayDefaultBudgetLabel";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

const defaultBudgetTooltips = {
  apiKeys: "The budget of every gateway key without a budget of its own.",
  users:
    "The budget of every user without a budget of their own. It caps all of their gateway keys.",
} as const satisfies Record<GatewaySpendTab, string>;

type GatewayBudgetsHeaderActionsProps = {
  organizationId: string;
  /** The dialog starts on the target type of the open tab. */
  tab: GatewayBudgetsTab;
};

/**
 * "Set default budget" (managers only) and "Add budget" in the page header of
 * the Budgets page; on the organization tab, only "Add budget" for an
 * organization budget.
 */
export function GatewayBudgetsHeaderActions({
  organizationId,
  tab,
}: GatewayBudgetsHeaderActionsProps) {
  const { canManageGateway } = useGatewaySettingsAccess(organizationId);

  if (tab === GATEWAY_ORGANIZATION_BUDGETS_TAB.value) {
    return (
      <GatewayOrganizationBudgetDialogController
        organizationId={organizationId}
      >
        {({ openDialog }) => {
          const handleAddBudget = () => openDialog(null);
          return <AddBudgetButton onClick={handleAddBudget} />;
        }}
      </GatewayOrganizationBudgetDialogController>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {canManageGateway && (
        <GatewayDefaultBudgetDialogController
          organizationId={organizationId}
          subject={tab === "apiKeys" ? "key" : "user"}
        >
          {({ openDialog, defaultBudget }) => (
            <CustomTooltip content={<span>{defaultBudgetTooltips[tab]}</span>}>
              {({ getTriggerProps }) => (
                <span {...getTriggerProps()} className="inline-flex">
                  <Button
                    variant="outline"
                    // The dialog prefills the current default, so it opens once that has loaded.
                    disabled={defaultBudget === undefined}
                    onClick={openDialog}
                  >
                    {formatGatewayDefaultBudgetLabel(defaultBudget)}
                  </Button>
                </span>
              )}
            </CustomTooltip>
          )}
        </GatewayDefaultBudgetDialogController>
      )}
      <GatewayAddBudgetDialogController organizationId={organizationId}>
        {({ openDialog }) => (
          <AddBudgetButton onClick={() => openDialog(tab)} />
        )}
      </GatewayAddBudgetDialogController>
    </div>
  );
}

function AddBudgetButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus size="base" __rawClassName="mr-1.5" />
      Add budget
    </Button>
  );
}
