import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter } from "@/src/utils/numbers";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useEffect, useMemo } from "react";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { ListTree } from "lucide-react";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { Skeleton } from "@/src/components/ui/skeleton";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import {
  DatasetItemIOCell,
  TraceObservationIOCell,
} from "@/src/features/datasets/components/DatasetIOCells";
import { datasetRunItemsTableColsWithOptions } from "@langfuse/shared";
import { convertRunItemToItemsByRunUiTableRow } from "@/src/features/datasets/lib/convertRunItemDataToUiTableRow";
import { type DatasetRunItemByRunRowData } from "@/src/features/datasets/lib/types";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useDebounce } from "@/src/hooks/useDebounce";

export function DatasetRunItemsByRunTable(props: {
  projectId: string;
  datasetId: string;
  datasetRunId: string;
  datasetVersion?: Date | null;
}) {
  const { projectId, datasetId, datasetRunId, datasetVersion } = props;
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 20),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("traces", "m");

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "dataset_run_items_by_run",
    projectId,
  );

  const datasetRunItemsFilterOptionsResponse =
    api.datasets.runItemFilterOptions.useQuery({
      projectId,
      datasetId,
      datasetRunIds: [datasetRunId],
    });

  const runItems = api.datasets.runItemsByRunId.useQuery({
    projectId,
    datasetId,
    datasetRunId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    filter: userFilterState,
  });

  const datasetRunItemsFilterOptions =
    datasetRunItemsFilterOptionsResponse.data;

  useEffect(() => {
    if (runItems.isSuccess) {
      setDetailPageList(
        "traces",
        runItems.data.runItems
          .filter((i) => !!i.trace)
          .map((i) => ({ id: i.trace!.id })),
      );
      setDetailPageList(
        "datasetItems",
        runItems.data.runItems.map((i) => ({ id: i.datasetItemId })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runItems.isSuccess, runItems.data]);

  const transformedFilterOptions = useMemo(() => {
    return datasetRunItemsTableColsWithOptions(datasetRunItemsFilterOptions);
  }, [datasetRunItemsFilterOptions]);

  const setFilterState = useDebounce(setUserFilterState);

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<DatasetRunItemByRunRowData>({
      projectId,
      scoreColumnKey: "scores",
      filter: scoreFilters.forDatasetRunItems({
        datasetRunIds: [datasetRunId],
        datasetId,
      }),
    });

  const columns: LangfuseColumnDef<DatasetRunItemByRunRowData>[] = [
    createLinkTableColumn<DatasetRunItemByRunRowData>({
      accessorKey: "datasetItemId",
      header: "Dataset Item",
      size: 110,
      isPinnedLeft: true,
      getCell: (datasetItemId) => {
        if (!datasetItemId) return undefined;
        let versionParam = "";
        if (datasetVersion) {
          versionParam = `?version=${datasetVersion.toISOString()}`;
        }
        return {
          type: "link",
          props: {
            path: `/project/${projectId}/datasets/${datasetId}/items/${datasetItemId}${versionParam}`,
            value: datasetItemId,
          },
        };
      },
    }),
    createDateTableColumn<DatasetRunItemByRunRowData>({
      accessorKey: "runAt",
      header: "Run At",
      size: 150,
    }),
    createLinkTableColumn<
      DatasetRunItemByRunRowData,
      DatasetRunItemByRunRowData["trace"]
    >({
      accessorKey: "trace",
      header: "Trace",
      size: 60,
      getCell: (trace) => {
        if (!trace) return undefined;
        if (trace.observationId) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/traces/${encodeURIComponent(trace.traceId)}?observation=${encodeURIComponent(trace.observationId)}`,
              value: `Trace: ${trace.traceId}, Observation: ${trace.observationId}`,
              icon: ListTree,
            },
          };
        }
        return {
          type: "link",
          props: {
            path: `/project/${projectId}/traces/${encodeURIComponent(trace.traceId)}`,
            value: `Trace: ${trace.traceId}`,
            icon: ListTree,
          },
        };
      },
    }),
    {
      accessorKey: "latency",
      header: "Latency",
      id: "latency",
      size: 70,
      enableHiding: true,
      cell: ({ row }) => {
        const latency: DatasetRunItemByRunRowData["latency"] =
          row.getValue("latency");
        return <>{!!latency ? formatIntervalSeconds(latency) : null}</>;
      },
    },
    createNumberTableColumn<DatasetRunItemByRunRowData>({
      accessorKey: "totalCost",
      header: "Cost",
      size: 60,
      enableHiding: true,
      formatter: (value) => usdFormatter(value),
    }),
    {
      accessorKey: "scores",
      header: "Scores",
      id: "scores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isColumnLoading ? <Skeleton className="h-3 w-1/2" /> : null;
      },
      columns: scoreColumns,
    },
    {
      accessorKey: "input",
      header: "Trace Input",
      id: "input",
      size: 200,
      enableHiding: true,
      cellBackground: "gray",
      cell: ({ row }) => {
        const trace: DatasetRunItemByRunRowData["trace"] =
          row.getValue("trace");
        const runAt: DatasetRunItemByRunRowData["runAt"] =
          row.getValue("runAt");
        return trace ? (
          <TraceObservationIOCell
            traceId={trace.traceId}
            projectId={projectId}
            observationId={trace.observationId}
            io="input"
            fromTimestamp={runAt}
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
    },
    {
      accessorKey: "output",
      header: "Output",
      id: "output",
      size: 200,
      enableHiding: true,
      cellBackground: "green",
      cell: ({ row }) => {
        const trace: DatasetRunItemByRunRowData["trace"] =
          row.getValue("trace");
        const runAt: DatasetRunItemByRunRowData["runAt"] =
          row.getValue("runAt");
        return trace ? (
          <TraceObservationIOCell
            traceId={trace.traceId}
            projectId={projectId}
            observationId={trace.observationId}
            io="output"
            fromTimestamp={runAt}
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
    },
    {
      accessorKey: "expectedOutput",
      header: "Expected Output",
      id: "expectedOutput",
      size: 200,
      enableHiding: true,
      cellBackground: "green",
      cell: ({ row }) => {
        const datasetItemId: string = row.getValue("datasetItemId");
        return datasetItemId ? (
          <DatasetItemIOCell
            projectId={projectId}
            datasetId={datasetId}
            datasetItemId={datasetItemId}
            datasetItemVersion={row.original.datasetItemVersion}
            io="expectedOutput"
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetRunItemByRunRowData>(
      `datasetRunsItemsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] =
    useColumnOrder<DatasetRunItemByRunRowData>(
      "datasetRunsItemsColumnOrder",
      columns,
    );

  const rows = useMemo(() => {
    return runItems.isSuccess
      ? runItems.data.runItems.map((item) =>
          convertRunItemToItemsByRunUiTableRow(item),
        )
      : [];
  }, [runItems.isSuccess, runItems.data?.runItems]);

  return (
    <>
      <DataTableToolbar
        columns={columns}
        tableName="dataset-run-items"
        filterColumnDefinition={transformedFilterOptions}
        filterState={userFilterState}
        setFilterState={setFilterState}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
      />
      <DataTable
        tableName="datasetRunItems"
        columns={columns}
        data={
          runItems.isLoading
            ? { isLoading: true, isError: false }
            : runItems.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: runItems.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: rows,
                }
        }
        pagination={{
          totalCount: runItems.data?.totalRunItems ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
    </>
  );
}
