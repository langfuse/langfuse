import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { usdFormatter } from "../../../utils/numbers";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useEffect, useMemo } from "react";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { cn } from "@/src/utils/tailwind";
import {
  IOTableCell,
  MemoizedIOTableCell,
} from "@/src/components/ui/CodeJsonViewer";
import { ListTree } from "lucide-react";
import {
  getScoreGroupColumnProps,
  verifyAndPrefixScoreDataAgainstKeys,
} from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { type ScoreAggregate } from "@langfuse/shared";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";

export type DatasetRunItemRowData = {
  id: string;
  runAt: Date;
  datasetItemId: string;
  datasetRunName?: string;
  trace?: {
    traceId: string;
    observationId?: string;
  };
  // i/o not set explicitly, but fetched from the server from the cell
  input?: unknown;
  output?: unknown;
  expectedOutput?: unknown;

  // scores holds grouped column with individual scores
  scores: ScoreAggregate;
  latency?: number;
  totalCost?: string;
};

export function DatasetRunItemsTable(
  props:
    | {
        projectId: string;
        datasetId: string;
        datasetRunId: string; // View from run page
      }
    | {
        projectId: string;
        datasetId: string;
        datasetItemId: string; // View from item page
      },
) {
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 20),
  });
  const runItems = api.datasets.runitemsByRunIdOrItemId.useQuery({
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
      // set the datasetItems list only when viewing this table from the run page
      if ("datasetRunId" in props)
        setDetailPageList(
          "datasetItems",
          runItems.data.runItems.map((i) => ({ id: i.datasetItemId })),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runItems.isSuccess, runItems.data]);

  const { scoreColumns, scoreKeysAndProps, isColumnLoading } =
    useIndividualScoreColumns<DatasetRunItemRowData>({
      projectId: props.projectId,
      scoreColumnKey: "scores",
    });

  const columns: LangfuseColumnDef<DatasetRunItemRowData>[] = [
    {
      accessorKey: "runAt",
      header: "Run At",
      id: "runAt",
      size: 150,
      cell: ({ row }) => {
        const value: DatasetRunItemRowData["runAt"] = row.getValue("runAt");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "datasetRunName",
      header: "Run Name",
      id: "datasetRunName",
      size: 150,
      cell: ({ row }) => {
        const datasetRunName: string | undefined =
          row.getValue("datasetRunName");
        return datasetRunName || "-";
      },
    },
    {
      accessorKey: "datasetItemId",
      header: "Dataset Item",
      id: "datasetItemId",
      size: 110,
      cell: ({ row }) => {
        const datasetItemId: string = row.getValue("datasetItemId");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/items/${datasetItemId}`}
            value={datasetItemId}
          />
        );
      },
    },
    {
      accessorKey: "trace",
      header: "Trace",
      id: "trace",
      size: 60,
      cell: ({ row }) => {
        const trace: DatasetRunItemRowData["trace"] = row.getValue("trace");
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
        const latency: DatasetRunItemRowData["latency"] =
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
        const totalCost: DatasetRunItemRowData["totalCost"] =
          row.getValue("totalCost");
        return <>{totalCost}</>;
      },
    },
    { ...getScoreGroupColumnProps(isColumnLoading), columns: scoreColumns },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const trace: DatasetRunItemRowData["trace"] = row.getValue("trace");
        const runAt: DatasetRunItemRowData["runAt"] = row.getValue("runAt");
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
        const trace: DatasetRunItemRowData["trace"] = row.getValue("trace");
        const runAt: DatasetRunItemRowData["runAt"] = row.getValue("runAt");
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
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetRunItemRowData>(
      `datasetRunsItemsColumnVisibility-${props.projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<DatasetRunItemRowData>(
    "datasetRunsItemsColumnOrder",
    columns,
  );

  const rows = useMemo(() => {
    return runItems.isSuccess
      ? runItems.data.runItems.map((item) => {
          return {
            id: item.id,
            runAt: item.createdAt,
            datasetItemId: item.datasetItemId,
            datasetRunName: item.datasetRunName,
            trace: !!item.trace?.id
              ? {
                  traceId: item.trace.id,
                  observationId: item.observation?.id,
                }
              : undefined,
            scores: verifyAndPrefixScoreDataAgainstKeys(
              scoreKeysAndProps,
              item.scores,
            ),
            totalCost: !!item.observation?.calculatedTotalCost
              ? usdFormatter(item.observation.calculatedTotalCost.toNumber())
              : !!item.trace?.totalCost
                ? usdFormatter(item.trace.totalCost)
                : undefined,
            latency:
              item.observation?.latency ?? item.trace?.duration ?? undefined,
          };
        })
      : [];
  }, [runItems, scoreKeysAndProps]);

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

const TraceObservationIOCell = ({
  traceId,
  projectId,
  observationId,
  io,
  fromTimestamp,
  singleLine = false,
}: {
  traceId: string;
  projectId: string;
  observationId?: string;
  io: "input" | "output";
  fromTimestamp: Date;
  singleLine?: boolean;
}) => {
  // Subtract 1 day from the fromTimestamp as a buffer in case the trace happened before the run
  const fromTimestampModified = new Date(
    fromTimestamp.getTime() - 24 * 60 * 60 * 1000,
  );

  // conditionally fetch the trace or observation depending on the presence of observationId
  const trace = api.traces.byId.useQuery(
    { traceId, projectId, fromTimestamp: fromTimestampModified },
    {
      enabled: observationId === undefined,
      refetchOnMount: false, // prevents refetching loops
      staleTime: 60 * 1000, // 1 minute
      onError: () => {},
    },
  );
  const observation = api.observations.byId.useQuery(
    {
      observationId: observationId as string, // disabled when observationId is undefined
      projectId,
      traceId,
    },
    {
      enabled: observationId !== undefined,
      refetchOnMount: false, // prevents refetching loops
      staleTime: 60 * 1000, // 1 minute
      onError: () => {},
    },
  );

  const data = observationId === undefined ? trace.data : observation.data;

  return (
    <MemoizedIOTableCell
      isLoading={
        (!!!observationId ? trace.isLoading : observation.isLoading) || !data
      }
      data={io === "output" ? data?.output : data?.input}
      className={cn(io === "output" && "bg-accent-light-green")}
      singleLine={singleLine}
    />
  );
};

const DatasetItemIOCell = ({
  projectId,
  datasetId,
  datasetItemId,
  io,
  singleLine = false,
}: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  io: "expectedOutput" | "input";
  singleLine?: boolean;
}) => {
  const datasetItem = api.datasets.itemById.useQuery(
    {
      projectId: projectId,
      datasetId: datasetId,
      datasetItemId: datasetItemId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );

  return (
    <IOTableCell
      isLoading={datasetItem.isLoading}
      data={
        io === "expectedOutput"
          ? datasetItem.data?.expectedOutput
          : datasetItem.data?.input
      }
      singleLine={singleLine}
    />
  );
};
