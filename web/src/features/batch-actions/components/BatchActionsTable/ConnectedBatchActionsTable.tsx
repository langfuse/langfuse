import { useMemo } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";

import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { BatchActionsTable, type BatchActionRow } from "./BatchActionsTable";

export function ConnectedBatchActionsTable({
  projectId,
}: {
  projectId: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 10),
  });

  const batchActions = api.batchAction.all.useQuery({
    projectId,
    limit: paginationState.pageSize,
    page: paginationState.pageIndex,
  });

  const tableData = useMemo<AsyncTableData<BatchActionRow[]>>(() => {
    if (batchActions.isPending) return { status: "loading" };
    if (batchActions.isError) {
      return { status: "error", error: batchActions.error.message };
    }
    return {
      status: "success",
      data: safeExtract(batchActions.data, "batchActions", []),
    };
  }, [
    batchActions.data,
    batchActions.error,
    batchActions.isError,
    batchActions.isPending,
  ]);

  return (
    <BatchActionsTable
      data={tableData}
      pagination={{
        totalCount: batchActions.data?.totalCount ?? 0,
        onChange: setPaginationState,
        state: paginationState,
      }}
    />
  );
}
