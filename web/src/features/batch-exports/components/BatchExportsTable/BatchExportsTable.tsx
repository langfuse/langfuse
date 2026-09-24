import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RouterOutputs } from "@/src/utils/api";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { ActionButton } from "@/src/components/ActionButton";
import { DownloadIcon } from "lucide-react";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { useMemo } from "react";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";

export type BatchExportRow =
  RouterOutputs["batchExport"]["all"]["exports"][number];

export function BatchExportsTable({
  data,
  pagination,
  hasCancelAccess,
  downloadingIds,
  onDownload,
  onCancel,
}: {
  data: TableProps<BatchExportRow>["data"];
  pagination: PaginationBarProps;
  hasCancelAccess: boolean;
  downloadingIds: Set<string>;
  onDownload: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const columns = useMemo<LangfuseColumnDef<BatchExportRow>[]>(
    () => [
      createTextTableColumn<BatchExportRow>({
        accessorKey: "name",
        header: "Name",
        size: 200,
        tooltip: ({ row }) => {
          const { createdAt, finishedAt, expiresAt } = row.original;
          return [
            `Created: ${new Date(createdAt).toLocaleString()}`,
            `Finished: ${finishedAt ? new Date(finishedAt).toLocaleString() : "-"}`,
            `Download expires: ${expiresAt ? new Date(expiresAt).toLocaleString() : "-"}`,
          ].join("\n");
        },
      }),
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        size: 90,
        cell: ({ row }) => {
          const { status, log } = row.original;
          const badge = <StatusBadge type={status.toLowerCase()} />;
          // The log only exists on failed exports (worker-written, user-facing
          // error message); surface it on the badge instead of a dedicated
          // column that is empty for every successful row.
          if (!log) {
            return badge;
          }
          return (
            <CustomTooltip
              content={
                <div className="max-w-md whitespace-pre-wrap">{log}</div>
              }
            >
              {({ getTriggerProps }) => (
                <button
                  type="button"
                  {...getTriggerProps()}
                  aria-label="Export error"
                >
                  {badge}
                </button>
              )}
            </CustomTooltip>
          );
        },
      },
      {
        accessorKey: "isDownloadable",
        id: "action",
        header: "Action",
        size: 130,
        // One state-dependent action per row: Cancel while queued/processing,
        // Download (or Expired) once completed — the states never coexist.
        cell: ({ row }) => {
          const { id, status, isExpired, isDownloadable } = row.original;
          if (isDownloadable) {
            return (
              <ActionButton
                icon={<DownloadIcon size={16} />}
                size="sm"
                loading={downloadingIds.has(id)}
                onClick={() => onDownload(id)}
              >
                Download
              </ActionButton>
            );
          }
          if (status === "COMPLETED" && isExpired) {
            return <span className="text-muted-foreground">Expired</span>;
          }
          if (status === "QUEUED" || status === "PROCESSING") {
            return (
              <ActionButton
                hasAccess={hasCancelAccess}
                size="sm"
                onClick={() => onCancel(id)}
              >
                Cancel
              </ActionButton>
            );
          }
          return null;
        },
      },
      createDateTableColumn<BatchExportRow>({
        accessorKey: "expiresAt",
        header: "Expires",
        size: 130,
        mode: "relative",
        emptyValue: "-",
        getValue: (expiresAt, { row }) => {
          const { status, isExpired } = row.original;
          // The Action column already reads "Expired" for lapsed exports; a
          // "how long ago" timestamp adds nothing, so show the countdown only
          // while the download is still available.
          if (status !== "COMPLETED" || !expiresAt || isExpired) {
            return undefined;
          }
          return expiresAt;
        },
      }),
      createTextTableColumn<BatchExportRow>({
        accessorKey: "format",
        header: "Format",
        size: 70,
      }),
      createUserTableColumn<BatchExportRow>({
        accessorKey: "user",
        header: "Created By",
        size: 150,
        variant: "avatar",
        emptyValue: "Unknown",
      }),
    ],
    [downloadingIds, hasCancelAccess, onCancel, onDownload],
  );

  return (
    <SettingsTable
      tableName="batchExports"
      columns={columns}
      data={data}
      pagination={pagination}
      loadingRowCount={Math.max(1, Math.min(pagination.state.pageSize, 8))}
    />
  );
}
