import { useMemo } from "react";

import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
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
 * the server lists them, shown as one tag. Under select-all the chart waits
 * for that list rather than showing everyone's spend meanwhile.
 */
export function useGatewaySpendSelection(
  organizationId: string,
  tab: GatewaySpendTab,
  table: ReturnType<typeof useGatewayBudgetsTableState>,
) {
  const matching = api.aiGateway.listMatchingBudgetSubjects.useQuery(
    {
      orgId: organizationId,
      scope: GATEWAY_SPEND_TABS[tab].scope,
      searchQuery: table.matching.searchQuery,
      status: table.matching.status,
    },
    { enabled: table.selectAll },
  );

  const { refetch } = matching;
  const selection = useMemo((): GatewaySpendSelection => {
    if (!table.selectAll) {
      if (table.selectedRows.length === 0) return { status: "none" };
      return {
        status: "selected",
        subjects: table.selectedRows.map((row) => ({
          value: row.subjectId,
          label: row.name,
        })),
      };
    }
    if (matching.isError) {
      return {
        status: "error",
        onRetry: () => {
          refetch().catch(() => undefined);
        },
      };
    }
    if (!matching.data) return { status: "loading" };
    return {
      status: "selected",
      subjects: matching.data.map(({ id, name }) => ({
        value: id,
        label: name,
      })),
    };
  }, [
    matching.data,
    matching.isError,
    refetch,
    table.selectAll,
    table.selectedRows,
  ]);

  const tags = table.selectAll
    ? [
        {
          value: ALL_TAG,
          label: allLabels[tab](
            matching.data?.length ?? table.budgets.data?.totalCount ?? 0,
          ),
        },
      ]
    : table.selectedRows.map((row) => ({
        value: row.subjectId,
        label: row.name,
      }));

  const removeTag = (value: string) => {
    if (value === ALL_TAG) {
      table.clearSelection();
      return;
    }
    const row = table.selectedRows.find((row) => row.subjectId === value);
    if (row) table.toggleRow(row.id);
  };

  return { selection, tags, removeTag };
}

/** None shows everyone's spend; a selection, even an empty one, shows only its spend. */
export type GatewaySpendSelection =
  | { status: "none" }
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "selected"; subjects: { value: string; label: string }[] };
