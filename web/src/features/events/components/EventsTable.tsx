import { api } from "@/src/utils/api";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  getEventsColumnName,
  observationEventsFilterConfig,
} from "../config/filter-config";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type ObservationLevelType,
  type FilterState,
  BatchExportTableName,
  type ObservationType,
  TableViewPresetTableName,
  AnnotationQueueObjectType,
  BatchActionType,
  type TimeFilter,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { LevelColors } from "@/src/components/level-colors";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { type ScoreAggregate } from "@langfuse/shared";
import TagList from "@/src/features/tag/components/TagList";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BreakdownTooltip } from "@/src/components/trace/BreakdownToolTip";
import { InfoIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { Badge } from "@/src/components/ui/badge";
import { type Row, type RowSelectionState } from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { ItemBadge } from "@/src/components/ItemBadge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useRouter } from "next/router";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";

export type EventsTableRow = {
  // Identity fields
  id: string;
  traceId?: string;
  spanId: string;
  parentSpanId?: string;

  // Time fields
  startTime: Date;
  endTime?: Date;
  completionStartTime?: Date;
  timestamp?: Date;

  // Core properties
  type: ObservationType;
  name?: string;
  environment?: string;
  version?: string;
  level?: ObservationLevelType;
  statusMessage?: string;

  // User context
  userId?: string;
  sessionId?: string;

  // Model fields
  providedModelName?: string;
  modelId?: string;
  modelParameters?: string;

  // Prompt fields
  promptId?: string;
  promptName?: string;
  promptVersion?: string;

  // Usage and cost
  usage: {
    inputUsage: number;
    outputUsage: number;
    totalUsage: number;
  };
  usageDetails: Record<string, number>;
  totalCost?: number;
  cost: {
    inputCost?: number;
    outputCost?: number;
  };
  costDetails: Record<string, number>;

  // Performance metrics
  latency?: number;
  timeToFirstToken?: number;

  input?: string;
  output?: string;
  metadata?: unknown;

  // Trace fields
  traceTags?: string[];

  // Scores
  scores: ScoreAggregate;
};

export type EventsTableProps = {
  projectId: string;
};

export default function ObservationsEventsTable({
  projectId,
}: EventsTableProps) {
  const router = useRouter();
  const { viewId } = router.query;

  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  const { selectAll, setSelectAll } = useSelectAll(projectId, "observations");

  const [paginationState, setPaginationState] = useQueryParams({
    page: withDefault(NumberParam, 1),
    limit: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "observations",
    "s",
  );

  const [inputFilterState] = useQueryFilterState(
    // Default type filter - exclude SPAN and EVENT types
    !viewId
      ? [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: [
              "GENERATION",
              "AGENT",
              "TOOL",
              "CHAIN",
              "RETRIEVER",
              "EVALUATOR",
              "EMBEDDING",
              "GUARDRAIL",
            ],
          },
        ]
      : [],
    "generations", // Use "generations" table name for compatibility
    projectId,
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  const dateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
        ...(dateRange.to
          ? [
              {
                column: "startTime",
                type: "datetime",
                operator: "<=",
                value: dateRange.to,
              } as const,
            ]
          : []),
      ]
    : [];

  const oldFilterState = inputFilterState.concat(dateRangeFilter);

  const startTimeFilters = oldFilterState.filter(
    (f) =>
      (f.column === "Start Time" || f.column === "startTime") &&
      f.type === "datetime",
  ) as TimeFilter[];

  const filterOptions = api.events.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter:
        startTimeFilters.length > 0 ? startTimeFilters : undefined,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const newFilterOptions = useMemo(() => {
    const scoreCategories =
      filterOptions.data?.score_categories?.reduce(
        (acc, score) => {
          acc[score.label] = score.values;
          return acc;
        },
        {} as Record<string, string[]>,
      ) ?? undefined;

    const scoresNumeric = filterOptions.data?.scores_avg ?? undefined;

    return {
      environment: filterOptions.data?.environment ?? undefined,
      name: filterOptions.data?.name ?? undefined,
      type: filterOptions.data?.type ?? undefined,
      level: filterOptions.data?.level ?? undefined,
      providedModelName: filterOptions.data?.providedModelName ?? undefined,
      modelId: filterOptions.data?.modelId ?? undefined,
      promptName: filterOptions.data?.promptName ?? undefined,
      traceTags: filterOptions.data?.traceTags ?? undefined,
      userId: filterOptions.data?.userId ?? undefined,
      sessionId: filterOptions.data?.sessionId ?? undefined,
      version: filterOptions.data?.version ?? undefined,
      latency: [],
      timeToFirstToken: [],
      tokensPerSecond: [],
      inputTokens: [],
      outputTokens: [],
      totalTokens: [],
      inputCost: [],
      outputCost: [],
      totalCost: [],
      score_categories: scoreCategories,
      scores_avg: scoresNumeric,
    };
  }, [filterOptions.data]);

  const queryFilter = useSidebarFilterState(
    observationEventsFilterConfig,
    newFilterOptions,
    projectId,
    filterOptions.isPending,
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const filterState = queryFilter.filterState.concat(dateRangeFilter);

  const getCountPayload = {
    projectId,
    filter: filterState,
    searchQuery,
    searchType,
    page: 1,
    limit: 1,
    orderBy: null,
  };

  const getAllPayload = {
    ...getCountPayload,
    page: paginationState.page,
    limit: paginationState.limit,
    orderBy: orderByState,
  };

  const observations = api.events.all.useQuery(getAllPayload, {
    refetchOnWindowFocus: true,
  });

  const totalCountQuery = api.events.countAll.useQuery(getCountPayload, {
    refetchOnWindowFocus: true,
  });

  const totalCount = totalCountQuery.data?.totalCount ?? null;

  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "Observations added to queue",
        description: `Selected observations will be added to queue "${data.queueName}". This may take a minute.`,
        link: {
          href: `/project/${projectId}/annotation-queues/${data.queueId}`,
          text: `View queue "${data.queueName}"`,
        },
      });
    },
  });

  useEffect(() => {
    if (observations.isSuccess) {
      setDetailPageList(
        "observations",
        observations.data.observations.map((o) => ({
          id: o.id,
          params: o.traceTimestamp
            ? {
                timestamp: o.traceTimestamp.toISOString(),
                traceId: o.traceId || "",
              }
            : undefined,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations.isSuccess, observations.data]);

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<EventsTableRow>({
      scoreColumnKey: "scores",
      projectId,
      filter: scoreFilters.forObservations(),
      fromTimestamp: dateRange?.from,
    });

  const { selectActionColumn } = TableSelectionManager<EventsTableRow>({
    projectId,
    tableName: "observations",
    setSelectedRows,
  });

  const handleAddToAnnotationQueue = async ({
    projectId,
    targetId,
  }: {
    projectId: string;
    targetId: string;
  }) => {
    const selectedObservationIds = Object.keys(selectedRows).filter(
      (observationId) =>
        observations.data?.observations
          .map((o) => o.id)
          .includes(observationId),
    );

    await addToQueueMutation.mutateAsync({
      projectId,
      objectIds: selectedObservationIds,
      objectType: AnnotationQueueObjectType.OBSERVATION,
      queueId: targetId,
      isBatchAction: selectAll,
      query: {
        filter: filterState,
        orderBy: orderByState,
      },
    });
    setSelectedRows({});
  };

  const tableActions: TableAction[] = [
    {
      id: "observation-add-to-annotation-queue",
      type: BatchActionType.Create,
      label: "Add to Annotation Queue",
      description: "Add selected observations to an annotation queue.",
      targetLabel: "Annotation Queue",
      execute: handleAddToAnnotationQueue,
      accessCheck: {
        scope: "annotationQueues:CUD",
      },
    },
  ];

  const columns: LangfuseColumnDef<EventsTableRow>[] = [
    selectActionColumn,
    {
      accessorKey: "startTime",
      id: "startTime",
      header: getEventsColumnName("startTime"),
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: Date = row.getValue("startTime");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "type",
      id: "type",
      header: getEventsColumnName("type"),
      size: 50,
      enableSorting: true,
      cell: ({ row }) => {
        const value: ObservationType = row.getValue("type");
        return value ? (
          <div className="flex items-center gap-1">
            <ItemBadge type={value} />
          </div>
        ) : undefined;
      },
    },
    {
      accessorKey: "name",
      id: "name",
      header: getEventsColumnName("name"),
      size: 150,
      enableSorting: true,
      cell: ({ row }) => {
        const value: EventsTableRow["name"] = row.getValue("name");
        return value ?? undefined;
      },
    },
    {
      accessorKey: "input",
      header: getEventsColumnName("input"),
      id: "input",
      size: 300,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("input");
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
      enableHiding: true,
    },
    {
      accessorKey: "output",
      id: "output",
      header: getEventsColumnName("output"),
      size: 300,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("output");
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            className={cn("bg-accent-light-green")}
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
      enableHiding: true,
    },
    {
      accessorKey: "level",
      id: "level",
      header: getEventsColumnName("level"),
      size: 100,
      headerTooltip: {
        description:
          "You can differentiate the importance of observations with the level attribute to control the verbosity of your traces and highlight errors and warnings.",
        href: "https://langfuse.com/docs/observability/features/log-levels",
      },
      enableHiding: true,
      cell: ({ row }) => {
        const value: ObservationLevelType | undefined = row.getValue("level");
        return value ? (
          <span
            className={cn(
              "rounded-sm p-0.5 text-xs",
              LevelColors[value].bg,
              LevelColors[value].text,
            )}
          >
            {value}
          </span>
        ) : undefined;
      },
      enableSorting: true,
    },
    {
      accessorKey: "statusMessage",
      header: getEventsColumnName("statusMessage"),
      id: "statusMessage",
      size: 150,
      headerTooltip: {
        description:
          "Use a statusMessage to e.g. provide additional information on a status such as level=ERROR.",
        href: "https://langfuse.com/docs/observability/features/log-levels",
      },
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("statusMessage");
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "latency",
      id: "latency",
      header: getEventsColumnName("latency"),
      size: 100,
      cell: ({ row }) => {
        const latency: number | undefined = row.getValue("latency");
        return latency !== undefined ? (
          <span>{formatIntervalSeconds(latency)}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "totalCost",
      header: getEventsColumnName("totalCost"),
      id: "totalCost",
      size: 120,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("totalCost");

        return value !== undefined ? (
          <BreakdownTooltip details={row.original.costDetails} isCost>
            <div className="flex items-center gap-1">
              <span>{usdFormatter(value)}</span>
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "cost",
      header: "Cost",
      id: "cost",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return observations.isPending ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: [
        {
          accessorKey: "inputCost",
          id: "inputCost",
          header: getEventsColumnName("inputCost"),
          size: 120,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("cost") as {
              inputCost: number | undefined;
              outputCost: number | undefined;
            };

            return value.inputCost !== undefined ? (
              <span>{usdFormatter(value.inputCost)}</span>
            ) : undefined;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting: true,
        },
        {
          accessorKey: "outputCost",
          id: "outputCost",
          header: getEventsColumnName("outputCost"),
          size: 120,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("cost") as {
              inputCost: number | undefined;
              outputCost: number | undefined;
            };

            return value.outputCost !== undefined ? (
              <span>{usdFormatter(value.outputCost)}</span>
            ) : undefined;
          },
          enableHiding: true,
          defaultHidden: true,
          enableSorting: true,
        },
      ],
    },
    {
      accessorKey: "timeToFirstToken",
      id: "timeToFirstToken",
      header: getEventsColumnName("timeToFirstToken"),
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const timeToFirstToken: number | undefined =
          row.getValue("timeToFirstToken");

        return (
          <span>
            {timeToFirstToken ? formatIntervalSeconds(timeToFirstToken) : "-"}
          </span>
        );
      },
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return observations.isPending ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: [
        {
          accessorKey: "tokensPerSecond",
          id: "tokensPerSecond",
          header: "Tokens per second",
          size: 200,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const latency: number | undefined = row.getValue("latency");
            const usage = row.getValue("usage") as {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            };
            return latency !== undefined &&
              (usage.outputUsage !== 0 || usage.totalUsage !== 0) ? (
              <span>
                {usage.outputUsage && latency
                  ? Number((usage.outputUsage / latency).toFixed(1))
                  : undefined}
              </span>
            ) : undefined;
          },
          defaultHidden: true,
          enableHiding: true,
          enableSorting: true,
        },
        {
          accessorKey: "inputTokens",
          id: "inputTokens",
          header: getEventsColumnName("inputTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting: true,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("usage") as {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            };
            return <span>{numberFormatter(value.inputUsage, 0)}</span>;
          },
        },
        {
          accessorKey: "outputTokens",
          id: "outputTokens",
          header: getEventsColumnName("outputTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting: true,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("usage") as {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            };
            return <span>{numberFormatter(value.outputUsage, 0)}</span>;
          },
        },
        {
          accessorKey: "totalTokens",
          id: "totalTokens",
          header: getEventsColumnName("totalTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting: true,
          cell: ({ row }: { row: Row<EventsTableRow> }) => {
            const value = row.getValue("usage") as {
              inputUsage: number;
              outputUsage: number;
              totalUsage: number;
            };
            return <span>{numberFormatter(value.totalUsage, 0)}</span>;
          },
        },
      ],
    },
    {
      accessorKey: "providedModelName",
      id: "providedModelName",
      header: getEventsColumnName("providedModelName"),
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const model = row.getValue("providedModelName") as string;
        const modelId = row.getValue("modelId") as string | undefined;

        if (!model) return null;

        return modelId ? (
          <TableIdOrName value={model} />
        ) : (
          <UpsertModelFormDrawer
            action="create"
            projectId={projectId}
            prefilledModelData={{
              modelName: model,
              prices:
                Object.keys(row.original.usageDetails).length > 0
                  ? Object.keys(row.original.usageDetails)
                      .filter((key) => key != "total")
                      .reduce(
                        (acc, key) => {
                          acc[key] = 0.000001;
                          return acc;
                        },
                        {} as Record<string, number>,
                      )
                  : undefined,
            }}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-1">
              <span>{model}</span>
              <PlusCircle className="h-3 w-3" />
            </span>
          </UpsertModelFormDrawer>
        );
      },
    },
    {
      accessorKey: "promptName",
      id: "promptName",
      header: getEventsColumnName("promptName"),
      headerTooltip: {
        description: "Link to prompt version in Langfuse prompt management.",
        href: "https://langfuse.com/docs/prompt-management/get-started",
      },
      size: 200,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const promptName = row.original.promptName;
        const promptVersion = row.original.promptVersion;
        const value = `${promptName} (v${promptVersion})`;
        return promptName && promptVersion && <TableIdOrName value={value} />;
      },
    },
    {
      accessorKey: "environment",
      header: getEventsColumnName("environment"),
      id: "environment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: EventsTableRow["environment"] =
          row.getValue("environment");
        return value ? (
          <Badge
            variant="secondary"
            className="max-w-fit truncate rounded-sm px-1 font-normal"
          >
            {value}
          </Badge>
        ) : null;
      },
    },
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: getEventsColumnName("traceTags"),
      size: 250,
      enableHiding: true,
      cell: ({ row }) => {
        const traceTags: string[] | undefined = row.getValue("traceTags");
        return (
          traceTags && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={traceTags} isLoading={false} />
            </div>
          )
        );
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
      accessorKey: "endTime",
      id: "endTime",
      header: getEventsColumnName("endTime"),
      size: 150,
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: Date | undefined = row.getValue("endTime");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "traceId",
      id: "traceId",
      header: getEventsColumnName("traceId"),
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <TableIdOrName value={value} />
        ) : undefined;
      },
      enableSorting: true,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "modelId",
      id: "modelId",
      header: getEventsColumnName("modelId"),
      size: 100,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "version",
      id: "version",
      header: getEventsColumnName("version"),
      size: 100,
      headerTooltip: {
        description: "Track changes via the version tag.",
        href: "https://langfuse.com/docs/experimentation",
      },
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
    },
    {
      accessorKey: "userId",
      id: "userId",
      header: getEventsColumnName("userId"),
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "sessionId",
      id: "sessionId",
      header: getEventsColumnName("sessionId"),
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    },
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<EventsTableRow>(
      `eventsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<EventsTableRow>(
    `eventsColumnOrder-${projectId}`,
    columns,
  );

  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp", "traceId"],
    paramsToMirrorPeekValue: ["observation"],
    extractParamsValuesFromRow: (row: EventsTableRow) => ({
      traceId: row.traceId || "",
      timestamp: row.timestamp?.toISOString() || "",
    }),
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      pathParam: "traceId",
    },
  });

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Observations,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
      filterColumnDefinition: observationEventsFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  const peekConfig: DataTablePeekViewProps = useMemo(
    () => ({
      itemType: "TRACE",
      customTitlePrefix: "Observation ID:",
      detailNavigationKey: "observations",
      children: <PeekViewObservationDetail projectId={projectId} />,
      tableDataUpdatedAt: observations.dataUpdatedAt,
      ...peekNavigationProps,
    }),
    [projectId, observations.dataUpdatedAt, peekNavigationProps],
  );

  const rows: EventsTableRow[] = useMemo(() => {
    return observations.isSuccess
      ? observations.data.observations.map((observation) => {
          return {
            id: observation.id,
            traceId: observation.traceId ?? undefined,
            type: observation.type ?? undefined,
            spanId: observation.id, // span_id maps to id
            parentSpanId: observation.parentObservationId ?? undefined,
            startTime: observation.startTime,
            endTime: observation.endTime ?? undefined,
            timeToFirstToken: observation.timeToFirstToken ?? undefined,
            scores: {}, // TODO: scores not included in FullObservation type
            latency: observation.latency ?? undefined,
            totalCost: observation.totalCost ?? undefined,
            cost: {
              inputCost: observation.inputCost ?? undefined,
              outputCost: observation.outputCost ?? undefined,
            },
            name: observation.name ?? undefined,
            version: observation.version ?? "",
            providedModelName: observation.model ?? "",
            modelId: observation.internalModelId ?? undefined,
            level: observation.level,
            statusMessage: observation.statusMessage ?? undefined,
            usage: {
              inputUsage: observation.inputUsage,
              outputUsage: observation.outputUsage,
              totalUsage: observation.totalUsage,
            },
            promptId: observation.promptId ?? undefined,
            promptName: observation.promptName ?? undefined,
            promptVersion: observation.promptVersion?.toString() ?? undefined,
            traceTags: observation.traceTags ?? undefined,
            timestamp: observation.traceTimestamp ?? undefined,
            usageDetails: observation.usageDetails ?? {},
            costDetails: observation.costDetails ?? {},
            environment: observation.environment ?? undefined,
            input: observation.input
              ? typeof observation.input === "string"
                ? observation.input
                : JSON.stringify(observation.input)
              : undefined,
            output: observation.output
              ? typeof observation.output === "string"
                ? observation.output
                : JSON.stringify(observation.output)
              : undefined,
            metadata: observation.metadata,
            userId: undefined, // TODO: map from observation data
            sessionId: undefined, // TODO: map from observation data
            completionStartTime: observation.completionStartTime ?? undefined,
          };
        })
      : [];
  }, [observations]);

  return (
    <DataTableControlsProvider>
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        <DataTableToolbar
          columns={columns}
          filterState={queryFilter.filterState}
          searchConfig={{
            metadataSearchFields: ["ID", "Name", "Trace Name", "Model"],
            updateQuery: setSearchQuery,
            currentQuery: searchQuery ?? undefined,
            searchType,
            setSearchType,
            tableAllowsFullTextSearch: true,
          }}
          viewConfig={{
            tableName: TableViewPresetTableName.Observations,
            projectId,
            controllers: viewControllers,
          }}
          columnsWithCustomSelect={["providedModelName", "name", "promptName"]}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibilityState}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
          orderByState={orderByState}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          actionButtons={[
            <BatchExportTableButton
              {...{
                projectId,
                filterState,
                orderByState,
                searchQuery,
                searchType,
              }}
              tableName={BatchExportTableName.Observations}
              key="batchExport"
            />,
            Object.keys(selectedRows).filter((observationId) =>
              observations.data?.observations
                .map((o) => o.id)
                .includes(observationId),
            ).length > 0 ? (
              <TableActionMenu
                key="observations-multi-select-actions"
                projectId={projectId}
                actions={tableActions}
                tableName={BatchExportTableName.Observations}
              />
            ) : null,
          ]}
          multiSelect={{
            selectAll,
            setSelectAll,
            selectedRowIds: Object.keys(selectedRows).filter((observationId) =>
              observations.data?.observations
                .map((o) => o.id)
                .includes(observationId),
            ),
            setRowSelection: setSelectedRows,
            totalCount,
            pageSize: paginationState.limit,
            pageIndex: paginationState.page - 1,
          }}
        />

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName={"observations"}
              columns={columns}
              peekView={peekConfig}
              data={
                observations.isPending || isViewLoading
                  ? { isLoading: true, isError: false }
                  : observations.error
                    ? {
                        isLoading: false,
                        isError: true,
                        error: observations.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: rows,
                      }
              }
              pagination={{
                totalCount,
                onChange: (updater) => {
                  const newState =
                    typeof updater === "function"
                      ? updater({
                          pageIndex: paginationState.page - 1,
                          pageSize: paginationState.limit,
                        })
                      : updater;
                  setPaginationState({
                    page: newState.pageIndex + 1,
                    limit: newState.pageSize,
                  });
                },
                state: {
                  pageIndex: paginationState.page - 1,
                  pageSize: paginationState.limit,
                },
              }}
              rowSelection={selectedRows}
              setRowSelection={setSelectedRows}
              setOrderBy={setOrderByState}
              orderBy={orderByState}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibilityState}
              rowHeight={rowHeight}
              onRowClick={(row, event) => {
                // Handle Command/Ctrl+click to open observation in new tab
                if (event && (event.metaKey || event.ctrlKey)) {
                  // Prevent the default peek behavior
                  event.preventDefault();

                  // Construct the observation URL directly to avoid race conditions
                  const observationId = row.id;
                  const traceId = row.traceId;
                  const timestamp = row.timestamp;

                  if (traceId) {
                    let observationUrl = `/project/${projectId}/traces/${encodeURIComponent(traceId)}`;

                    const params = new URLSearchParams();
                    params.set("observation", observationId);
                    if (timestamp) {
                      params.set("timestamp", timestamp.toISOString());
                    }

                    observationUrl += `?${params.toString()}`;

                    const fullUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${observationUrl}`;
                    window.open(fullUrl, "_blank");
                  }
                }
                // For normal clicks, let the data-table handle opening the peek view
              }}
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
