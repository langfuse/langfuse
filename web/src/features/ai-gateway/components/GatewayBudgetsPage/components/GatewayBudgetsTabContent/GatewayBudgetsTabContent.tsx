import type { ComponentProps } from "react";

import { ConnectedGatewayBudgetsTable } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/ConnectedGatewayBudgetsTable";
import { GatewaySpendChart } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewaySpendChart/GatewaySpendChart";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { useGatewaySpendSelection } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewaySpendSelection";
import { useGatewayBudgetsTableState } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTableState";

type GatewayBudgetsTabContentProps = {
  organizationId: string;
  tab: GatewaySpendTab;
  /** Null while spend cannot be queried; the chart is then left out. */
  chart: Omit<
    ComponentProps<typeof GatewaySpendChart>,
    "tab" | "selection" | "tags" | "onRemoveTag"
  > | null;
};

/**
 * The spend chart and table of one tab, sharing the table's selection as the
 * chart's filter. Render it keyed by tab, so each tab starts fresh.
 */
export function GatewayBudgetsTabContent({
  organizationId,
  tab,
  chart,
}: GatewayBudgetsTabContentProps) {
  const table = useGatewayBudgetsTableState(organizationId, tab);
  const spendSelection = useGatewaySpendSelection(organizationId, tab, table);

  return (
    <>
      {chart && (
        <GatewaySpendChart
          {...chart}
          tab={tab}
          selection={spendSelection.selection}
          tags={spendSelection.tags}
          onRemoveTag={spendSelection.removeTag}
        />
      )}
      <ConnectedGatewayBudgetsTable
        organizationId={organizationId}
        tab={tab}
        table={table}
      />
    </>
  );
}
