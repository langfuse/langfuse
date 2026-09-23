import { useMemo } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import {
  BatchExportTableName,
  exportOptions,
  type BatchExportFileFormat,
} from "@langfuse/shared";

import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { AuditLogsTable, type AuditLogRow } from "./AuditLogsTable";

type AuditLogsTableProps =
  | { scope: "project"; projectId: string }
  | { scope: "organization"; orgId: string };

export function ConnectedAuditLogsTable(props: AuditLogsTableProps) {
  const hasBatchExportAccess = useHasProjectAccess({
    projectId: props.scope === "project" ? props.projectId : undefined,
    scope: "batchExports:create",
  });
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

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
  const createExport = api.batchExport.create.useMutation({
    onSuccess: (_data, variables) => {
      showSuccessToast({
        title: "Export queued",
        description: "You will receive an email when the export is ready.",
        duration: 10000,
        link: {
          href: `/project/${variables.projectId}/settings/exports`,
          text: "View exports",
        },
      });
    },
  });

  const toolbarActions =
    props.scope === "project" && hasBatchExportAccess
      ? (Object.keys(exportOptions) as BatchExportFileFormat[]).map(
          (format) => ({
            id: `export-${format}`,
            label: `Export ${exportOptions[format].label}`,
            loading: createExport.isPending,
            onClick: () =>
              createExport.mutate({
                projectId: props.projectId,
                name: `${new Date().toISOString()} - ${BatchExportTableName.AuditLogs} as ${format}`,
                format,
                query: {
                  tableName: BatchExportTableName.AuditLogs,
                  filter: [],
                  orderBy: { column: "createdAt", order: "DESC" },
                },
              }),
          }),
        )
      : undefined;

  const data = useMemo<AsyncTableData<AuditLogRow[]>>(() => {
    if (auditLogs.isPending) return { status: "loading" };
    if (auditLogs.isError) {
      return { status: "error", error: auditLogs.error.message };
    }
    return {
      status: "success",
      data: safeExtract(auditLogs.data, "data", []),
    };
  }, [auditLogs.data, auditLogs.error, auditLogs.isError, auditLogs.isPending]);

  return (
    <AuditLogsTable
      tableName={tableId}
      data={data}
      rowHeight={rowHeight}
      onRowHeightChange={setRowHeight}
      toolbarActions={toolbarActions}
      pagination={{
        totalCount: auditLogs.data?.totalCount ?? 0,
        onChange: setPaginationState,
        state: paginationState,
      }}
    />
  );
}
