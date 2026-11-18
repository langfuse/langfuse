import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { GatewayBudgetsSelectionBar } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/components/GatewayBudgetsSelectionBar/GatewayBudgetsSelectionBar";
import { GatewayEditBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/components/GatewayEditBudgetDialogController/GatewayEditBudgetDialogController";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import type { useGatewayBudgetsTableState } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTableState";
import { useSetGatewayBudgets } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import {
  type GatewayBudgetRow,
  GatewayBudgetsTable,
} from "./GatewayBudgetsTable";

type ConnectedGatewayBudgetsTableProps = {
  organizationId: string;
  tab: GatewaySpendTab;
  table: ReturnType<typeof useGatewayBudgetsTableState>;
};

const notEditableReasons = {
  apiKeys: "Some selected key budgets were set by a gateway admin.",
  users: "Only gateway admins can change user budgets.",
} as const satisfies Record<GatewaySpendTab, string>;

/** Clicking a row selects it, like its checkbox; the selection also filters the spend chart. */
export function ConnectedGatewayBudgetsTable({
  organizationId,
  tab,
  table,
}: ConnectedGatewayBudgetsTableProps) {
  const subject = tab === "apiKeys" ? "key" : "user";
  const { budgets, selectionStore, selectedRows, clearSelection } = table;
  const { selectActionColumn } = TableSelectionManager<GatewayBudgetRow>({
    projectId: "",
    tableName: "gateway-budgets",
    setSelectedRows: selectionStore.getState().actions.setRowSelection,
    setSelectAll: selectionStore.getState().actions.setSelectAll,
    selectionStore,
  });
  const { setBudgets, mutation: removal } =
    useSetGatewayBudgets(organizationId);
  const bulkDisabledReason = selectedRows.every((row) => row.isEditable)
    ? undefined
    : notEditableReasons[tab];

  const handleRowClick = (row: GatewayBudgetRow) => table.toggleRow(row.id);

  return (
    <GatewayEditBudgetDialogController organizationId={organizationId}>
      {({ openDialog }) => (
        <>
          <GatewayBudgetsTable
            tab={tab}
            data={toTableData(budgets)}
            onRowClick={handleRowClick}
            selectColumn={{ ...selectActionColumn, enableResizing: false }}
            onEditBudget={(row) =>
              openDialog({
                subject,
                subjects: [{ id: row.subjectId, name: row.name }],
                spendLimit: row.spendLimit,
                existingBudgetCount: row.spendLimit ? 1 : 0,
              })
            }
            search={table.search}
            status={table.status}
            pagination={{
              mode: "offset",
              totalCount: budgets.data?.totalCount ?? null,
              ...table.pagination,
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
                disabledReason={bulkDisabledReason}
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
                    existingBudgetCount: selectedRows.filter(
                      (row) => row.spendLimit !== null,
                    ).length,
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
