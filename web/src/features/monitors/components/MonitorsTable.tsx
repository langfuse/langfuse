import { MoreVertical, PauseCircle, PlayCircle, SquarePen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";
import { useMediaQuery } from "react-responsive";

import { DeleteMonitorButton } from "@/src/components/deleteButton";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableControls } from "@/src/components/table/data-table-controls";
import { TableBadgeLoadingCell } from "@/src/components/table/loading-cells";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { monitorFilterConfig } from "@/src/features/filters/config/monitors-config";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useTableSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { createMonitorsSearchBarRegistry } from "@/src/features/search-bar/lib/registries";
import TagList from "@/src/features/tag/components/TagList";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { type FilterState } from "@langfuse/shared";
import {
  type ListMonitorFilter,
  ListMonitorFilterSchema,
  type Monitor,
  MonitorSeveritySchema,
  type UpdateMonitor,
} from "@langfuse/shared/monitors";

import { MonitorSeverityBadge } from "./MonitorSeverityBadge";

/** monitorsRefetchInterval keeps the list's severity and paused state current without a manual reload. */
const monitorsRefetchInterval = 5_000;

/** rowActionIconColors ramps an inline row-action icon from faint to full foreground, scaling on its own hover. */
const rowActionIconColors =
  "text-foreground/40 transition-[color,transform] group-hover/monitor-row:text-foreground/70 hover:scale-110 hover:text-foreground";

/** MonitorRow is one row of the monitors list, shaped by the `monitors.all` tRPC output. */
type MonitorRow = RouterOutputs["monitors"]["all"]["monitors"][number];

/** MonitorsOrderBy is the order-by argument accepted by the `monitors.all` tRPC query. */
type MonitorsOrderBy = RouterInputs["monitors"]["all"]["orderBy"];

/** MonitorsTable renders the project's monitors as a sortable, filterable, paginated table with row navigation to the edit page. */
export function MonitorsTable() {
  const router = useRouter();
  const projectId = useProjectIdFromURL() ?? "";
  const { setDetailPageList } = useDetailPageLists();
  const utils = api.useUtils();
  /** hasCUDAccess gates the edit, pause/resume, and delete row actions behind the monitors:CUD RBAC scope. */
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "monitors:CUD",
  });
  /** isWiderThanPhone is true at viewports wider than the main nav's drawer breakpoint (768px / Tailwind `md`), the threshold at which the Tags column appears. */
  const isWiderThanPhone = useMediaQuery({ query: "(min-width: 768px)" });

  /** statusMutation flips a monitor's status between ACTIVE and PAUSED from the row's pause/resume action. */
  const statusMutation = api.monitors.update.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.monitors.invalidate();
      showSuccessToast({
        title:
          variables.status === "PAUSED" ? "Monitor paused" : "Monitor resumed",
        description:
          variables.status === "PAUSED"
            ? "Evaluations are halted until you resume."
            : "Evaluations have resumed.",
      });
    },
    onError: (e) =>
      showErrorToast("Failed to update monitor status", e.message),
  });

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
  const searchBarRegistry = useMemo(
    () =>
      createMonitorsSearchBarRegistry(monitorFilterConfig.columnDefinitions),
    [],
  );
  const searchBarObserved = useMemo(
    () => toObservedOptions(newFilterOptions, filterOptions.isPending),
    [newFilterOptions, filterOptions.isPending],
  );
  const { store: searchBarStore, commit: searchBarCommit } = useTableSearchBar({
    projectId,
    enabled: Boolean(projectId),
    registry: searchBarRegistry,
    filterState: queryFilter.explicitFilterState,
    observed: searchBarObserved,
    setFilterState: queryFilter.setFilterState,
  });

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
      refetchInterval: monitorsRefetchInterval,
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
    {
      accessorKey: "actions",
      header: "Actions",
      id: "actions",
      enableSorting: false,
      enableResizing: false,
      size: 120,
      minSize: 120,
      maxSize: 120,
      cell: ({ row }) => (
        <MonitorRowActions
          monitor={row.original}
          projectId={projectId}
          hasCUDAccess={hasCUDAccess}
          collapsed={!isWiderThanPhone}
          isStatusPending={statusMutation.isPending}
          onToggleStatus={() =>
            statusMutation.mutate(buildStatusToggleUpdate(row.original))
          }
        />
      ),
    },
  ];

  return (
    <div className="flex h-full w-full flex-col">
      <SearchBarRow
        projectId={projectId}
        store={searchBarStore}
        commit={searchBarCommit}
        observed={searchBarObserved}
        registry={searchBarRegistry}
      />

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
              router.push(monitorHref(projectId, row.id));
            }}
            getRowClassName={() => "group/monitor-row"}
            cellPadding="comfortable"
          />
        </div>
      </ResizableFilterLayout>
    </div>
  );
}

/** MonitorRowActions renders the per-row edit, pause/resume, and delete controls, collapsing into a kebab menu on narrow viewports. */
function MonitorRowActions({
  monitor,
  projectId,
  hasCUDAccess,
  collapsed,
  isStatusPending,
  onToggleStatus,
}: {
  monitor: MonitorRow;
  projectId: string;
  hasCUDAccess: boolean;
  collapsed: boolean;
  isStatusPending: boolean;
  /** onToggleStatus flips the monitor between ACTIVE and PAUSED. */
  onToggleStatus: () => void;
}) {
  const isPaused = monitor.status === "PAUSED";

  const editButton = (
    <Button
      asChild
      variant="ghost"
      size={collapsed ? "default" : "icon"}
      disabled={!hasCUDAccess}
      aria-label="Edit monitor"
      title="Edit"
      className={cn(!collapsed && rowActionIconColors)}
    >
      <Link
        href={monitorHref(projectId, monitor.id)}
        onClick={(e) => e.stopPropagation()}
      >
        <SquarePen className="h-4 w-4" aria-hidden="true" />
        {collapsed ? <span className="ml-2">Edit</span> : null}
      </Link>
    </Button>
  );

  const pauseButton = (
    <Button
      variant="ghost"
      size={collapsed ? "default" : "icon"}
      disabled={!hasCUDAccess || isStatusPending}
      aria-label={isPaused ? "Resume monitor" : "Pause monitor"}
      title={isPaused ? "Resume" : "Pause"}
      className={cn(!collapsed && rowActionIconColors)}
      onClick={(e) => {
        e.stopPropagation();
        onToggleStatus();
      }}
    >
      {isPaused ? (
        <PlayCircle className="h-4.5 w-4.5" aria-hidden="true" />
      ) : (
        <PauseCircle className="h-4.5 w-4.5" aria-hidden="true" />
      )}
      {collapsed ? (
        <span className="ml-2">{isPaused ? "Resume" : "Pause"}</span>
      ) : null}
    </Button>
  );

  const deleteButton = (
    <DeleteMonitorButton
      itemId={monitor.id}
      projectId={projectId}
      isTableAction
      icon={!collapsed}
      variant="ghost"
      title="Delete"
      className={cn(!collapsed && rowActionIconColors)}
    />
  );

  if (collapsed) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" aria-label="Monitor actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="flex flex-col *:w-full *:justify-start">
            <DropdownMenuItem asChild>{pauseButton}</DropdownMenuItem>
            <DropdownMenuItem asChild>{editButton}</DropdownMenuItem>
            <DropdownMenuItem asChild>{deleteButton}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-0"
      onClick={(e) => e.stopPropagation()}
    >
      {pauseButton}
      {editButton}
      {deleteButton}
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

/** monitorHref is the project-scoped path to a monitor's page, the row-click and edit-action target. */
const monitorHref = (projectId: string, monitorId: string): string =>
  `/project/${projectId}/monitors/${encodeURIComponent(monitorId)}`;

/** buildStatusToggleUpdate returns a full update payload with only the status flipped between ACTIVE and PAUSED. */
const buildStatusToggleUpdate = (monitor: Monitor): UpdateMonitor => ({
  id: monitor.id,
  projectId: monitor.projectId,
  view: monitor.view,
  filters: monitor.filters,
  metric: monitor.metric,
  window: monitor.window,
  thresholdOperator: monitor.thresholdOperator,
  alertThreshold: monitor.alertThreshold,
  warningThreshold: monitor.warningThreshold,
  noData: monitor.noData,
  renotify: monitor.renotify,
  name: monitor.name,
  tags: monitor.tags,
  triggerIds: monitor.triggerIds,
  status: monitor.status === "PAUSED" ? "ACTIVE" : "PAUSED",
});

export const __test = {
  filterStateToListMonitorFilter,
  buildStatusToggleUpdate,
  monitorHref,
  monitorsRefetchInterval,
  MonitorRowActions,
};
