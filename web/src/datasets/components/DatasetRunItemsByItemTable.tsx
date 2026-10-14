/* eslint-disable no-nested-ternary */
import { DataTable } from "@/src/app/tables/common-components/data-table";
import { type LangfuseColumnDef } from "@/src/app/tables/common-components/types";
import { createLinkTableColumn } from "@/src/app/design-system/table/columns/createLinkTableColumn";
import { api } from "@/src/app/utils/api";
import { formatIntervalSeconds } from "@/src/app/utils/dates";
import { usdFormatter } from "@/src/app/utils/numbers";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import {
  useColumnOrder,
  useColumnVisibility,
} from "@/src/app/tables/column-visibility";
import { DataTableToolbar } from "@/src/app/tables/common-components/data-table-toolbar";
import { useDetailPageLists } from "@/src/app/shell/navigate-detail-pages";
import { useEffect, useMemo } from "react";
import {
  customRowHeightMenu,
  isCompactRowHeight,
  useRowHeightLocalStorage,
} from "@/src/app/tables/common-components/data-table-row-height-switch";
import { ListTree } from "lucide-react";
import { scoreFilters, useScoreColumns } from "@/src/scores";
import { createDateTableColumn } from "@/src/app/design-system/table/columns/createDateTableColumn";
import { createIdTableColumn } from "@/src/app/design-system/table/columns/createIdTableColumn";
import { createNumberTableColumn } from "@/src/app/design-system/table/columns/createNumberTableColumn";
import { Skeleton } from "@/src/app/design-system/legacy-primitives/skeleton";
import { convertRunItemToItemsByItemUiTableRow } from "@/src/datasets/lib/convertRunItemDataToUiTableRow";
import {
  DatasetItemIOCell,
  TraceObservationIOCell,
} from "@/src/datasets/components/DatasetIOCells";
import { type DatasetRunItemByItemRowData } from "@/src/datasets/lib/types";

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

  const [rowHeight, setRowHeight, rowHeights] = useRowHeightLocalStorage(
    "traces",
    "m",
  );
  const compactRows = isCompactRowHeight(
    rowHeight,
    rowHeights.mode,
    rowHeights.activeHeightPx,
  );

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
    createIdTableColumn<DatasetRunItemByItemRowData>({
      accessorKey: "datasetRunName",
      header: "Run Name",
      size: 150,
      isPinnedLeft: true,
    }),
    createDateTableColumn<DatasetRunItemByItemRowData>({
      accessorKey: "runAt",
      header: "Run At",
      size: 150,
    }),
    {
      accessorKey: "input",
      header: "Trace Input",
      id: "input",
      size: 200,
      enableHiding: true,
      cellBackground: "gray",
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
            singleLine={compactRows}
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
      cellBackground: "green",
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
            singleLine={compactRows}
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
      cell: () => (
        <DatasetItemIOCell
          projectId={props.projectId}
          datasetId={props.datasetId}
          datasetItemId={props.datasetItemId}
          io="expectedOutput"
          singleLine={compactRows}
        />
      ),
    },
    createLinkTableColumn<
      DatasetRunItemByItemRowData,
      DatasetRunItemByItemRowData["trace"]
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
              path: `/project/${props.projectId}/traces/${encodeURIComponent(trace.traceId)}?observation=${encodeURIComponent(trace.observationId)}`,
              value: `Trace: ${trace.traceId}, Observation: ${trace.observationId}`,
              icon: ListTree,
            },
          };
        }
        return {
          type: "link",
          props: {
            path: `/project/${props.projectId}/traces/${encodeURIComponent(trace.traceId)}`,
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
        const latency: DatasetRunItemByItemRowData["latency"] =
          row.getValue("latency");
        return <>{!!latency ? formatIntervalSeconds(latency) : null}</>;
      },
    },
    createNumberTableColumn<DatasetRunItemByItemRowData>({
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
        tableName="dataset-run-items-by-item"
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        customRowHeight={customRowHeightMenu(rowHeights)}
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
        customRowHeightPx={rowHeights.activeHeightPx}
        onCustomRowHeightChange={rowHeights.setCustomPx}
        onSelectRowHeight={setRowHeight}
      />
    </>
  );
}
