import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { useEffect, useMemo, useState } from "react";
import { usdFormatter } from "../../../utils/numbers";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { type Prisma } from "@langfuse/shared";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import {
  getScoreDataTypeIcon,
  getScoreGroupColumnProps,
  verifyAndPrefixScoreDataAgainstKeys,
} from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { type ScoreAggregate } from "@langfuse/shared";
import { useIndividualScoreColumns } from "@/src/features/scores/hooks/useIndividualScoreColumns";
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
import { TimeseriesChart } from "@/src/features/scores/components/TimeseriesChart";
import { CompareViewAdapter } from "@/src/features/scores/adapters";
import { isNumericDataType } from "@/src/features/scores/lib/helpers";
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

export type DatasetRunRowData = {
  id: string;
  name: string;
  createdAt: Date;
  countRunItems: string;
  avgLatency: number | undefined;
  avgTotalCost: string | undefined;
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
            href={
              selectedRunIds.length < 2
                ? "#"
                : {
                    pathname: `/project/${projectId}/datasets/${datasetId}/compare`,
                    query: { runs: selectedRunIds },
                  }
            }
          >
            <DropdownMenuItem disabled={selectedRunIds.length < 2}>
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
          if (!mutDelete.isLoading) {
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
              loading={mutDelete.isLoading}
              disabled={mutDelete.isLoading}
              onClick={async (event) => {
                event.preventDefault();
                capture("dataset_run:delete_form_submit");
                await mutDelete.mutateAsync({
                  projectId,
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

  const runs = api.datasets.runsByDatasetId.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const runsMetrics = api.datasets.runsByDatasetIdMetrics.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

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

  const runScoresKeysAndProps =
    api.datasets.getRunLevelScoreKeysAndProps.useQuery({
      projectId: props.projectId,
      datasetId: props.datasetId,
    });

  const { scoreColumns, scoreKeysAndProps, isColumnLoading } =
    useIndividualScoreColumns<DatasetRunRowData>({
      projectId: props.projectId,
      scoreColumnKey: "runItemScores",
      showAggregateViewOnly: false,
      scoreColumnPrefix: "Aggregated",
    });

  const {
    scoreColumns: runScoreColumns,
    scoreKeysAndProps: runScoreKeysAndProps,
    isColumnLoading: isRunScoreColumnLoading,
  } = useIndividualScoreColumns<DatasetRunRowData>({
    projectId: props.projectId,
    scoreColumnKey: "runScores",
    showAggregateViewOnly: false,
    scoreColumnPrefix: "Run-level",
    scoreKeysAndPropsData: runScoresKeysAndProps.data,
  });

  const scoreIdToName = useMemo(() => {
    return new Map(scoreKeysAndProps.map((obj) => [obj.key, obj.name]) ?? []);
  }, [scoreKeysAndProps]);

  const runAggregatedMetrics = useMemo(() => {
    return transformAggregatedRunMetricsToChartData(
      runsMetrics.data?.runs ?? [],
      scoreIdToName,
    );
  }, [runsMetrics.data, scoreIdToName]);

  const { scoreAnalyticsOptions, scoreKeyToData } = useMemo(() => {
    const scoreAnalyticsOptions = scoreKeysAndProps
      ? scoreKeysAndProps.map(({ key, name, dataType, source }) => ({
          key,
          value: `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
        }))
      : [];

    return {
      scoreAnalyticsOptions,
      scoreKeyToData: new Map(
        scoreKeysAndProps.map((obj) => [obj.key, obj]) ?? [],
      ),
    };
  }, [scoreKeysAndProps]);

  useEffect(() => {
    setScoreOptions(scoreAnalyticsOptions);
  }, [scoreAnalyticsOptions, setScoreOptions]);

  const columns: LangfuseColumnDef<DatasetRunRowData>[] = [
    {
      id: "select",
      accessorKey: "select",
      size: 30,
      isPinned: true,
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
            className="mt-1 opacity-60 data-[state=checked]:mt-[5px]"
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
      accessorKey: "name",
      header: "Name",
      id: "name",
      size: 150,
      isPinned: true,
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
      accessorKey: "description",
      header: "Description",
      id: "description",
      size: 300,
      enableHiding: true,
    },
    {
      accessorKey: "countRunItems",
      header: "Run Items",
      id: "countRunItems",
      size: 90,
      enableHiding: true,
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
        if (avgLatency === undefined) return <Skeleton className="h-3 w-1/2" />;
        return <>{formatIntervalSeconds(avgLatency)}</>;
      },
    },
    {
      accessorKey: "avgTotalCost",
      header: "Total Cost (avg)",
      id: "avgTotalCost",
      size: 130,
      enableHiding: true,
      cell: ({ row }) => {
        const avgTotalCost: DatasetRunRowData["avgTotalCost"] =
          row.getValue("avgTotalCost");
        if (!avgTotalCost) return <Skeleton className="h-3 w-1/2" />;
        return <>{avgTotalCost}</>;
      },
    },
    {
      ...getScoreGroupColumnProps(isRunScoreColumnLoading, {
        accessorKey: "runScores",
        header: "Run-level Scores",
        id: "runScores",
      }),
      columns: runScoreColumns,
    },
    {
      ...getScoreGroupColumnProps(isColumnLoading, {
        accessorKey: "runItemScores",
        header: "Aggregated Run Items Scores",
        id: "runItemScores",
      }),
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
      countRunItems: item.countRunItems.toString(),
      avgLatency: item.avgLatency,
      avgTotalCost: item.avgTotalCost
        ? usdFormatter(item.avgTotalCost.toNumber())
        : undefined,
      runItemScores: item.scores
        ? verifyAndPrefixScoreDataAgainstKeys(
            scoreKeysAndProps,
            item.scores,
            "Aggregated",
          )
        : undefined,
      runScores: item.runScores
        ? verifyAndPrefixScoreDataAgainstKeys(
            runScoreKeysAndProps,
            item.runScores,
            "Run-level",
          )
        : undefined,
      description: item.description ?? "",
      metadata: item.metadata,
    };
  };

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetRunRowData>(
      `datasetRunsColumnVisibility-${props.projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<DatasetRunRowData>(
    "datasetRunsColumnOrder",
    columns,
  );

  // Check if we have charts to display
  const hasCharts =
    Boolean(props.selectedMetrics.length) &&
    Boolean(runAggregatedMetrics?.size);

  return (
    <>
      {hasCharts ? (
        <ResizablePanelGroup
          direction="vertical"
          className="h-full"
          onLayout={(sizes) => {
            setChartsPanelSize(sizes[0]);
          }}
        >
          <ResizablePanel
            defaultSize={chartsPanelSize}
            minSize={20}
            className="overflow-hidden"
          >
            <div className="h-full w-full overflow-x-auto overflow-y-auto p-3">
              <div className="flex h-full w-full gap-4">
                {props.selectedMetrics.map((key) => {
                  const adapter = new CompareViewAdapter(
                    runAggregatedMetrics,
                    key,
                  );
                  const { chartData, chartLabels } = adapter.toChartData();

                  const scoreData = scoreKeyToData.get(key);
                  if (!scoreData)
                    return (
                      <div key={key} className="h-full min-w-80 max-w-full">
                        <TimeseriesChart
                          chartData={chartData}
                          chartLabels={chartLabels}
                          title={
                            RESOURCE_METRICS.find(
                              (metric) => metric.key === key,
                            )?.label ?? key
                          }
                          type="numeric"
                          maxFractionDigits={
                            RESOURCE_METRICS.find(
                              (metric) => metric.key === key,
                            )?.maxFractionDigits
                          }
                        />
                      </div>
                    );

                  return (
                    <div key={key} className="h-full min-w-80 max-w-full">
                      <TimeseriesChart
                        chartData={chartData}
                        chartLabels={chartLabels}
                        title={`${getScoreDataTypeIcon(scoreData.dataType)} ${scoreData.name} (${scoreData.source.toLowerCase()})`}
                        type={
                          isNumericDataType(scoreData.dataType)
                            ? "numeric"
                            : "categorical"
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-border" />
          <ResizablePanel
            minSize={40}
            className="flex h-full flex-1 flex-col overflow-hidden"
          >
            <DataTableToolbar
              columns={columns}
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
              columns={columns}
              data={
                runs.isLoading
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
            columns={columns}
            data={
              runs.isLoading
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
