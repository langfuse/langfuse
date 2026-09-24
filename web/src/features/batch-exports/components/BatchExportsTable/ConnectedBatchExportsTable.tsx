import { useCallback, useMemo, useState } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";

import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { BatchExportsTable, type BatchExportRow } from "./BatchExportsTable";

export function ConnectedBatchExportsTable({
  projectId,
}: {
  projectId: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const batchExports = api.batchExport.all.useQuery({
    projectId,
    limit: paginationState.pageSize,
    page: paginationState.pageIndex,
  });
  const cancelBatchExport = api.batchExport.cancel.useMutation({
    onSuccess: () => {
      batchExports.refetch();
    },
  });
  const downloadBatchExport = api.batchExport.downloadUrl.useMutation();
  const hasCancelAccess = useHasProjectAccess({
    projectId,
    scope: "batchExports:create",
  });

  const onDownload = useCallback(
    (id: string) => {
      setDownloadingIds((prev) => new Set(prev).add(id));
      downloadBatchExport.mutate(
        { projectId, batchExportId: id },
        {
          onSuccess: (data) => {
            window.location.href = data.url;
          },
          onSettled: () =>
            setDownloadingIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            }),
        },
      );
    },
    [downloadBatchExport, projectId],
  );
  const tableData = useMemo<AsyncTableData<BatchExportRow[]>>(() => {
    if (batchExports.isPending) return { status: "loading" };
    if (batchExports.isError) {
      return { status: "error", error: batchExports.error.message };
    }
    return {
      status: "success",
      data: safeExtract(batchExports.data, "exports", []),
    };
  }, [
    batchExports.data,
    batchExports.error,
    batchExports.isError,
    batchExports.isPending,
  ]);

  return (
    <ConfirmationDialogController<string>
      title="Cancel batch export?"
      text="Are you sure you want to cancel this batch export? This action cannot be undone."
      confirmLabel="Yes, cancel export"
      variant="destructive"
      loading={cancelBatchExport.isPending}
      error={cancelBatchExport.error?.message}
      onAfterDismiss={cancelBatchExport.reset}
      onConfirm={async (id) => {
        await cancelBatchExport.mutateAsync({ projectId, batchExportId: id });
      }}
    >
      {({ openDialog }) => (
        <BatchExportsTable
          data={tableData}
          pagination={{
            totalCount: batchExports.data?.totalCount ?? null,
            onChange: setPaginationState,
            state: paginationState,
          }}
          hasCancelAccess={hasCancelAccess}
          downloadingIds={downloadingIds}
          onDownload={onDownload}
          onCancel={openDialog}
        />
      )}
    </ConfirmationDialogController>
  );
}
