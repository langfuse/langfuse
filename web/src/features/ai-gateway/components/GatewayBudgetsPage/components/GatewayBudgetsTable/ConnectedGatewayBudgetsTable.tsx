import { useState } from "react";

import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { GatewayEditBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayEditBudgetDialogController/GatewayEditBudgetDialogController";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { api } from "@/src/utils/api";
import {
  type GatewayBudgetRow,
  GatewayBudgetsTable,
} from "./GatewayBudgetsTable";

type ConnectedGatewayBudgetsTableProps = {
  organizationId: string;
  tab: GatewaySpendTab;
  selectedRowId: string | null;
  onRowClick: (row: GatewayBudgetRow) => void;
};

/**
 * Paging and search state stay local and reset with the tab, which remounts
 * the table.
 */
export function ConnectedGatewayBudgetsTable({
  organizationId,
  tab,
  selectedRowId,
  onRowClick,
}: ConnectedGatewayBudgetsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const budgets = api.aiGateway.listBudgets.useQuery({
    orgId: organizationId,
    scope: tab === "apiKeys" ? "API_KEY" : "USER",
    searchQuery: searchQuery.trim() || undefined,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });
  const data = toTableData(budgets);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPaginationState((current) => ({ ...current, pageIndex: 0 }));
  };

  return (
    <GatewayEditBudgetDialogController organizationId={organizationId}>
      {({ openDialog }) => (
        <GatewayBudgetsTable
          tab={tab}
          data={data}
          onRowClick={onRowClick}
          selectedRowId={selectedRowId}
          onEditBudget={(row) =>
            openDialog({
              subject: tab === "apiKeys" ? "key" : "user",
              subjectId: row.subjectId,
              subjectName: row.name,
              spendLimit: row.spendLimit,
            })
          }
          search={{ value: searchQuery, onChange: handleSearchChange }}
          pagination={{
            mode: "offset",
            totalCount: budgets.data?.totalCount ?? null,
            state: paginationState,
            onChange: setPaginationState,
          }}
        />
      )}
    </GatewayEditBudgetDialogController>
  );
}

function toTableData(query: {
  isError: boolean;
  data?: { rows: GatewayBudgetRow[] };
}): AsyncTableData<GatewayBudgetRow[]> {
  if (query.isError) {
    return { status: "error", error: "Budgets could not be loaded." };
  }
  if (!query.data) return { status: "loading" };
  return { status: "success", data: query.data.rows };
}
