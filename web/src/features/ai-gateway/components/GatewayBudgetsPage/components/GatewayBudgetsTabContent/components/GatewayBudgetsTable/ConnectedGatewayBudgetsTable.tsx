import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { GatewayBudgetsSelectionBar } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/components/GatewayBudgetsSelectionBar/GatewayBudgetsSelectionBar";
import { GatewayEditBudgetDialogController } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/components/GatewayBudgetsTable/components/GatewayEditBudgetDialogController/GatewayEditBudgetDialogController";
import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import type { useGatewayBudgetsTableState } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTableState";
import {
  type GatewayBudgetSubject,
  useSetGatewayBudgets,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
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

/** Removing a budget falls back to the organization's default while one is set. */
const removalCopy = {
  unlimited: {
    actionLabel: "Remove budget",
    confirmLabel: "Remove",
    title: (subject: GatewayBudgetSubject, count: number) =>
      `Remove ${count} ${subject} ${count === 1 ? "budget" : "budgets"}?`,
    text: {
      key: "Requests with these keys are no longer capped by their own budget.",
      user: "These users' keys are no longer capped by a user budget.",
    },
  },
  default: {
    actionLabel: "Use default budget",
    confirmLabel: "Use default",
    title: (subject: GatewayBudgetSubject, count: number) =>
      `Use the default budget for ${count} ${count === 1 ? subject : `${subject}s`}?`,
    text: {
      key: "Their own budgets are removed, and the default key budget applies to these keys instead.",
      user: "Their own budgets are removed, and the default user budget applies to these users instead.",
    },
  },
} as const satisfies Record<
  string,
  {
    actionLabel: string;
    confirmLabel: string;
    title: (subject: GatewayBudgetSubject, count: number) => string;
    text: Record<GatewayBudgetSubject, string>;
  }
>;

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
  const { hasDefault } = table;
  const removalText = removalCopy[hasDefault ? "default" : "unlimited"];
  const bulkDisabledReason = selectedRows.every((row) => row.isEditable)
    ? undefined
    : notEditableReasons[tab];

  const handleRowClick = (row: GatewayBudgetRow) => table.toggleRow(row.id);

  return (
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
            onEditBudget={(row) =>
              openDialog({
                subject,
                subjects: [{ id: row.subjectId, name: row.name }],
                spendLimit: row.spendLimit,
                existingBudgetCount:
                  row.spendLimit !== null && !row.isDefault ? 1 : 0,
              })
            }
            hasDefault={hasDefault}
            search={table.search}
            status={table.status}
            pagination={{
              mode: "offset",
              totalCount: budgets.data?.totalCount ?? null,
              ...table.pagination,
            }}
          />
          <ConfirmationDialogController
            title={removalText.title(subject, selectedRows.length)}
            text={removalText.text[subject]}
            confirmLabel={removalText.confirmLabel}
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
                      (row) => row.spendLimit !== null && !row.isDefault,
                    ).length,
                    onSaved: clearSelection,
                  });
                }}
                removeLabel={removalText.actionLabel}
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
