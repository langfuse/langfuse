import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
import { useMediaQuery } from "react-responsive";

import { DataTable } from "@/src/components/table/data-table";
import { DataTableControls } from "@/src/components/table/data-table-controls";
import { TableBadgeLoadingCell } from "@/src/components/table/loading-cells";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { monitorFilterConfig } from "@/src/features/filters/config/monitors-config";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import TagList from "@/src/features/tag/components/TagList";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { type FilterState } from "@langfuse/shared";
import {
  type ListMonitorFilter,
  ListMonitorFilterSchema,
  MonitorSeveritySchema,
} from "@langfuse/shared/monitors";

import { MonitorSeverityBadge } from "./MonitorSeverityBadge";

/** MonitorRow is one row of the monitors list, shaped by the `monitors.all` tRPC output. */
type MonitorRow = RouterOutputs["monitors"]["all"]["monitors"][number];

/** MonitorsOrderBy is the order-by argument accepted by the `monitors.all` tRPC query. */
type MonitorsOrderBy = RouterInputs["monitors"]["all"]["orderBy"];

/** MonitorsTable renders the project's monitors as a sortable, filterable, paginated table with row navigation to the edit page. */
export function MonitorsTable() {
  const router = useRouter();
  const projectId = useProjectIdFromURL() ?? "";
  const { setDetailPageList } = useDetailPageLists();
  /** isWiderThanPhone is true at viewports wider than the main nav's drawer breakpoint (768px / Tailwind `md`), the threshold at which the Tags column appears. */
  const isWiderThanPhone = useMediaQuery({ query: "(min-width: 768px)" });

  /** paginationState is the bound page index + size, defaulting to 50 per page and synced to the `pageIndex`/`pageSize` URL params. */
  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });

  /** orderByState is the bound table sort, defaulting to severity descending. */
  const [orderByState, setOrderByState] = useOrderByState({
    column: "severity",
    order: "DESC",
  });

  /** filterOptions loads the project's sidebar filter dictionary (severity values, tag list). */
  const filterOptions = api.monitors.getFilterOptions.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  /** newFilterOptions reshapes filterOptions into the {value, displayValue} rows the sidebar expects, hiding UNKNOWN so the user sees a single "NO DATA" choice. */
  const newFilterOptions = useMemo(
    () => ({
      severity: MonitorSeveritySchema.options
        // Hide UNKNOWN; it's merged with NO_DATA at the backend so the user
        // sees a single "NO DATA" checkbox.
        .filter((value) => value !== "UNKNOWN")
        .toReversed()
        .map((value) => ({
          value,
          displayValue: value.replace(/_/g, " "),
        })),
      tags: filterOptions.data?.tags.map((t) => ({ value: t.value })) ?? [],
    }),
    [filterOptions.data],
  );

  /** queryFilter is the bound sidebar filter state, synced to the URL and to session storage per project. */
  const queryFilter = useSidebarFilterState(
    monitorFilterConfig,
    newFilterOptions,
    {
      loading: filterOptions.isPending,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId ?? null,
    },
  );

  const monitorFilter = useMemo(
    () => filterStateToListMonitorFilter(queryFilter.filterState),
    [queryFilter.filterState],
  );

  /** monitors loads the paginated, filtered, sorted page of monitors from the server. */
  const monitors = api.monitors.all.useQuery(
    {
      projectId,
      orderBy: orderByState as MonitorsOrderBy,
      filter: monitorFilter,
      page: paginationState.pageIndex + 1,
      limit: paginationState.pageSize,
    },
    {
      enabled: Boolean(projectId),
      trpc: { context: { skipBatch: true } },
    },
  );

  useEffect(() => {
    if (monitors.isSuccess) {
      setDetailPageList(
        "monitors",
        monitors.data.monitors.map((m) => ({ id: m.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitors.isSuccess, monitors.data]);

  /** columns is the DataTable column schema, conditionally including Tags on viewports wider than a phone. */
  const columns: LangfuseColumnDef<MonitorRow>[] = [
    {
      accessorKey: "severity",
      header: "Severity",
      id: "severity",
      enableSorting: true,
      enableResizing: false,
      size: 100,
      minSize: 100,
      maxSize: 100,
      loadingCell: <TableBadgeLoadingCell className="h-6 w-20" />,
      cell: ({ row }) => (
        <MonitorSeverityBadge severity={row.original.severity} />
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      enableSorting: true,
      enableResizing: false,
      isFlexWidth: true,
      cell: ({ row }) => (
        <span
          className={cn(
            "text-sm font-medium",
            row.original.severity === "PAUSED" && "opacity-50",
          )}
        >
          {row.original.name}
        </span>
      ),
    },
    ...(isWiderThanPhone
      ? [
          {
            accessorKey: "tags",
            header: "Tags",
            id: "tags",
            enableSorting: false,
            enableResizing: false,
            size: 250,
            minSize: 250,
            maxSize: 250,
            cell: ({ row }) => (
              <div
                className={cn(
                  "flex flex-wrap gap-1",
                  row.original.severity === "PAUSED" && "opacity-50",
                )}
              >
                <TagList
                  selectedTags={row.original.tags ?? []}
                  isLoading={false}
                  viewOnly
                  isTableCell
                />
              </div>
            ),
          } satisfies LangfuseColumnDef<MonitorRow>,
        ]
      : []),
  ];

  return (
    <div className="flex h-full w-full flex-col">
      <ResizableFilterLayout>
        <DataTableControls queryFilter={queryFilter} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <DataTable
            tableName="monitors"
            columns={columns}
            data={
              monitors.isLoading
                ? { isLoading: true, isError: false }
                : monitors.isError
                  ? {
                      isLoading: false,
                      isError: true,
                      error: monitors.error.message,
                    }
                  : {
                      isLoading: false,
                      isError: false,
                      data: monitors.data?.monitors ?? [],
                    }
            }
            orderBy={orderByState}
            setOrderBy={setOrderByState}
            pagination={{
              totalCount: monitors.data?.totalCount ?? null,
              onChange: setPaginationState,
              state: paginationState,
            }}
            onRowClick={(row) => {
              router.push(
                `/project/${projectId}/monitors/${encodeURIComponent(row.id)}/edit`,
              );
            }}
            cellPadding="comfortable"
          />
        </div>
      </ResizableFilterLayout>
    </div>
  );
}

/** filterStateToListMonitorFilter expands NO_DATA to (NO_DATA, UNKNOWN) on the severity column. */
const filterStateToListMonitorFilter = (
  state: FilterState,
): ListMonitorFilter => {
  const parsed = ListMonitorFilterSchema.safeParse(state);
  if (!parsed.success) return [];
  return parsed.data.map((row) => {
    if (
      row.column === "severity" &&
      row.value.includes("NO_DATA") &&
      !row.value.includes("UNKNOWN")
    ) {
      return { ...row, value: [...row.value, "UNKNOWN"] };
    }
    return row;
  });
};

export const __test = { filterStateToListMonitorFilter };
