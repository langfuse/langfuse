import { type ComponentProps, useState } from "react";

import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import type { GatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import { GatewayUserBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayUserBudgetDialogController/GatewayUserBudgetDialogController";
import { selectGatewayUserSpendPage } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/selectGatewayUserSpendPage";
import { useGatewayUserSpend } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayUserSpend";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { api } from "@/src/utils/api";
import { GatewayUserSpendTable } from "./GatewayUserSpendTable";

type GatewayUserSpendTableProps = ComponentProps<typeof GatewayUserSpendTable>;
type GatewayUserBudgetRows = Extract<
  GatewayUserSpendTableProps["data"],
  { status: "success" }
>["data"];

type ConnectedGatewayUserSpendTableProps = Pick<
  GatewayUserSpendTableProps,
  "onRowClick" | "selectedRowId" | "toolbarActions"
> & {
  organizationId: string;
  fetchQuery: GatewayAnalyticsFetchQuery;
  timeRange: { from: Date; to: Date };
};

/**
 * Paging and search state stay local, so they do not clash with the API keys
 * table's URL state. Budgets load for the shown page only.
 */
export function ConnectedGatewayUserSpendTable({
  organizationId,
  fetchQuery,
  timeRange,
  onRowClick,
  selectedRowId,
  toolbarActions,
}: ConnectedGatewayUserSpendTableProps) {
  const { canManageGateway } = useGatewaySettingsAccess(organizationId);
  const data = useGatewayUserSpend({ organizationId, fetchQuery, timeRange });
  const [searchQuery, setSearchQuery] = useState("");
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const page =
    data.status === "success"
      ? selectGatewayUserSpendPage(data.data, {
          searchQuery,
          pageIndex: paginationState.pageIndex,
          pageSize: paginationState.pageSize,
        })
      : undefined;
  const userIds = page?.rows.map(({ id }) => id) ?? [];
  const budgets = api.aiGateway.getUsersSpend.useQuery(
    { orgId: organizationId, userIds },
    { enabled: userIds.length > 0 },
  );
  const budgetsByUser = new Map(
    (budgets.data ?? []).map((budget) => [budget.id, budget]),
  );
  const pageData: AsyncTableData<GatewayUserBudgetRows> = page
    ? {
        status: "success",
        data: page.rows.map((row) => {
          const budget = budgetsByUser.get(row.id);
          return {
            ...row,
            spendLimit: budgets.isSuccess
              ? (budget?.spendLimit ?? null)
              : undefined,
            budgetSpentUsd: budget?.spentUsd,
          };
        }),
      }
    : data;

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPaginationState((current) => ({ ...current, pageIndex: 0 }));
  };

  return (
    <GatewayUserBudgetDialogController organizationId={organizationId}>
      {({ openDialog }) => (
        <GatewayUserSpendTable
          data={pageData}
          onRowClick={onRowClick}
          selectedRowId={selectedRowId}
          toolbarActions={toolbarActions}
          onEditBudget={
            canManageGateway
              ? (row) =>
                  openDialog({
                    id: row.id,
                    name: row.name,
                    spendLimit: row.spendLimit ?? null,
                  })
              : undefined
          }
          search={{ value: searchQuery, onChange: handleSearchChange }}
          pagination={{
            mode: "offset",
            totalCount: page?.totalCount ?? null,
            state: paginationState,
            onChange: setPaginationState,
          }}
        />
      )}
    </GatewayUserBudgetDialogController>
  );
}
