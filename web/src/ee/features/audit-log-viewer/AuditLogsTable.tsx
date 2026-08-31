import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api, type RouterOutputs } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { cn } from "@/src/utils/tailwind";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BatchExportTableName } from "@langfuse/shared";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";

// Both endpoints return the same shape
type AuditLogRow = RouterOutputs["auditLogs"]["all"]["data"][number];

type AuditLogsTableProps =
  | { scope: "project"; projectId: string }
  | { scope: "organization"; orgId: string };

export function AuditLogsTable(props: AuditLogsTableProps) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  // Use the appropriate query based on scope
  const projectAuditLogs = api.auditLogs.all.useQuery(
    {
      projectId: props.scope === "project" ? props.projectId : "",
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: props.scope === "project" },
  );

  const orgAuditLogs = api.auditLogs.allByOrg.useQuery(
    {
      orgId: props.scope === "organization" ? props.orgId : "",
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: props.scope === "organization" },
  );

  const auditLogs = props.scope === "project" ? projectAuditLogs : orgAuditLogs;

  const tableId = props.scope === "project" ? "auditLogs" : "orgAuditLogs";
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(tableId, "s");

  const columns: LangfuseColumnDef<AuditLogRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Time",
      cell: (row) => {
        const date = row.getValue() as Date;
        return date.toLocaleString();
      },
    },
    {
      accessorKey: "actor",
      header: "Actor",
      headerTooltip: {
        description: "The actor within Langfuse who performed the action.",
      },
      cell: (row) => {
        const actor = row.getValue() as AuditLogRow["actor"];
        if (actor?.type === "USER") {
          const user = actor.body;
          return (
            <div className="flex items-center gap-2">
              <Avatar
                size="sm"
                src={user?.image ?? undefined}
                displayName={user?.name ?? user?.email ?? "User"}
              />
              <span
                className={cn(
                  "text-sm",
                  !user?.name && "text-muted-foreground",
                )}
              >
                {user?.name ?? user?.email ?? user.id}
              </span>
            </div>
          );
        }

        if (actor?.type === "API_KEY") {
          const apiKey = actor.body;
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm">{apiKey?.publicKey ?? apiKey?.id}</span>
            </div>
          );
        }

        return null;
      },
    },
    createTextTableColumn<AuditLogRow>({
      accessorKey: "resourceType",
      header: "Resource Type",
    }),
    createTextTableColumn<AuditLogRow>({
      accessorKey: "resourceId",
      header: "Resource ID",
    }),
    createTextTableColumn<AuditLogRow>({
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
  ];

  return (
    <>
      <DataTableToolbar
        columns={columns}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={
          props.scope === "project"
            ? [
                <BatchExportTableButton
                  key="audit-logs-export"
                  projectId={props.projectId}
                  tableName={BatchExportTableName.AuditLogs}
                  filterState={[]}
                  orderByState={{ column: "createdAt", order: "DESC" }}
                />,
              ]
            : []
        }
        className="px-0"
      />
      <SettingsTableCard>
        <DataTable
          tableName={tableId}
          columns={columns}
          data={
            auditLogs.isPending
              ? { isLoading: true, isError: false }
              : auditLogs.isError
                ? {
                    isLoading: false,
                    isError: true,
                    error: auditLogs.error.message,
                  }
                : {
                    isLoading: false,
                    isError: false,
                    data: safeExtract(auditLogs.data, "data", []),
                  }
          }
          pagination={{
            totalCount: auditLogs.data?.totalCount ?? 0,
            onChange: setPaginationState,
            state: paginationState,
          }}
          rowHeight={rowHeight}
          cellPadding="comfortable"
        />
      </SettingsTableCard>
    </>
  );
}
