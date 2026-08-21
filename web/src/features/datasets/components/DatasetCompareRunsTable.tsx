import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { FilteredRunPills } from "@/src/components/table/filtered-run-pills";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { getDatasetRunAggregateColumnProps } from "@/src/features/datasets/components/DatasetRunAggregateColumnHelpers";
import {
  type ObservationByIdsItem,
  type TraceByIdsItem,
} from "@/src/features/datasets/components/DatasetAggregateTableCell";
import { useDatasetRunAggregateColumns } from "@/src/features/datasets/hooks/useDatasetRunAggregateColumns";
import { useState, useEffect, useMemo } from "react";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { LayoutList } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import {
  DatasetCompareFieldsProvider,
  useDatasetCompareFields,
} from "@/src/features/datasets/contexts/DatasetCompareFieldsContext";
import { useColumnFilterState } from "@/src/features/filters/hooks/useColumnFilterState";
import { type Prisma } from "@langfuse/shared";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";

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
}) {
  const { toggleField, isFieldSelected } = useDatasetCompareFields();
  const [isFieldsDropdownOpen, setIsFieldsDropdownOpen] = useState(false);
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

  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const activeRunFilters = convertToColumnFilterList();
  const hasActiveRunFilters = activeRunFilters.length > 0;

  const datasetItemsWithRunData = api.datasets.datasetItemsWithRunData.useQuery(
    {
      projectId: props.projectId,
      datasetId: props.datasetId,
      runIds: props.runIds,
      filterByRun: activeRunFilters,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
  );

  const itemsData = datasetItemsWithRunData.data?.data;

  // The grid is rows (dataset items) x columns (selected runs). Each cell
  // needs the trace or observation for its (item, run) pair. Rather than let
  // every cell query independently (one HTTP request per cell — up to
  // 50 rows x N runs on a single page load), collect every id the currently
  // rendered page needs and batch-fetch them in exactly one request per kind.
  const { traceIds, observationIds, fromTimestamp } = useMemo(() => {
    const traceIdSet = new Set<string>();
    const observationIdSet = new Set<string>();
    let minCreatedAt: Date | undefined;

    (itemsData ?? []).forEach((item) => {
      Object.values(item.runData ?? {}).forEach((value) => {
        if (value.observation === undefined) {
          traceIdSet.add(value.trace.id);
        } else {
          observationIdSet.add(value.observation.id);
        }
        if (!minCreatedAt || value.createdAt < minCreatedAt) {
          minCreatedAt = value.createdAt;
        }
      });
    });

    return {
      traceIds: Array.from(traceIdSet),
      observationIds: Array.from(observationIdSet),
      // Subtract 1 day from the earliest run item creation timestamp as a
      // buffer in case a trace happened before the run (mirrors the per-cell
      // buffer this batched fetch replaces).
      fromTimestamp: minCreatedAt
        ? new Date(minCreatedAt.getTime() - 24 * 60 * 60 * 1000)
        : undefined,
    };
  }, [itemsData]);

  const tracesByIdsQuery = api.traces.byIds.useQuery(
    { projectId: props.projectId, traceIds, fromTimestamp },
    {
      enabled: traceIds.length > 0,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      staleTime: Infinity,
    },
  );

  const observationsByIdsQuery = api.observations.byIds.useQuery(
    { projectId: props.projectId, observationIds },
    {
      enabled: observationIds.length > 0,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      staleTime: Infinity,
    },
  );

  const tracesById = useMemo(() => {
    const map = new Map<string, TraceByIdsItem>();
    tracesByIdsQuery.data?.forEach((trace) => map.set(trace.id, trace));
    return map;
  }, [tracesByIdsQuery.data]);

  const observationsById = useMemo(() => {
    const map = new Map<string, ObservationByIdsItem>();
    observationsByIdsQuery.data?.forEach((observation) =>
      map.set(observation.id, observation),
    );
    return map;
  }, [observationsByIdsQuery.data]);

  // Only "loading" while a batch this page actually needs is in flight; a
  // page with no observation cells, for example, should not wait on the
  // (disabled) observations query.
  const isTracesLoading = traceIds.length > 0 && tracesByIdsQuery.isPending;
  const isObservationsLoading =
    observationIds.length > 0 && observationsByIdsQuery.isPending;

  const totalCountQuery = api.datasets.runItemCompareCount.useQuery({
    projectId: props.projectId,
    datasetId: props.datasetId,
    runIds: props.runIds,
    filterByRun: activeRunFilters,
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

  const { closePeek, expandPeek } = usePeekNavigation({
    // traceId: not written here, but cleared (and preferred by the trace
    // reader) so a stray param cannot pin the peek to a foreign trace
    // (LFE-11041).
    queryParams: ["observation", "display", "timestamp", "traceId"],
    expandConfig: {
      basePath: `/project/${props.projectId}/traces`,
    },
  });

  const peekConfig = useMemo(
    () => ({
      itemType: "TRACE" as const,
      closePeek,
      expandPeek,
      // openPeek is handled by DatasetAggregateTableCell's custom handleOpenPeek
    }),
    [closePeek, expandPeek],
  );

  const { runAggregateColumns, isLoading: cellsLoading } =
    useDatasetRunAggregateColumns({
      projectId: props.projectId,
      runIds: props.runIds,
      datasetId: props.datasetId,
      updateRunFilters,
      getFiltersForRun,
      tracesById,
      observationsById,
      isTracesLoading,
      isObservationsLoading,
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
      ...getDatasetRunAggregateColumnProps(cellsLoading),
      columns: runAggregateColumns,
    },
  ];

  const rows =
    itemsData?.map((item) => ({
      ...item,
      runs: item.runData,
    })) ?? [];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetCompareRunRowData>(
      "datasetCompareRunsColumnVisibility",
      columns,
    );

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={
          <DropdownMenu open={isFieldsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                onClick={() => setIsFieldsDropdownOpen(!isFieldsDropdownOpen)}
              >
                <LayoutList className="mr-2 h-4 w-4" />
                <span>Fields</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onPointerDownOutside={() => setIsFieldsDropdownOpen(false)}
            >
              <DropdownMenuCheckboxItem
                checked={isFieldSelected("output")}
                onCheckedChange={() => toggleField("output")}
              >
                Output
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={isFieldSelected("scores")}
                onCheckedChange={() => toggleField("scores")}
              >
                Scores
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={isFieldSelected("resourceMetrics")}
                onCheckedChange={() => toggleField("resourceMetrics")}
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
        filteredRuns={activeRunFilters}
        className="px-2 pb-2"
      />
      <DataTable
        tableName="datasetCompareRuns"
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
        noResultsMessage={
          hasActiveRunFilters ? (
            <div className="text-muted-foreground flex flex-col items-center gap-1 text-sm">
              <span>No dataset run items match the current filters.</span>
              <span className="text-xs">
                Adjust or clear filters to compare items again.
              </span>
            </div>
          ) : undefined
        }
        peekView={peekConfig}
      />
      <TablePeekViewTraceDetail {...peekConfig} projectId={props.projectId} />
    </>
  );
}

export function DatasetCompareRunsTable(props: {
  projectId: string;
  datasetId: string;
  runIds: string[];
}) {
  return (
    <DatasetCompareFieldsProvider>
      <DatasetCompareRunsTableInternal {...props} />
    </DatasetCompareFieldsProvider>
  );
}
