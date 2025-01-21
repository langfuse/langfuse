import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { cn } from "@/src/utils/tailwind";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type RouterOutputs } from "@/src/utils/api";

type AuditLogRow = RouterOutputs["auditLogs"]["all"]["data"][number];

export function AuditLogsTable(props: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const auditLogs = api.auditLogs.all.useQuery({
    projectId: props.projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("auditLogs", "s");

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
      accessorKey: "user",
      header: "User",
      headerTooltip: {
        description: "The user within Langfuse who performed the action.",
      },
      cell: (row) => {
        const user = row.getValue() as AuditLogRow["user"];
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              {user?.image && (
                <AvatarImage src={user.image} alt={user?.name ?? "User"} />
              )}
              <AvatarFallback>
                {user?.name?.charAt(0) ?? user?.email?.charAt(0) ?? "U"}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn("text-sm", !user?.name && "text-muted-foreground")}
            >
              {user?.name ?? user?.email ?? user.id}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "resourceType",
      header: "Resource Type",
    },
    {
      accessorKey: "resourceId",
      header: "Resource ID",
    },
    {
      accessorKey: "action",
      header: "Action",
    },
    {
      accessorKey: "before",
      header: "Before",
      size: 300,
      cell: (row) => {
        const value = row.getValue() as string | null;
        if (!value) return null;
        return <IOTableCell data={value} singleLine={rowHeight === "s"} />;
      },
    },
    {
      accessorKey: "after",
      header: "After",
      size: 300,
      cell: (row) => {
        const value = row.getValue() as string | null;
        if (!value) return null;
        return <IOTableCell data={value} singleLine={rowHeight === "s"} />;
      },
    },
  ];

  return (
    <>
      <DataTableToolbar
        columns={columns}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
      />
      <DataTable
        columns={columns}
        data={
          auditLogs.isLoading
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
                  data: auditLogs.data.data,
                }
        }
        pagination={{
          totalCount: auditLogs.data?.totalCount ?? 0,
          onChange: setPaginationState,
          state: paginationState,
        }}
        rowHeight={rowHeight}
      />
    </>
  );
}
