import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { useEffect, useMemo, useState } from "react";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type Prisma, datasetRunsTableColsWithOptions } from "@langfuse/shared";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { type ScoreAggregate } from "@langfuse/shared";
import { ChevronDown, Columns3, MoreVertical, Trash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { DeleteDatasetRunButton } from "@/src/features/datasets/components/DeleteDatasetRunButton";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { Checkbox } from "@/src/components/ui/checkbox";
import { type RowSelectionState } from "@tanstack/react-table";
import Link from "next/link";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  RESOURCE_METRICS,
  transformAggregatedRunMetricsToChartData,
} from "@/src/features/dashboard/lib/score-analytics-utils";
import { compareViewChartDataToDataPoints } from "@/src/features/dashboard/lib/chart-data-adapters";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { CompareViewAdapter } from "@/src/features/scores/adapters";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/src/components/ui/resizable";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import {
  scoreFilters,
  addPrefixToScoreKeys,
  convertScoreColumnsToAnalyticsData,
} from "@/src/features/scores/lib/scoreColumns";
import { getScoreLabelFromKey } from "@/src/features/scores/lib/aggregateScores";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";

export type DatasetRunRowData = {
  id: string;
  name: string;
  createdAt: Date;
  countRunItems: string;
  avgLatency: number | undefined;
  avgTotalCost: string | undefined;
  totalCost: string | undefined;
  // scores holds grouped column with individual scores
  runItemScores?: ScoreAggregate | undefined;
  runScores?: ScoreAggregate | undefined;
  description: string;
  metadata: Prisma.JsonValue;
};

const DatasetRunTableMultiSelectAction = ({
  selectedRunIds,
  projectId,
  datasetId,
  setRowSelection,
}: {
  selectedRunIds: string[];
  projectId: string;
  datasetId: string;
  setRowSelection: (value: Record<string, boolean>) => void;
}) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const mutDelete = api.datasets.deleteDatasetRuns.useMutation({
    onSuccess: () => {
      utils.datasets.invalidate();
      setRowSelection({});
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={selectedRunIds.length < 1}
            onClick={() => capture("dataset_run:compare_view_click")}
          >
            Actions ({selectedRunIds.length} selected)
            <ChevronDown className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent key="dropdown-menu-content">
          <Link
            key="compare"
            href={{
              pathname: `/project/${projectId}/datasets/${datasetId}/compare`,
              query: { runs: selectedRunIds },
            }}
          >
            <DropdownMenuItem>
              <Columns3 className="mr-2 h-4 w-4" />
              <span>Compare</span>
            </DropdownMenuItem>
          </Link>
          <DropdownMenuItem
            key="delete"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        key="delete-dialog"
        open={isDeleteDialogOpen}
        onOpenChange={(isOpen) => {
          if (!mutDelete.isPending) {
            setIsDeleteDialogOpen(isOpen);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="mb-4">Please confirm</DialogTitle>
            <DialogDescription className="text-md p-0">
              This action cannot be undone and removes all the data associated
              with {selectedRunIds.length} dataset run
              {selectedRunIds.length > 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              loading={mutDelete.isPending}
              disabled={mutDelete.isPending}
              onClick={async (event) => {
                event.preventDefault();
                capture("dataset_run:delete_form_submit");
                await mutDelete.mutateAsync({
                  projectId,
                  datasetId,
                  datasetRunIds: selectedRunIds,
                });
                setIsDeleteDialogOpen(false);
              }}
            >
              Delete Dataset Runs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export function DatasetRunsTable(props: {
  projectId: string;
  datasetId: string;
  selectedMetrics: string[];
  setScoreOptions: (options: { key: string; value: string }[]) => void;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "dataset_runs",
    props.projectId,
  );

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "datasetRuns",
    "s",
  );

  // Add panel size state with default size of 30%
  const [chartsPanelSize, setChartsPanelSize] = useSessionStorage<number>(
    "dataset-runs-charts-panel-size",
    30,
  );

  const { setScoreOptions } = props;

  // Filter options for the table
  const datasetRunsFilterOptionsResponse =
    api.datasets.runFilterOptions.useQuery(
      { projectId: props.projectId, datasetId: props.datasetId },
      {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const datasetRunsFilterOptions = datasetRunsFilterOptionsResponse.data;

  const transformedFilterOptions = useMemo(() => {
    return datasetRunsTableColsWithOptions(datasetRunsFilterOptions);
  }, [datasetRunsFilterOptions]);

  const setFilterState = useDebounce(setUserFilterState);

  const runs = api.datasets.runsByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    filter: userFilterState,
  });

  const runsMetrics = api.datasets.runsByDatasetIdMetrics.useQuery(
    {
      projectId: props.projectId,
      datasetId: props.datasetId,
      runIds: runs.data?.runs.map((r) => r.id) ?? [],
      filter: userFilterState,
    },
    {
      enabled: runs.isSuccess,
    },
  );

  type DatasetsCoreOutput =
    RouterOutput["datasets"]["runsByDatasetId"]["runs"][number];
  type DatasetsMetricOutput =
    RouterOutput["datasets"]["runsByDatasetIdMetrics"]["runs"][number];

  const runsWithMetrics = joinTableCoreAndMetrics<
    DatasetsCoreOutput,
    DatasetsMetricOutput
  >(runs.data?.runs, runsMetrics.data?.runs);

  const { setDetailPageList } = useDetailPageLists();
  useEffect(() => {
    if (runs.isSuccess) {
      setDetailPageList(
        "datasetRuns",
        runs.data.runs.map((t) => ({ id: t.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.isSuccess, runs.data]);

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<DatasetRunRowData>({
      displayFormat: "aggregate",
      scoreColumnKey: "runItemScores",
      projectId: props.projectId,
      filter: runs.data?.runs?.length
        ? scoreFilters.forDatasetRunItems({
            datasetRunIds: runs.data.runs.map((r) => r.id),
            datasetId: props.datasetId,
          })
        : [],
      isFilterDataPending: runs.isPending,
    });

  const { scoreColumns: runScoreColumns, isLoading: isRunScoreColumnLoading } =
    useScoreColumns<DatasetRunRowData>({
      scoreColumnKey: "runScores",
      projectId: props.projectId,
      filter: runs.data?.runs?.length
        ? scoreFilters.forDatasetRuns({
            datasetRunIds: runs.data?.runs.map((r) => r.id),
          })
        : [],
      prefix: "Run-level",
      isFilterDataPending: runs.isPending,
    });

  const scoreKeysAndProps = api.scores.getScoreColumns.useQuery(
    {
      projectId: props.projectId,
      filter: runs.data?.runs?.length
        ? scoreFilters.forDatasetRunItems({
            datasetRunIds: runs.data?.runs.map((r) => r.id),
            datasetId: props.datasetId,
          })
        : [],
    },
    {
      enabled: runs.isSuccess,
    },
  );

  const scoreIdToName = useMemo(() => {
    return new Map(
      scoreKeysAndProps.data?.scoreColumns.map((obj) => [obj.key, obj.name]) ??
        [],
    );
  }, [scoreKeysAndProps.data?.scoreColumns]);

  const runAggregatedMetrics = useMemo(() => {
    return transformAggregatedRunMetricsToChartData(
      runsMetrics.data?.runs ?? [],
      scoreIdToName,
    );
  }, [runsMetrics.data, scoreIdToName]);

  const { scoreAnalyticsOptions } = useMemo(
    () =>
      convertScoreColumnsToAnalyticsData(scoreKeysAndProps.data?.scoreColumns),
    [scoreKeysAndProps.data?.scoreColumns],
  );

  useEffect(() => {
    setScoreOptions(scoreAnalyticsOptions);
  }, [scoreAnalyticsOptions, setScoreOptions]);

  const columns: LangfuseColumnDef<DatasetRunRowData>[] = [
    {
      id: "select",
      accessorKey: "select",
      size: 30,
      isFixedPosition: true,
      isPinnedLeft: true,
      header: ({ table }) => {
        return (
          <div className="flex h-full items-center">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected()
                  ? true
                  : table.getIsSomePageRowsSelected()
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(value) => {
                table.toggleAllPageRowsSelected(!!value);
                if (!value) {
                  setSelectedRows({});
                }
              }}
              aria-label="Select all"
              className="opacity-60"
            />
          </div>
        );
      },
      cell: ({ row }) => {
        return (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="opacity-60"
          />
        );
      },
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      size: 150,
      isFixedPosition: true,
      isPinnedLeft: true,
      cell: ({ row }) => {
        const name: DatasetRunRowData["name"] = row.getValue("name");
        const id: DatasetRunRowData["id"] = row.getValue("id");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/runs/${id}`}
            value={name}
          />
        );
      },
    },
    {
      accessorKey: "id",
      header: "Id",
      id: "id",
      size: 150,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const id: DatasetRunRowData["id"] = row.getValue("id");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${props.datasetId}/runs/${id}`}
            value={id}
          />
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      id: "description",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        const description: DatasetRunRowData["description"] =
          row.getValue("description");
        return description;
      },
    },
    {
      accessorKey: "countRunItems",
      header: "Run Items",
      id: "countRunItems",
      size: 90,
      enableHiding: true,
      cell: ({ row }) => {
        const countRunItems: DatasetRunRowData["countRunItems"] =
          row.getValue("countRunItems");
        if (countRunItems === undefined || runsMetrics.isPending)
          return <Skeleton className="h-3 w-1/2" />;
        return <>{countRunItems}</>;
      },
    },
    {
      accessorKey: "avgLatency",
      header: "Latency (avg)",
      id: "avgLatency",
      size: 120,
      enableHiding: true,
      cell: ({ row }) => {
        const avgLatency: DatasetRunRowData["avgLatency"] =
          row.getValue("avgLatency");
        if (avgLatency === undefined || runsMetrics.isPending)
          return <Skeleton className="h-3 w-1/2" />;
        return <>{formatIntervalSeconds(avgLatency)}</>;
      },
    },
    {
      accessorKey: "avgTotalCost",
      header: "Trace Cost (avg)",
      id: "avgTotalCost",
      size: 130,
      enableHiding: true,
      cell: ({ row }) => {
        const avgTotalCost: DatasetRunRowData["avgTotalCost"] =
          row.getValue("avgTotalCost");
        if (!avgTotalCost || runsMetrics.isPending)
          return <Skeleton className="h-3 w-1/2" />;
        return <>{avgTotalCost}</>;
      },
    },
    {
      accessorKey: "totalCost",
      header: "Trace Cost (sum)",
      id: "totalCost",
      size: 130,
      enableHiding: true,
      cell: ({ row }) => {
        const totalCost: DatasetRunRowData["totalCost"] =
          row.getValue("totalCost");
        if (!totalCost || runsMetrics.isPending)
          return <Skeleton className="h-3 w-1/2" />;
        return <>{totalCost}</>;
      },
    },
    {
      accessorKey: "runScores",
      header: "Run-Level Scores",
      id: "runScores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isRunScoreColumnLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: runScoreColumns,
    },
    {
      accessorKey: "runItemScores",
      header: "Run Item Scores",
      id: "runItemScores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isColumnLoading ? <Skeleton className="h-3 w-1/2" /> : null;
      },
      columns: scoreColumns,
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      id: "createdAt",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: DatasetRunRowData["createdAt"] = row.getValue("createdAt");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const metadata: DatasetRunRowData["metadata"] =
          row.getValue("metadata");
        return !!metadata ? (
          <IOTableCell data={metadata} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: "Actions",
      size: 70,
      cell: ({ row }) => {
        const id: DatasetRunRowData["id"] = row.getValue("id");

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only [position:relative]">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DeleteDatasetRunButton
                projectId={props.projectId}
                datasetRunId={id}
                datasetId={props.datasetId}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: DatasetsCoreOutput & Partial<DatasetsMetricOutput>,
  ): DatasetRunRowData => {
    return {
      id: item.id,
      name: item.name,
      createdAt: item.createdAt,
      countRunItems: item.countRunItems?.toString() ?? "0",
      avgLatency: item.avgLatency ?? 0,
      avgTotalCost: item.avgTotalCost
        ? usdFormatter(item.avgTotalCost.toNumber())
        : usdFormatter(0),
      totalCost: item.totalCost
        ? usdFormatter(item.totalCost.toNumber())
        : usdFormatter(0),
      runItemScores: item.scores,
      runScores: item.runScores
        ? addPrefixToScoreKeys(item.runScores, "Run-level")
        : {},
      description: item.description ?? "",
      metadata: item.metadata,
    };
  };

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetRunRowData>(
      `datasetRunColumnVisibility-${props.projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<DatasetRunRowData>(
    `datasetRunColumnOrder-${props.projectId}`,
    columns,
  );

  // Check if we have charts to display
  const hasCharts = Boolean(props.selectedMetrics.length);

  return (
    <>
      {hasCharts ? (
        <ResizablePanelGroup
          orientation="vertical"
          className="h-full"
          onLayoutChanged={(layout) => {
            const charts = layout["dataset-charts"];
            if (charts != null) setChartsPanelSize(charts);
          }}
        >
          <ResizablePanel
            id="dataset-charts"
            defaultSize={`${chartsPanelSize}%`}
            minSize="20%"
            className="overflow-hidden"
          >
            <div className="h-full w-full overflow-x-auto overflow-y-auto p-3">
              <div className="flex h-full w-full gap-4">
                {props.selectedMetrics.map((key) => {
                  const title =
                    RESOURCE_METRICS.find((metric) => metric.key === key)
                      ?.label ?? getScoreLabelFromKey(key);

                  if (!Boolean(runAggregatedMetrics?.size)) {
                    return (
                      <div
                        key={key}
                        className="flex h-full min-w-80 max-w-full flex-col gap-2"
                      >
                        <span className="shrink-0 text-sm font-medium">
                          {title}
                        </span>
                        <NoDataOrLoading
                          isLoading={runsMetrics.isPending}
                          className="min-h-[200px]"
                        />
                      </div>
                    );
                  }

                  const adapter = new CompareViewAdapter(
                    runAggregatedMetrics,
                    key,
                  );
                  const { chartData, chartLabels } = adapter.toChartData();

                  // TODO: remove when revamping the datasets api for it to directly return ms
                  const valueFormatter =
                    key === "latency"
                      ? formatIntervalSeconds
                      : key === "cost"
                        ? usdFormatter
                        : compactNumberFormatter;

                  const dataPoints =
                    chartLabels.length === 1
                      ? chartData.map((d) => ({
                          time_dimension: d.binLabel,
                          dimension: chartLabels[0]!,
                          metric: (d[chartLabels[0]!] as number) ?? 0,
                        }))
                      : compareViewChartDataToDataPoints(
                          chartData,
                          chartLabels,
                        );
                  const chartType =
                    chartLabels.length === 1
                      ? "LINE_TIME_SERIES"
                      : "BAR_TIME_SERIES";

                  if (dataPoints.length === 0) {
                    return (
                      <div
                        key={key}
                        className="flex h-full min-w-80 max-w-full flex-col gap-2"
                      >
                        <span className="shrink-0 text-sm font-medium">
                          {title}
                        </span>
                        <NoDataOrLoading
                          isLoading={runsMetrics.isPending}
                          description="No chart data available for the selected runs."
                          className="min-h-[200px]"
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={key}
                      className="flex h-full min-w-80 max-w-full flex-col gap-2"
                    >
                      <span className="shrink-0 text-sm font-medium">
                        {title}
                      </span>
                      <div className="min-h-[200px] min-w-0 flex-1">
                        <Chart
                          chartType={chartType}
                          data={dataPoints}
                          rowLimit={Math.max(dataPoints.length, 1)}
                          chartConfig={{ type: chartType }}
                          valueFormatter={valueFormatter}
                          legendPosition={
                            chartLabels.length > 1 ? "above" : "none"
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-border" />
          <ResizablePanel
            minSize="40%"
            className="flex h-full flex-1 flex-col overflow-hidden"
          >
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
              actionButtons={[
                Object.keys(selectedRows).filter((runId) =>
                  runs.data?.runs.map((run) => run.id).includes(runId),
                ).length > 0 ? (
                  <DatasetRunTableMultiSelectAction
                    key="multi-select-action"
                    // Exclude items that are not in the current page
                    selectedRunIds={Object.keys(selectedRows).filter((runId) =>
                      runs.data?.runs.map((run) => run.id).includes(runId),
                    )}
                    projectId={props.projectId}
                    datasetId={props.datasetId}
                    setRowSelection={setSelectedRows}
                  />
                ) : null,
              ]}
            />
            <DataTable
              tableName={"datasetRuns"}
              columns={columns}
              data={
                runs.isPending
                  ? { isLoading: true, isError: false }
                  : runs.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: runs.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: (runsWithMetrics.rows ?? []).map((t) =>
                          convertToTableRow(t),
                        ),
                      }
              }
              pagination={{
                totalCount: runs.data?.totalRuns ?? null,
                onChange: setPaginationState,
                state: paginationState,
              }}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              rowHeight={rowHeight}
              rowSelection={selectedRows}
              setRowSelection={setSelectedRows}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
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
            actionButtons={[
              Object.keys(selectedRows).filter((runId) =>
                runs.data?.runs.map((run) => run.id).includes(runId),
              ).length > 0 ? (
                <DatasetRunTableMultiSelectAction
                  // Exclude items that are not in the current page
                  selectedRunIds={Object.keys(selectedRows).filter((runId) =>
                    runs.data?.runs.map((run) => run.id).includes(runId),
                  )}
                  projectId={props.projectId}
                  datasetId={props.datasetId}
                  setRowSelection={setSelectedRows}
                />
              ) : null,
            ]}
          />
          <DataTable
            tableName={"datasetRuns"}
            columns={columns}
            data={
              runs.isPending
                ? { isLoading: true, isError: false }
                : runs.isError
                  ? {
                      isLoading: false,
                      isError: true,
                      error: runs.error.message,
                    }
                  : {
                      isLoading: false,
                      isError: false,
                      data: (runsWithMetrics.rows ?? []).map((t) =>
                        convertToTableRow(t),
                      ),
                    }
            }
            pagination={{
              totalCount: runs.data?.totalRuns ?? null,
              onChange: setPaginationState,
              state: paginationState,
            }}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
            columnOrder={columnOrder}
            onColumnOrderChange={setColumnOrder}
            rowHeight={rowHeight}
            rowSelection={selectedRows}
            setRowSelection={setSelectedRows}
          />
        </>
      )}
    </>
  );
}
