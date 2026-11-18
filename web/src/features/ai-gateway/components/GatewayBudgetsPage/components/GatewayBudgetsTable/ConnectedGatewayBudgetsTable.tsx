import { useState } from "react";
import { useStore } from "zustand";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { GatewayBudgetsSelectionBar } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsSelectionBar/GatewayBudgetsSelectionBar";
import { GatewayEditBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayEditBudgetDialogController/GatewayEditBudgetDialogController";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { useSetGatewayBudgets } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import { api } from "@/src/utils/api";
import {
  type GatewayBudgetRow,
  type GatewayBudgetStatusFilter,
  GatewayBudgetsTable,
} from "./GatewayBudgetsTable";

type ConnectedGatewayBudgetsTableProps = {
  organizationId: string;
  tab: GatewaySpendTab;
  selectedRowId: string | null;
  onRowClick: (row: GatewayBudgetRow) => void;
};

/**
 * Paging, search, filter and selection state stay local and reset with the
 * tab, which remounts the table. Selection covers the current page only.
 */
export function ConnectedGatewayBudgetsTable({
  organizationId,
  tab,
  selectedRowId,
  onRowClick,
}: ConnectedGatewayBudgetsTableProps) {
  const subject = tab === "apiKeys" ? "key" : "user";
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<GatewayBudgetStatusFilter>("all");
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const budgets = api.aiGateway.listBudgets.useQuery({
    orgId: organizationId,
    scope: tab === "apiKeys" ? "API_KEY" : "USER",
    searchQuery: searchQuery.trim() || undefined,
    exceededOnly: status === "exceeded" || undefined,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });
  const data = toTableData(budgets);

  const [selectionStore] = useState(() => createTableSelectionStore());
  const clearSelection = selectionStore.getState().actions.clearSelection;
  const { selectActionColumn } = TableSelectionManager<GatewayBudgetRow>({
    projectId: "",
    tableName: "gateway-budgets",
    setSelectedRows: selectionStore.getState().actions.setRowSelection,
    setSelectAll: selectionStore.getState().actions.setSelectAll,
    selectionStore,
  });
  const rowSelection = useStore(selectionStore, (state) => state.rowSelection);
  const editableRows = (budgets.data?.rows ?? []).filter(
    (row) => row.isEditable,
  );
  const selectedRows = editableRows.filter((row) => rowSelection[row.id]);
  const { setBudgets, mutation: removal } =
    useSetGatewayBudgets(organizationId);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPaginationState((current) => ({ ...current, pageIndex: 0 }));
    clearSelection();
  };
  const handleStatusChange = (value: GatewayBudgetStatusFilter) => {
    setStatus(value);
    setPaginationState((current) => ({ ...current, pageIndex: 0 }));
    clearSelection();
  };

  return (
    <GatewayEditBudgetDialogController organizationId={organizationId}>
      {({ openDialog }) => (
        <>
          <GatewayBudgetsTable
            tab={tab}
            data={data}
            onRowClick={onRowClick}
            selectedRowId={selectedRowId}
            selectColumn={
              editableRows.length > 0
                ? {
                    ...selectActionColumn,
                    enableResizing: false,
                    cell: (context) =>
                      context.row.original.isEditable
                        ? selectActionColumn.cell(context)
                        : null,
                  }
                : undefined
            }
            onEditBudget={(row) =>
              openDialog({
                subject,
                subjects: [{ id: row.subjectId, name: row.name }],
                spendLimit: row.spendLimit,
              })
            }
            search={{ value: searchQuery, onChange: handleSearchChange }}
            status={{ value: status, onChange: handleStatusChange }}
            pagination={{
              mode: "offset",
              totalCount: budgets.data?.totalCount ?? null,
              state: paginationState,
              onChange: (state) => {
                setPaginationState(state);
                clearSelection();
              },
            }}
          />
          <ConfirmationDialogController
            title={`Remove ${selectedRows.length} ${subject} ${selectedRows.length === 1 ? "budget" : "budgets"}?`}
            text={
              subject === "key"
                ? "Requests with these keys are no longer capped by their own budget."
                : "These users' keys are no longer capped by a user budget."
            }
            confirmLabel="Remove"
            variant="destructive"
            loading={removal.isPending}
            error={removal.error?.message}
            onAfterDismiss={() => removal.reset()}
            onConfirm={async () => {
              const removed = await setBudgets({
                subject,
                subjectIds: selectedRows.map((row) => row.subjectId),
                spendLimit: null,
              });
              if (!removed) throw new Error("Budgets could not be removed.");
              clearSelection();
            }}
          >
            {({ openDialog: openRemoveDialog }) => (
              <GatewayBudgetsSelectionBar
                selectedCount={selectedRows.length}
                isSaving={removal.isPending}
                onClear={clearSelection}
                onEdit={() => {
                  const [first] = selectedRows;
                  if (!first) return;
                  openDialog({
                    subject,
                    subjects: selectedRows.map((row) => ({
                      id: row.subjectId,
                      name: row.name,
                    })),
                    spendLimit: first.spendLimit,
                    onSaved: clearSelection,
                  });
                }}
                onRemove={openRemoveDialog}
              />
            )}
          </ConfirmationDialogController>
        </>
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
