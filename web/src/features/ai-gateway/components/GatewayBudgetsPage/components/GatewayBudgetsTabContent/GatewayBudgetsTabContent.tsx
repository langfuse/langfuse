import { type ComponentProps, useMemo } from "react";

import { ConnectedGatewayBudgetsTable } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/ConnectedGatewayBudgetsTable";
import { GatewaySpendChart } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewaySpendChart/GatewaySpendChart";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { useGatewayBudgetsTableState } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTableState";

type GatewayBudgetsTabContentProps = {
  organizationId: string;
  tab: GatewaySpendTab;
  /** Null while spend cannot be queried; the chart is then left out. */
  chart: Omit<
    ComponentProps<typeof GatewaySpendChart>,
    "tab" | "selected" | "onRemoveSelected"
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
  const selectedSubjects = useMemo(
    () =>
      table.selectedRows.map((row) => ({
        value: row.subjectId,
        label: row.name,
      })),
    [table.selectedRows],
  );

  const handleRemoveSelected = (subjectId: string) => {
    const row = table.selectedRows.find((row) => row.subjectId === subjectId);
    if (row) table.toggleRow(row.id);
  };

  return (
    <>
      {chart && (
        <GatewaySpendChart
          {...chart}
          tab={tab}
          selected={selectedSubjects}
          onRemoveSelected={handleRemoveSelected}
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
