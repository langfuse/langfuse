import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { FilteredRunPills } from "@/src/components/table/filtered-run-pills";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { getDatasetRunAggregateColumnProps } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import { useDatasetRunAggregateColumns } from "@/src/features/datasets/hooks/useDatasetRunAggregateColumns";
import { NumberParam } from "use-query-params";
import { useQueryParams, withDefault } from "use-query-params";
import { useMemo, useState, useEffect } from "react";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Cog } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { PeekDatasetCompareDetail } from "@/src/components/table/peek/peek-dataset-compare-detail";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import {
  DatasetCompareMetricsProvider,
  useDatasetCompareMetrics,
} from "@/src/features/datasets/contexts/DatasetCompareMetricsContext";
import {
  getScoreDataTypeIcon,
  scoreFilters,
} from "@/src/features/scores/lib/scoreColumns";
import { useColumnFilterState } from "@/src/features/filters/hooks/useColumnFilterState";
import { type Prisma } from "@langfuse/shared";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";

export type DatasetCompareRunRowData = {
  id: string;
  input: Prisma.JsonValue;
  expectedOutput: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  // runs holds grouped column with individual run metrics
  runs?: Record<string, EnrichedDatasetRunItem>;
};

function DatasetCompareRunsTableInternal(props: {
  projectId: string;
  datasetId: string;
  runIds: string[];
  localExperiments: { key: string; value: string }[];
}) {
  const { toggleMetric, isMetricSelected } = useDatasetCompareMetrics();
  const [isMetricsDropdownOpen, setIsMetricsDropdownOpen] = useState(false);
  const {
    updateColumnFilters: updateRunFilters,
    getFiltersForColumnById: getFiltersForRun,
    convertToColumnFilterList,
  } = useColumnFilterState();
  const { setDetailPageList } = useDetailPageLists();
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "datasetCompareRuns",
    "m",
  );

  useEffect(() => {
    const allFilters = convertToColumnFilterList();
    allFilters.forEach((filter) => {
      if (!props.runIds.includes(filter.runId)) {
        updateRunFilters(filter.runId, []);
      }
    });
  }, [props.runIds, convertToColumnFilterList, updateRunFilters]);

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const datasetItemsWithRunData = api.datasets.datasetItemsWithRunData.useQuery(
    {
      projectId: props.projectId,
      datasetId: props.datasetId,
      runIds: props.runIds,
      filterByRun: convertToColumnFilterList(),
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
  );

  const totalCountQuery = api.datasets.runItemCompareCount.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    runIds: props.runIds,
    filterByRun: convertToColumnFilterList(),
  });

  const totalCount = totalCountQuery.data?.totalCount ?? null;

  useEffect(() => {
    if (datasetItemsWithRunData.isSuccess) {
      setDetailPageList(
        "datasetCompareRuns",
        datasetItemsWithRunData.data?.data.map((item) => ({
          id: item.id,
        })),
      );
    }
    // Note: setDetailPageList dependency is not stable as the context provider creates a new function on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetItemsWithRunData.isSuccess, datasetItemsWithRunData.data]);

  const scoreKeysAndProps = api.scores.getScoreColumns.useQuery({
    projectId: props.projectId,
    filter: scoreFilters.forDatasetRunItems({
      datasetRunIds: props.runIds,
      datasetId: props.datasetId,
    }),
  });

  const scoreKeyToDisplayName = useMemo(() => {
    if (!scoreKeysAndProps.data) return new Map<string, string>();
    return new Map(
      scoreKeysAndProps.data.scoreColumns.map(
        ({ key, dataType, source, name }) => [
          key,
          `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
        ],
      ),
    );
  }, [scoreKeysAndProps.data]);

  const { runAggregateColumns } = useDatasetRunAggregateColumns({
    projectId: props.projectId,
    runIds: props.runIds,
    datasetId: props.datasetId,
    scoreKeyToDisplayName,
    updateRunFilters,
    getFiltersForRun,
    cellsLoading: !scoreKeysAndProps.data,
  });

  const columns: LangfuseColumnDef<DatasetCompareRunRowData>[] = [
    {
      accessorKey: "id",
      header: "Item id",
      id: "id",
      size: 90,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const id: string = row.getValue("id");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/items/${id}`}
            value={id}
          />
        );
      },
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const input = row.getValue(
          "input",
        ) as DatasetCompareRunRowData["input"];
        return input !== null ? (
          <div className="h-full w-full">
            <IOTableCell data={input} />
          </div>
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
        const expectedOutput = row.getValue(
          "expectedOutput",
        ) as DatasetCompareRunRowData["expectedOutput"];
        return expectedOutput !== null ? (
          <div className="h-full w-full">
            <IOTableCell
              data={expectedOutput}
              className="bg-accent-light-green"
            />
          </div>
        ) : null;
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 200,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const metadata = row.getValue(
          "metadata",
        ) as DatasetCompareRunRowData["metadata"];
        return metadata !== null ? <IOTableCell data={metadata} /> : null;
      },
    },
    {
      ...getDatasetRunAggregateColumnProps(!scoreKeysAndProps.data),
      columns: runAggregateColumns,
    },
  ];

  const rows =
    datasetItemsWithRunData.data?.data.map((item) => ({
      ...item,
      runs: item.runData,
    })) ?? [];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetCompareRunRowData>(
      "datasetCompareRunsColumnVisibility",
      columns,
    );

  const peekNavigationProps = usePeekNavigation({
    queryParams: ["traceId"],
  });

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={
          <DropdownMenu open={isMetricsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setIsMetricsDropdownOpen(!isMetricsDropdownOpen)}
              >
                <Cog className="mr-2 h-4 w-4" />
                <span>Run metrics</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onPointerDownOutside={() => setIsMetricsDropdownOpen(false)}
            >
              <DropdownMenuCheckboxItem
                checked={isMetricSelected("scores")}
                onCheckedChange={() => toggleMetric("scores")}
              >
                Scores
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={isMetricSelected("resourceMetrics")}
                onCheckedChange={() => toggleMetric("resourceMetrics")}
              >
                Latency and cost
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <FilteredRunPills
        projectId={props.projectId}
        datasetId={props.datasetId}
        filteredRuns={convertToColumnFilterList()}
        className="px-2 pb-2"
      />
      <DataTable
        tableName={"datasetCompareRuns"}
        columns={columns}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        data={
          datasetItemsWithRunData.isPending
            ? { isLoading: true, isError: false }
            : datasetItemsWithRunData.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: datasetItemsWithRunData.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: rows,
                }
        }
        pagination={{
          totalCount: totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        rowHeight={rowHeight}
        customRowHeights={{
          s: "h-48",
          m: "h-64",
          l: "h-96",
        }}
        peekView={{
          itemType: "DATASET_ITEM",
          detailNavigationKey: "datasetCompareRuns",
          tableDataUpdatedAt: datasetItemsWithRunData.dataUpdatedAt,
          children: (
            <PeekDatasetCompareDetail
              projectId={props.projectId}
              scoreKeyToDisplayName={scoreKeyToDisplayName}
            />
          ),
          ...peekNavigationProps,
        }}
      />
    </>
  );
}

export function DatasetCompareRunsTable(props: {
  projectId: string;
  datasetId: string;
  runIds: string[];
  localExperiments: { key: string; value: string }[];
}) {
  return (
    <DatasetCompareMetricsProvider>
      <DatasetCompareRunsTableInternal {...props} />
    </DatasetCompareMetricsProvider>
  );
}
