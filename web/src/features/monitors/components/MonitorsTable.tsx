import { MonitorSeveritySchema } from "@langfuse/shared/monitors";
import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
import { useMediaQuery } from "react-responsive";

import { DataTable } from "@/src/components/table/data-table";
import { DataTableControls } from "@/src/components/table/data-table-controls";
import { TableBadgeLoadingCell } from "@/src/components/table/loading-cells";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { cn } from "@/src/utils/tailwind";
import { monitorFilterConfig } from "@/src/features/filters/config/monitors-config";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import TagList from "@/src/features/tag/components/TagList";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { type RouterInputs, type RouterOutputs } from "@/src/utils/api";

import { MonitorSeverityBadge } from "./MonitorSeverityBadge";

type MonitorRow = RouterOutputs["monitors"]["all"]["monitors"][number];
type MonitorsOrderBy = RouterInputs["monitors"]["all"]["orderBy"];

export function MonitorsTable() {
  const router = useRouter();
  const projectId = useProjectIdFromURL() ?? "";
  const { setDetailPageList } = useDetailPageLists();
  // Hide the tags column at viewports narrower than the main nav's drawer
  // breakpoint (<768px / Tailwind `md`).
  const isWiderThanPhone = useMediaQuery({ query: "(min-width: 768px)" });

  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });

  const [orderByState, setOrderByState] = useOrderByState({
    column: "severity",
    order: "DESC",
  });

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

  const queryFilter = useSidebarFilterState(
    monitorFilterConfig,
    newFilterOptions,
    {
      loading: filterOptions.isPending,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId ?? null,
    },
  );

  const monitors = api.monitors.all.useQuery(
    {
      projectId,
      orderBy: orderByState as MonitorsOrderBy,
      filter: queryFilter.filterState,
      page: paginationState.pageIndex,
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
