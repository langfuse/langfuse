import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds, intervalInSeconds } from "@/src/utils/dates";
import { type RouterOutput } from "@/src/utils/types";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

import { type Score } from "@langfuse/shared/src/db";
import { usdFormatter } from "../../../utils/numbers";

type RowData = {
  id: string;
  runAt: string;
  datasetItemId: string;
  trace?: {
    traceId: string;
    observationId?: string;
  };
  scores: Score[];
  latency?: number;
  totalCost?: string;
};

export function DatasetRunItemsTable(
  props:
    | {
        projectId: string;
        datasetId: string;
        datasetRunId: string;
      }
    | {
        projectId: string;
        datasetId: string;
        datasetItemId: string;
      },
) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const runItems = api.datasets.runitemsByRunIdOrItemId.useQuery({
    ...props,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "runAt",
      header: "Run At",
    },
    {
      accessorKey: "datasetItemId",
      header: "Dataset Item",
      cell: ({ row }) => {
        const datasetItemId: string = row.getValue("datasetItemId");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/items/${datasetItemId}`}
            value={datasetItemId}
            truncateAt={7}
          />
        );
      },
    },
    {
      accessorKey: "trace",
      header: "Trace",
      cell: ({ row }) => {
        const trace: RowData["trace"] = row.getValue("trace");
        if (!trace) return null;
        return trace.observationId ? (
          <TableLink
            path={`/project/${props.projectId}/traces/${trace.traceId}?observation=${trace.observationId}`}
            value={trace.observationId}
            truncateAt={7}
          />
        ) : (
          <TableLink
            path={`/project/${props.projectId}/traces/${trace.traceId}`}
            value={trace.traceId}
            truncateAt={7}
          />
        );
      },
    },
    {
      accessorKey: "latency",
      header: "Latency",
      cell: ({ row }) => {
        const latency: RowData["latency"] = row.getValue("latency");
        return <>{!!latency ? formatIntervalSeconds(latency) : null}</>;
      },
    },
    {
      accessorKey: "totalCost",
      header: "Total Cost",
      cell: ({ row }) => {
        const totalCost: RowData["totalCost"] = row.getValue("totalCost");
        return <>{totalCost}</>;
      },
    },
    {
      accessorKey: "scores",
      header: "Scores",
      cell: ({ row }) => {
        const scores: RowData["scores"] = row.getValue("scores");
        return <GroupedScoreBadges scores={scores} variant="headings" />;
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["runitemsByRunIdOrItemId"]["runItems"][number],
  ): RowData => {
    return {
      id: item.id,
      runAt: item.createdAt.toISOString(),
      datasetItemId: item.datasetItemId,
      trace: !!item.trace?.id
        ? {
            traceId: item.trace.id,
            observationId: item.observation?.id,
          }
        : undefined,
      scores: item.scores,
      totalCost: !!item.observation?.calculatedTotalCost
        ? usdFormatter(item.observation.calculatedTotalCost.toNumber())
        : undefined,
      latency: item.observation?.latency ?? item.trace?.duration ?? undefined,
    };
  };

  return (
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
                data: runItems.data.runItems.map((t) => convertToTableRow(t)),
              }
      }
      pagination={{
        pageCount: Math.ceil(
          (runItems.data?.totalRunItems ?? 0) / paginationState.pageSize,
        ),
        onChange: setPaginationState,
        state: paginationState,
      }}
    />
  );
}
