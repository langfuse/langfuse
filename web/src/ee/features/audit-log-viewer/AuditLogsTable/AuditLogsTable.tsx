import DiffViewer from "@/src/components/DiffViewer";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { createActorTableColumn } from "@/src/components/design-system/table/columns/createActorTableColumn";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createButtonTableColumn } from "@/src/components/design-system/table/columns/createButtonTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import {
  SettingsTable,
  type SettingsTableToolbarAction,
} from "@/src/components/SettingsTable/SettingsTable";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RouterOutputs } from "@/src/utils/api";

export type AuditLogRow = RouterOutputs["auditLogs"]["all"]["data"][number];

function formatAuditLogValue(value: string | null) {
  if (value === null) return "(none)";

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function AuditLogsTable({
  tableName,
  data,
  pagination,
  rowHeight,
  onRowHeightChange,
  toolbarActions,
}: {
  tableName: string;
  data: TableProps<AuditLogRow>["data"];
  pagination: PaginationBarProps;
  rowHeight: RowHeight;
  onRowHeightChange: (height: RowHeight) => void;
  toolbarActions?: SettingsTableToolbarAction[];
}) {
  return (
    <DialogController<AuditLogRow>
      renderDialog={({ state }) => (
        <Dialog title="Audit log changes" size="xxl">
          <Dialog.Body>
            <p>
              {state.action} · {state.resourceType} · {state.resourceId}
            </p>
            <DiffViewer
              oldString={formatAuditLogValue(state.before)}
              newString={formatAuditLogValue(state.after)}
              oldLabel="Before"
              newLabel="After"
            />
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => {
        const columns: LangfuseColumnDef<AuditLogRow>[] = [
          createDateTableColumn<AuditLogRow>({
            accessorKey: "createdAt",
            header: "Time",
          }),
          createActorTableColumn<AuditLogRow>({
            accessorKey: "actor",
            header: "Actor",
            variant: "avatar",
            emptyValue: "",
            headerTooltip: {
              description:
                "The actor within Langfuse who performed the action.",
            },
          }),
          createBadgeTableColumn<AuditLogRow>({
            accessorKey: "resourceType",
            header: "Resource Type",
          }),
          createIdTableColumn<AuditLogRow>({
            accessorKey: "resourceId",
            header: "Resource ID",
          }),
          createBadgeTableColumn<AuditLogRow>({
            accessorKey: "action",
            header: "Action",
          }),
          createIOTableColumn<AuditLogRow>({
            accessorKey: "before",
            header: "Before",
            size: 300,
            getCell: (value) => value || undefined,
            singleLine: rowHeight === "s",
          }),
          createIOTableColumn<AuditLogRow>({
            accessorKey: "after",
            header: "After",
            size: 300,
            getCell: (value) => value || undefined,
            singleLine: rowHeight === "s",
          }),
          createButtonTableColumn<AuditLogRow, AuditLogRow["id"]>({
            accessorFn: (row) => row.id,
            id: "compare",
            header: "Compare",
            size: 96,
            enableHiding: false,
            getButton: ({ row }) => ({
              text: "Compare",
              disabled: !row.original.before && !row.original.after,
              onClick: () => openDialog(row.original),
            }),
          }),
        ];

        return (
          <SettingsTable
            tableName={tableName}
            columns={columns}
            columnVisibilityKey={`${tableName}ColumnVisibility`}
            columnOrderKey={`${tableName}ColumnOrder`}
            data={data}
            loadingRowCount={Math.min(pagination.state.pageSize, 8)}
            rowHeight={rowHeight}
            pagination={pagination}
            rowHeightControl={{ rowHeight, onRowHeightChange }}
            toolbarActions={toolbarActions}
            toolbarNotice={
              toolbarActions?.length
                ? "Note: Filters are not applied to audit log exports. All audit logs for this project will be exported."
                : undefined
            }
          />
        );
      }}
    </DialogController>
  );
}
