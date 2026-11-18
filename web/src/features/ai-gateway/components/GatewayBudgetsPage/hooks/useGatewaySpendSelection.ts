import { useMemo } from "react";

import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import type { useGatewayBudgetsTableState } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTableState";
import { api } from "@/src/utils/api";

const ALL_TAG = "all";

const allLabels = {
  apiKeys: (count: number) => `All ${count} keys`,
  users: (count: number) => `All ${count} users`,
} as const satisfies Record<GatewaySpendTab, (count: number) => string>;

/**
 * What the spend chart filters by: the selected table rows, or under
 * select-all every key or user matching the table's search and status, as
 * the server lists them, shown as one tag.
 */
export function useGatewaySpendSelection(
  organizationId: string,
  tab: GatewaySpendTab,
  table: ReturnType<typeof useGatewayBudgetsTableState>,
) {
  const matching = api.aiGateway.listMatchingBudgetSubjects.useQuery(
    {
      orgId: organizationId,
      scope: tab === "apiKeys" ? "API_KEY" : "USER",
      searchQuery: table.matching.searchQuery,
      status: table.matching.status,
    },
    { enabled: table.selectAll },
  );

  const selected = useMemo(() => {
    if (table.selectAll) {
      return (matching.data ?? []).map(({ id, name }) => ({
        value: id,
        label: name,
      }));
    }
    return table.selectedRows.map((row) => ({
      value: row.subjectId,
      label: row.name,
    }));
  }, [matching.data, table.selectAll, table.selectedRows]);

  const tags = table.selectAll
    ? [
        {
          value: ALL_TAG,
          label: allLabels[tab](
            matching.data?.length ?? table.budgets.data?.totalCount ?? 0,
          ),
        },
      ]
    : selected;

  const removeTag = (value: string) => {
    if (value === ALL_TAG) {
      table.clearSelection();
      return;
    }
    const row = table.selectedRows.find((row) => row.subjectId === value);
    if (row) table.toggleRow(row.id);
  };

  return { selected, tags, removeTag };
}
