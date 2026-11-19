import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { GatewayBudgetsSelectionBar } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/components/GatewayBudgetsSelectionBar/GatewayBudgetsSelectionBar";
import { GatewayEditBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/components/GatewayEditBudgetDialogController/GatewayEditBudgetDialogController";
import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import type { useGatewayBudgetsTableState } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTableState";
import { useSetGatewayBudgets } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import { GatewayDefaultBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayDefaultBudgetDialogController/GatewayDefaultBudgetDialogController";
import { formatGatewayDefaultBudgetLabel } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/formatGatewayDefaultBudgetLabel";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
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

const defaultBudgetTooltips = {
  apiKeys: "The budget of every gateway key without a budget of its own.",
  users:
    "The budget of every user without a budget of their own. It caps all of their gateway keys.",
} as const satisfies Record<GatewaySpendTab, string>;

/**
 * Clicking a row selects it, like its checkbox; the selection also filters the
 * spend chart. Selecting every row on the page offers selecting all matching
 * rows across pages, as in the product's other multi-select tables.
 */
export function ConnectedGatewayBudgetsTable({
  organizationId,
  tab,
  table,
}: ConnectedGatewayBudgetsTableProps) {
  const { subject } = GATEWAY_SPEND_TABS[tab];
  const { canManageGateway } = useGatewaySettingsAccess(organizationId);
  const { budgets, selectionStore, selectedRows, selectAll, clearSelection } =
    table;
  const { selectActionColumn } = TableSelectionManager<GatewayBudgetRow>({
    projectId: "",
    tableName: "gateway-budgets",
    setSelectedRows: selectionStore.getState().actions.setRowSelection,
    setSelectAll: selectionStore.getState().actions.setSelectAll,
    selectionStore,
  });
  const { setBudgets, mutation: removal } =
    useSetGatewayBudgets(organizationId);
  const totalCount = budgets.data?.totalCount ?? null;
  const pageRows = budgets.data?.rows ?? [];
  const selectedCount = selectAll
    ? (totalCount ?? selectedRows.length)
    : selectedRows.length;
  // Under select-all the server checks each matching row and refuses the whole change if one is not editable.
  const bulkDisabledReason =
    selectAll || selectedRows.every((row) => row.isEditable)
      ? undefined
      : notEditableReasons[tab];
  const bulkTarget = selectAll
    ? table.matching
    : {
        type: "ids" as const,
        subjectIds: selectedRows.map((row) => row.subjectId),
      };

  const handleRowClick = (row: GatewayBudgetRow) => table.toggleRow(row.id);

  return (
    <GatewayDefaultBudgetDialogController
      organizationId={organizationId}
      subject={subject}
    >
      {({ openDialog: openDefaultDialog, defaultBudget }) => (
        <GatewayEditBudgetDialogController
          organizationId={organizationId}
          subject={subject}
        >
          {({ openDialog }) => (
            <>
              <GatewayBudgetsTable
                tab={tab}
                data={toTableData(budgets)}
                onRowClick={handleRowClick}
                selectColumn={{ ...selectActionColumn, enableResizing: false }}
                multiSelect={{
                  selectAll,
                  setSelectAll: selectionStore.getState().actions.setSelectAll,
                  selectedRowIds: selectedRows.map((row) => row.id),
                  setRowSelection:
                    selectionStore.getState().actions.setRowSelection,
                  pageSize: table.pagination.state.pageSize,
                  pageIndex: table.pagination.state.pageIndex,
                  totalCount,
                }}
                onEditBudget={(row) =>
                  openDialog({
                    tab,
                    target: { type: "ids", subjectIds: [row.subjectId] },
                    count: 1,
                    name: row.name,
                    spendLimit: row.spendLimit,
                    existingBudgetCount:
                      row.spendLimit !== null && !row.isDefault ? 1 : 0,
                  })
                }
                toolbarActions={
                  canManageGateway
                    ? [
                        {
                          id: "defaultBudget",
                          label: formatGatewayDefaultBudgetLabel(defaultBudget),
                          variant: "outline",
                          title: defaultBudgetTooltips[tab],
                          // The dialog prefills the current default, so it opens once that has loaded.
                          disabled: defaultBudget === undefined,
                          onClick: openDefaultDialog,
                        },
                      ]
                    : undefined
                }
                search={table.search}
                status={table.status}
                pagination={{
                  mode: "offset",
                  totalCount,
                  ...table.pagination,
                }}
              />
              <ConfirmationDialogController
                title={`Remove ${selectedCount} ${subject} ${selectedCount === 1 ? "budget" : "budgets"}?`}
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
                    tab,
                    subjects: bulkTarget,
                    spendLimit: null,
                  });
                  if (!removed)
                    throw new Error("Budgets could not be removed.");
                  clearSelection();
                }}
              >
                {({ openDialog: openRemoveDialog }) => (
                  <GatewayBudgetsSelectionBar
                    selectedCount={selectedCount}
                    isSaving={removal.isPending}
                    disabledReason={bulkDisabledReason}
                    onClear={clearSelection}
                    onEdit={() => {
                      const first = selectedRows[0] ?? pageRows[0];
                      if (!first) return;
                      openDialog({
                        tab,
                        target: bulkTarget,
                        count: selectedCount,
                        name: first.name,
                        spendLimit: first.spendLimit,
                        existingBudgetCount: selectAll
                          ? null
                          : selectedRows.filter(
                              (row) =>
                                row.spendLimit !== null && !row.isDefault,
                            ).length,
                        onAfterSave: clearSelection,
                      });
                    }}
                    removeLabel={
                      // Removing a budget falls back to the organization's default while one is set.
                      defaultBudget ? "Use default budget" : "Remove budget"
                    }
                    onRemove={openRemoveDialog}
                  />
                )}
              </ConfirmationDialogController>
            </>
          )}
        </GatewayEditBudgetDialogController>
      )}
    </GatewayDefaultBudgetDialogController>
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
