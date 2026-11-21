import { Plus } from "@langfuse/icons";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Button } from "@/src/components/ui/button";
import { GatewayAddBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsHeaderActions/components/GatewayAddBudgetDialogController/GatewayAddBudgetDialogController";
import { GatewayOrganizationBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayOrganizationBudgetDialogController/GatewayOrganizationBudgetDialogController";
import type { useGatewayOrganizationBudget } from "@/src/features/ai-gateway/hooks/useGatewayOrganizationBudget";
import { formatGatewayOrganizationBudgetLabel } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/formatGatewayOrganizationBudgetLabel";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { useGatewayBudgetsTableState } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTableState";
import { GatewaySpendBudgetStatusDot } from "@/src/features/ai-gateway/components/GatewaySpendBudgetStatusDot/GatewaySpendBudgetStatusDot";
import { getGatewaySpendBudgetStatus } from "@/src/features/ai-gateway/fns/getGatewaySpendBudgetStatus";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

type GatewayBudgetsHeaderActionsProps = {
  organizationId: string;
  /** The dialog starts on the target type of the open tab. */
  tab: GatewaySpendTab;
};

/** The organization budget (managers only) and "Add budget" in the page header of the Budgets page. */
export function GatewayBudgetsHeaderActions({
  organizationId,
  tab,
}: GatewayBudgetsHeaderActionsProps) {
  const { canManageGateway } = useGatewaySettingsAccess(organizationId);
  const { selectedRows, selectAll } = useGatewayBudgetsTableState(
    organizationId,
    tab,
  );

  return (
    <div className="flex items-center gap-2">
      {canManageGateway && (
        <GatewayOrganizationBudgetDialogController
          organizationId={organizationId}
        >
          {({ openDialog, organizationBudget }) => {
            const status = toBudgetStatus(organizationBudget);
            return (
              <CustomTooltip
                content={
                  <span>
                    Caps total gateway spend in this organization, across all
                    members and keys. Key and user budgets still apply;
                    whichever is reached first blocks the request.
                  </span>
                }
              >
                {({ getTriggerProps }) => (
                  <span {...getTriggerProps()} className="inline-flex">
                    <Button
                      variant="outline"
                      // The dialog prefills the current budget, so it opens once that has loaded.
                      disabled={organizationBudget === undefined}
                      onClick={openDialog}
                    >
                      <span className="inline-flex items-center gap-2">
                        {formatGatewayOrganizationBudgetLabel(
                          organizationBudget,
                        )}
                        {status !== "ok" && (
                          <GatewaySpendBudgetStatusDot status={status} />
                        )}
                      </span>
                    </Button>
                  </span>
                )}
              </CustomTooltip>
            );
          }}
        </GatewayOrganizationBudgetDialogController>
      )}
      <GatewayAddBudgetDialogController organizationId={organizationId}>
        {({ openDialog }) => {
          // Under select-all the rows beyond this page aren't loaded, so none start selected.
          const handleAddBudget = () =>
            openDialog({
              targetType: tab,
              selectedRows: selectAll ? [] : selectedRows,
            });
          return (
            <Button onClick={handleAddBudget}>
              <Plus size="base" __rawClassName="mr-1.5" />
              Add budget
            </Button>
          );
        }}
      </GatewayAddBudgetDialogController>
    </div>
  );
}

function toBudgetStatus(
  budget: ReturnType<typeof useGatewayOrganizationBudget>,
) {
  if (budget?.spentUsd === undefined) return "ok";
  return getGatewaySpendBudgetStatus(
    budget.spentUsd,
    budget.spendLimit.limitUsd,
  );
}
