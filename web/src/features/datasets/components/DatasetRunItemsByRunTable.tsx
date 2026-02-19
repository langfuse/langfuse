import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
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
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useDebounce } from "@/src/hooks/useDebounce";

export function DatasetRunItemsByRunTable(props: {
  projectId: string;
  datasetId: string;
  datasetRunId: string;
  datasetVersion?: Date | null;
}) {
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 20),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("traces", "m");

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "dataset_run_items_by_run",
    props.projectId,
  );

  const datasetRunItemsFilterOptionsResponse =
    api.datasets.runItemFilterOptions.useQuery({
      projectId: props.projectId,
      datasetId: props.datasetId,
      datasetRunIds: [props.datasetRunId],
    });

  const runItems = api.datasets.runItemsByRunId.useQuery({
    ...props,
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
      projectId: props.projectId,
      scoreColumnKey: "scores",
      filter: scoreFilters.forDatasetRunItems({
        datasetRunIds: [props.datasetRunId],
        datasetId: props.datasetId,
      }),
    });

  const columns: LangfuseColumnDef<DatasetRunItemByRunRowData>[] = [
    {
      accessorKey: "datasetItemId",
      header: "Dataset Item",
      id: "datasetItemId",
      size: 110,
      isPinnedLeft: true,
      cell: ({ row }) => {
        const datasetItemId: string = row.getValue("datasetItemId");
        const versionParam = props.datasetVersion
          ? `?version=${props.datasetVersion.toISOString()}`
          : "";
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/items/${datasetItemId}${versionParam}`}
            value={datasetItemId}
          />
        );
      },
    },
    {
      accessorKey: "runAt",
      header: "Run At",
      id: "runAt",
      size: 150,
      cell: ({ row }) => {
        const value: DatasetRunItemByRunRowData["runAt"] =
          row.getValue("runAt");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "trace",
      header: "Trace",
      id: "trace",
      size: 60,
      cell: ({ row }) => {
        const trace: DatasetRunItemByRunRowData["trace"] =
          row.getValue("trace");
        if (!trace) return null;
        return trace.observationId ? (
          <TableLink
            path={`/project/${props.projectId}/traces/${encodeURIComponent(trace.traceId)}?observation=${encodeURIComponent(trace.observationId)}`}
            value={`Trace: ${trace.traceId}, Observation: ${trace.observationId}`}
            icon={<ListTree className="h-4 w-4" />}
          />
        ) : (
          <TableLink
            path={`/project/${props.projectId}/traces/${encodeURIComponent(trace.traceId)}`}
            value={`Trace: ${trace.traceId}`}
            icon={<ListTree className="h-4 w-4" />}
          />
        );
      },
    },
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
    {
      accessorKey: "totalCost",
      header: "Cost",
      id: "totalCost",
      size: 60,
      enableHiding: true,
      cell: ({ row }) => {
        const totalCost: DatasetRunItemByRunRowData["totalCost"] =
          row.getValue("totalCost");
        return totalCost ?? undefined;
      },
    },
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
      cell: ({ row }) => {
        const trace: DatasetRunItemByRunRowData["trace"] =
          row.getValue("trace");
        const runAt: DatasetRunItemByRunRowData["runAt"] =
          row.getValue("runAt");
        return trace ? (
          <TraceObservationIOCell
            traceId={trace.traceId}
            projectId={props.projectId}
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
      cell: ({ row }) => {
        const trace: DatasetRunItemByRunRowData["trace"] =
          row.getValue("trace");
        const runAt: DatasetRunItemByRunRowData["runAt"] =
          row.getValue("runAt");
        return trace ? (
          <TraceObservationIOCell
            traceId={trace.traceId}
            projectId={props.projectId}
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
      cell: ({ row }) => {
        const datasetItemId: string = row.getValue("datasetItemId");
        return datasetItemId ? (
          <DatasetItemIOCell
            projectId={props.projectId}
            datasetId={props.datasetId}
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
      `datasetRunsItemsColumnVisibility-${props.projectId}`,
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
        tableName={"datasetRunItems"}
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
