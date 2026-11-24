import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { GatewayGuardrailDialogController } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";
import { GatewayGuardrailsSelectionBar } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsTable/components/GatewayGuardrailsSelectionBar/GatewayGuardrailsSelectionBar";
import { GatewayGuardrailsTable } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsTable/GatewayGuardrailsTable";
import {
  useDeleteGatewayGuardrails,
  type GatewayGuardrailDeleteTargetInput,
} from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/hooks/useDeleteGatewayGuardrails";
import { EVERYONE_TARGET_OPTION } from "@/src/features/ai-gateway/constants/guardrailTargetConstants";
import { assignmentsToTargetOptions } from "@/src/features/ai-gateway/fns/assignmentsToTargetOptions";
import type { useGatewayGuardrailsTableState } from "@/src/features/ai-gateway/hooks/useGatewayGuardrailsTableState";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import type { GatewayGuardrailRow } from "@/src/features/ai-gateway/types/gatewayGuardrailRow";

export type ConnectedGatewayGuardrailsTableProps = {
  organizationId: string;
  table: ReturnType<typeof useGatewayGuardrailsTableState>;
};

type DeleteConfirmationState = {
  target: GatewayGuardrailDeleteTargetInput;
  title: string;
  text: string;
  clearAfterDelete: boolean;
};

export function ConnectedGatewayGuardrailsTable({
  organizationId,
  table,
}: ConnectedGatewayGuardrailsTableProps) {
  const { canManageGateway } = useGatewaySettingsAccess(organizationId);
  const {
    guardrails,
    selectionStore,
    selectedRows,
    selectAll,
    clearSelection,
  } = table;
  const { selectActionColumn } = TableSelectionManager<GatewayGuardrailRow>({
    projectId: "",
    tableName: "gateway-guardrails",
    setSelectedRows: selectionStore.getState().actions.setRowSelection,
    setSelectAll: selectionStore.getState().actions.setSelectAll,
    selectionStore,
  });
  const { deleteGuardrails, mutation: deletion } =
    useDeleteGatewayGuardrails(organizationId);

  const totalCount = guardrails.data?.totalCount ?? null;
  const selectedCount = selectAll
    ? (totalCount ?? selectedRows.length)
    : selectedRows.length;

  const bulkTarget: GatewayGuardrailDeleteTargetInput = selectAll
    ? table.matching
    : { type: "ids", ids: selectedRows.map((row) => row.id) };

  const handleRowClick = (row: GatewayGuardrailRow) => table.toggleRow(row.id);

  return (
    <GatewayGuardrailDialogController organizationId={organizationId}>
      {({ openDialog }) => (
        <ConfirmationDialogController<DeleteConfirmationState>
          title={(state) => state.title}
          text={(state) => state.text}
          confirmLabel="Delete"
          variant="destructive"
          loading={deletion.isPending}
          error={deletion.error?.message}
          onAfterDismiss={() => deletion.reset()}
          onConfirm={async (state) => {
            const deletedCount = await deleteGuardrails(state.target);
            if (deletedCount === null) {
              throw new Error("Guardrails could not be deleted.");
            }
            table.clampPageAfterDelete(deletedCount);
            if (state.clearAfterDelete) clearSelection();
          }}
        >
          {({ openDialog: openDeleteDialog }) => {
            const handleEditGuardrail = (row: GatewayGuardrailRow) => {
              openDialog({ mode: "edit", guardrail: row });
            };

            const handleDeleteGuardrail = (row: GatewayGuardrailRow) => {
              openDeleteDialog({
                target: { type: "ids", ids: [row.id] },
                title: `Delete "${row.name}"?`,
                text: "Requests will no longer be checked against this guardrail.",
                clearAfterDelete: selectedRows.some(
                  (selected) => selected.id === row.id,
                ),
              });
            };

            const handleSetAppliesToSelected = () => {
              const initialTargets =
                !selectAll && selectedRows.length === 1
                  ? assignmentsToTargetOptions(selectedRows[0]!.assignments)
                  : [EVERYONE_TARGET_OPTION];
              openDialog({
                mode: "bulkTargets",
                target: bulkTarget,
                selectedCount,
                initialTargets,
                onAfterSave: clearSelection,
              });
            };

            const handleDeleteSelected = () => {
              openDeleteDialog({
                target: bulkTarget,
                title: `Delete ${selectedCount} ${selectedCount === 1 ? "guardrail" : "guardrails"}?`,
                text: "Requests will no longer be checked against these guardrails.",
                clearAfterDelete: true,
              });
            };

            return (
              <>
                <GatewayGuardrailsTable
                  canManage={canManageGateway}
                  data={toTableData(guardrails)}
                  onRowClick={handleRowClick}
                  selectColumn={{
                    ...selectActionColumn,
                    enableResizing: false,
                  }}
                  multiSelect={{
                    selectAll,
                    setSelectAll:
                      selectionStore.getState().actions.setSelectAll,
                    selectedRowIds: selectedRows.map((row) => row.id),
                    setRowSelection:
                      selectionStore.getState().actions.setRowSelection,
                    pageSize: table.pagination.state.pageSize,
                    pageIndex: table.pagination.state.pageIndex,
                    totalCount,
                  }}
                  onEditGuardrail={handleEditGuardrail}
                  onDeleteGuardrail={handleDeleteGuardrail}
                  search={table.search}
                  pagination={{
                    mode: "offset",
                    totalCount,
                    ...table.pagination,
                  }}
                />
                {canManageGateway ? (
                  <GatewayGuardrailsSelectionBar
                    selectedCount={selectedCount}
                    isBusy={deletion.isPending}
                    onClear={clearSelection}
                    onSetAppliesTo={handleSetAppliesToSelected}
                    onDelete={handleDeleteSelected}
                  />
                ) : null}
              </>
            );
          }}
        </ConfirmationDialogController>
      )}
    </GatewayGuardrailDialogController>
  );
}

function toTableData(query: {
  isError: boolean;
  data?: { rows: GatewayGuardrailRow[] };
}): AsyncTableData<GatewayGuardrailRow[]> {
  if (query.isError) {
    return { status: "error", error: "Guardrails could not be loaded." };
  }
  if (!query.data) return { status: "loading" };
  return { status: "success", data: query.data.rows };
}
