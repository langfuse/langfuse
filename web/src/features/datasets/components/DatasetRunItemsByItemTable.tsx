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
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Skeleton } from "@/src/components/ui/skeleton";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import TableIdOrName from "@/src/components/table/table-id";
import { convertRunItemToItemsByItemUiTableRow } from "@/src/features/datasets/lib/convertRunItemDataToUiTableRow";
import {
  DatasetItemIOCell,
  TraceObservationIOCell,
} from "@/src/features/datasets/components/DatasetIOCells";
import { type DatasetRunItemByItemRowData } from "@/src/features/datasets/lib/types";

export function DatasetRunItemsByItemTable(props: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
}) {
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 20),
  });

  const runItems = api.datasets.runItemsByItemId.useQuery({
    ...props,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("traces", "m");

  useEffect(() => {
    if (runItems.isSuccess) {
      setDetailPageList(
        "traces",
        runItems.data.runItems
          .filter((i) => !!i.trace)
          .map((i) => ({ id: i.trace!.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runItems.isSuccess, runItems.data]);

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<DatasetRunItemByItemRowData>({
      projectId: props.projectId,
      scoreColumnKey: "scores",
      filter: scoreFilters.forDatasetItems({
        datasetItemIds: [props.datasetItemId],
        datasetId: props.datasetId,
      }),
    });

  const columns: LangfuseColumnDef<DatasetRunItemByItemRowData>[] = [
    {
      accessorKey: "datasetRunName",
      header: "Run Name",
      id: "datasetRunName",
      size: 150,
      isPinnedLeft: true,
      cell: ({ row }) => {
        const datasetRunName: string | undefined =
          row.getValue("datasetRunName");
        return <TableIdOrName value={datasetRunName || "-"} />;
      },
    },
    {
      accessorKey: "runAt",
      header: "Run At",
      id: "runAt",
      size: 150,
      cell: ({ row }) => {
        const value: DatasetRunItemByItemRowData["runAt"] =
          row.getValue("runAt");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "input",
      header: "Trace Input",
      id: "input",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const trace: DatasetRunItemByItemRowData["trace"] =
          row.getValue("trace");
        const runAt: DatasetRunItemByItemRowData["runAt"] =
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
      header: "Trace Output",
      id: "output",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const trace: DatasetRunItemByItemRowData["trace"] =
          row.getValue("trace");
        const runAt: DatasetRunItemByItemRowData["runAt"] =
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
            io="expectedOutput"
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
    },
    {
      accessorKey: "trace",
      header: "Trace",
      id: "trace",
      size: 60,
      cell: ({ row }) => {
        const trace: DatasetRunItemByItemRowData["trace"] =
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
        const latency: DatasetRunItemByItemRowData["latency"] =
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
        const totalCost: DatasetRunItemByItemRowData["totalCost"] =
          row.getValue("totalCost");
        return <>{totalCost}</>;
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
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetRunItemByItemRowData>(
      `datasetRunsByItemColumnVisibility-${props.projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] =
    useColumnOrder<DatasetRunItemByItemRowData>(
      "datasetRunsByItemColumnOrder",
      columns,
    );

  const rows = useMemo(() => {
    return runItems.isSuccess
      ? runItems.data.runItems.map((item) =>
          convertRunItemToItemsByItemUiTableRow(item),
        )
      : [];
  }, [runItems.isSuccess, runItems.data?.runItems]);

  return (
    <>
      <DataTableToolbar
        columns={columns}
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
