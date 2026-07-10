import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useDashboardFilterOptions } from "@/src/hooks/useDashboardFilterOptions";
import Page from "@/src/components/layouts/page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { TimeRangePicker } from "@/src/components/date-picker";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useEffect, useState, useMemo, useCallback } from "react";
import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { PlusIcon, Copy } from "lucide-react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  SelectWidgetDialog,
  type WidgetItem,
} from "@/src/features/widgets/components/SelectWidgetDialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { v4 as uuidv4 } from "uuid";
import { useDebounce } from "@/src/hooks/useDebounce";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  DashboardGrid,
  type DashboardPlacement,
} from "@/src/features/widgets/components/DashboardGrid";
import { CloneFirstDialog } from "@/src/features/dashboard/components/CloneFirstDialog";
import { InlineEditText } from "@/src/components/design-system/InlineEditText/InlineEditText";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { EditDashboardDialog } from "@/src/features/dashboard/components/EditDashboardDialog";
import {
  LANGFUSE_HOME_DASHBOARD_ID,
  type HomeDashboardPresetId,
} from "@langfuse/shared";
import { HomeIcon, Loader2, MoreVertical, PencilIcon } from "lucide-react";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { useEnvironmentFilterOptionsCache } from "@/src/hooks/use-environment-filter-options-cache";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import {
  convertSelectedEnvironmentsToFilter,
  useEnvironmentFilter,
} from "@/src/hooks/useEnvironmentFilter";
import {
  DashboardQuerySchedulerProvider,
  getDashboardQuerySchedulerMaxConcurrent,
  useDashboardQueryScheduler,
} from "@/src/hooks/useDashboardQueryScheduler";
import {
  toWidgetCreateFields,
  type WidgetExportSource,
} from "@/src/features/widgets/utils/import-export-utils";

// Position for a tile inserted "next to" an anchor tile: same size,
// immediately to the right when that fits the 12-column grid, otherwise
// directly below the anchor. Collisions are resolved by the grid layout.
function placementNextTo(anchor: DashboardPlacement) {
  const fitsRight = anchor.x + anchor.x_size * 2 <= 12;
  return {
    x: fitsRight ? anchor.x + anchor.x_size : anchor.x,
    y: fitsRight ? anchor.y : anchor.y + anchor.y_size,
    x_size: anchor.x_size,
    y_size: anchor.y_size,
  };
}

export default function DashboardDetail() {
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

  const { projectId, dashboardId, addWidgetId } = router.query as {
    projectId: string;
    dashboardId: string;
    addWidgetId?: string;
  };

  const lookbackLimit = useEntitlementLimit("data-access-days");
  const { isBetaEnabled } = useV4Beta();

  // Fetch dashboard data
  const dashboard = api.dashboard.getDashboard.useQuery({
    projectId,
    dashboardId,
  });

  const hasRbacCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
  const isLockedDashboard = dashboard.data?.owner === "LANGFUSE";
  const hasCUDAccess = hasRbacCUDAccess && !isLockedDashboard;

  // Langfuse-managed dashboards keep full edit affordances; edit attempts
  // route through the clone-first flow instead of mutating.
  const isLockedEditable = hasRbacCUDAccess && isLockedDashboard;

  // Access for cloning (independent of dashboard owner)
  const hasCloneAccess = hasRbacCUDAccess && isLockedDashboard;

  // Clone-first dialog state: open + the attempted change (if any) to carry
  // into the clone. gridResetKey remounts the grid to revert an attempted
  // drag/resize when the user cancels.
  const [cloneFirstState, setCloneFirstState] = useState<{
    open: boolean;
    pendingDefinition: { widgets: DashboardPlacement[] } | null;
  }>({ open: false, pendingDefinition: null });
  const [gridResetKey, setGridResetKey] = useState(0);

  const openCloneFirst = useCallback(
    (
      attempt:
        | "layout_change"
        | "delete_widget"
        | "add_widget"
        | "widget_pencil",
      pendingDefinition?: { widgets: DashboardPlacement[] },
    ) => {
      capture("dashboard:locked_edit_attempt", {
        dashboard_id: dashboardId,
        attempt,
        surface: "detail",
      });
      setCloneFirstState({
        open: true,
        pendingDefinition: pendingDefinition ?? null,
      });
    },
    [capture, dashboardId],
  );

  // Filter state - use persistent filters from dashboard
  const [savedFilters, setSavedFilters] = useState<FilterState>([]);
  const [currentFilters, setCurrentFilters] = useState<FilterState>([]);

  // Date range state - use the hook for all date range logic
  const { timeRange, setTimeRange } = useDashboardDateRange();
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange) ?? undefined,
    [timeRange],
  );

  // Check if current filters differ from saved filters
  const hasUnsavedFilterChanges = useMemo(() => {
    return JSON.stringify(currentFilters) !== JSON.stringify(savedFilters);
  }, [currentFilters, savedFilters]);

  // State for handling widget deletion and addition
  const [localDashboardDefinition, setLocalDashboardDefinition] = useState<{
    widgets: DashboardPlacement[];
  } | null>(null);

  // State for the widget selection dialog
  const [isWidgetDialogOpen, setIsWidgetDialogOpen] = useState(false);

  // Mutation for updating dashboard definition
  const updateDashboardDefinition =
    api.dashboard.updateDashboardDefinition.useMutation({
      // Saves are silent; the header shows a spinner while in flight.
      onSuccess: () => {
        // Invalidate the dashboard query to refetch the data
        dashboard.refetch();
      },
      onError: (error) => {
        showErrorToast("Error updating dashboard", error.message);
      },
    });

  // Which dashboard is shown on this project's Home (for the "Use as Home" action)
  const homePointer = api.dashboard.getHomeDashboard.useQuery(
    { projectId },
    { enabled: Boolean(projectId), retry: false },
  );
  const isCurrentHome =
    (homePointer.data?.homeDashboardId ?? LANGFUSE_HOME_DASHBOARD_ID) ===
    dashboardId;

  const setHomeDashboard = api.dashboard.setHomeDashboard.useMutation({
    onSuccess: () => {
      utils.dashboard.getHomeDashboard.invalidate();
    },
    onError: (error) => {
      showErrorToast("Failed to update home dashboard", error.message);
    },
  });

  // Dialog for editing name + description from the ... menu
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Mutation for renaming the dashboard inline from the page header
  const updateDashboardMetadata =
    api.dashboard.updateDashboardMetadata.useMutation({
      onSuccess: () => {
        utils.dashboard.invalidate();
      },
      onError: (error) => {
        showErrorToast("Error renaming dashboard", error.message);
      },
    });

  // Mutation for updating dashboard filters
  const updateDashboardFilters =
    api.dashboard.updateDashboardFilters.useMutation({
      onSuccess: () => {
        // Update saved state to match current state
        setSavedFilters(currentFilters);
      },
      onError: (error) => {
        showErrorToast("Error saving filters", error.message);
      },
    });

  const saveDashboardChanges = useDebounce(
    (definition: { widgets: DashboardPlacement[] }) => {
      if (!hasCUDAccess) return;
      updateDashboardDefinition.mutate({
        projectId,
        dashboardId,
        definition,
      });
    },
    600,
    false,
  );

  // Function to save current filters
  const handleSaveFilters = () => {
    if (!hasCUDAccess) return;

    updateDashboardFilters.mutate({
      projectId,
      dashboardId,
      filters: currentFilters,
    });
  };

  // Helper function to add a widget placement to the dashboard. Defaults to a
  // 6x6 tile below all existing widgets; callers can pass an explicit position
  // (e.g. "paste to the right" of an anchor tile).
  const insertWidgetPlacement = useCallback(
    (
      widgetId: string,
      position?: { x: number; y: number; x_size: number; y_size: number },
    ) => {
      if (!localDashboardDefinition) return;

      // Find the maximum y position to place the new widget at the bottom
      const maxY =
        localDashboardDefinition.widgets.length > 0
          ? Math.max(
              ...localDashboardDefinition.widgets.map((w) => w.y + w.y_size),
            )
          : 0;

      // Create a new widget placement
      const newWidgetPlacement: DashboardPlacement = {
        id: uuidv4(),
        widgetId,
        type: "widget",
        x: position?.x ?? 0, // Default: start at left
        y: position?.y ?? maxY, // Default: place below existing widgets
        x_size: position?.x_size ?? 6, // Default size (half of 12-column grid)
        y_size: position?.y_size ?? 6, // Default height of 6 rows
      };

      // Add the widget to the local dashboard definition
      const updatedDefinition = {
        ...localDashboardDefinition,
        widgets: [...localDashboardDefinition.widgets, newWidgetPlacement],
      };
      setLocalDashboardDefinition(updatedDefinition);
      saveDashboardChanges(updatedDefinition);

      // The new widget may land outside the viewport — bring it into view.
      setTimeout(() => {
        document
          .querySelector(`[data-placement-id="${newWidgetPlacement.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    },
    [
      localDashboardDefinition,
      setLocalDashboardDefinition,
      saveDashboardChanges,
    ],
  );

  const addWidgetToDashboard = useCallback(
    (widget: WidgetItem) => insertWidgetPlacement(widget.id),
    [insertWidgetPlacement],
  );

  const { mutateAsync: createWidgetAsync } =
    api.dashboardWidgets.create.useMutation();

  // Duplicate a tile's widget: create an independent widget row seeded from
  // the source configuration, placed next to the source tile.
  const handleDuplicateWidget = useCallback(
    async (anchor: DashboardPlacement, widget: WidgetExportSource) => {
      try {
        const result = await createWidgetAsync({
          projectId,
          ...toWidgetCreateFields(widget),
          name: `${widget.name} (Copy)`,
        });
        capture("dashboard:widget_duplicated", {
          surface: "grid_menu",
          dashboard_id: dashboardId,
          chart_type: widget.chartType,
          view: widget.view,
        });
        insertWidgetPlacement(result.widget.id, placementNextTo(anchor));
      } catch (e) {
        showErrorToast(
          "Failed to duplicate widget",
          e instanceof Error ? e.message : "Unknown error",
        );
      }
    },
    [createWidgetAsync, projectId, dashboardId, capture, insertWidgetPlacement],
  );

  // Add a Langfuse Home card as a preset placement (no widget row involved)
  const addPresetToDashboard = useCallback(
    (presetId: HomeDashboardPresetId) => {
      if (!localDashboardDefinition) return;

      const maxY =
        localDashboardDefinition.widgets.length > 0
          ? Math.max(
              ...localDashboardDefinition.widgets.map((w) => w.y + w.y_size),
            )
          : 0;

      const newPresetPlacement: DashboardPlacement = {
        id: uuidv4(),
        presetId,
        type: "preset",
        x: 0,
        y: maxY,
        x_size: 6,
        y_size: 6,
      };

      const updatedDefinition = {
        ...localDashboardDefinition,
        widgets: [...localDashboardDefinition.widgets, newPresetPlacement],
      };
      setLocalDashboardDefinition(updatedDefinition);
      saveDashboardChanges(updatedDefinition);

      setTimeout(() => {
        document
          .querySelector(`[data-placement-id="${newPresetPlacement.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    },
    [localDashboardDefinition, saveDashboardChanges],
  );

  const { nameOptions, tagsOptions } = useDashboardFilterOptions({
    projectId,
    isBetaEnabled,
    timeRange,
  });

  const environmentOptionsState = useEnvironmentFilterOptionsCache({
    projectId,
    timeRange,
  });
  const environmentOptions = environmentOptionsState.environmentOptions.map(
    (value) => ({
      value,
    }),
  );

  // Dedicated environment selector, same as Home. The selection is a view
  // setting (persisted per project for this user), merged into the widget
  // filters but never written into the dashboard's saved filters.
  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptionsState.environmentOptions, projectId);
  const environmentFilter = useMemo(
    () =>
      convertSelectedEnvironmentsToFilter(
        ["environment"],
        selectedEnvironments,
      ),
    [selectedEnvironments],
  );
  const gridFilterState: FilterState = useMemo(
    () => [...currentFilters, ...environmentFilter],
    [currentFilters, environmentFilter],
  );
  // Filter columns for PopoverFilterBuilder
  const filterColumns: ColumnDefinition[] = [
    {
      name: "Environment",
      id: "environment",
      type: "stringOptions",
      options: environmentOptions,
      internal: "internalValue",
    },
    {
      name: "Trace Name",
      id: "traceName",
      type: "stringOptions",
      options: nameOptions,
      internal: "internalValue",
    },
    {
      name: "Observation Name",
      id: "observationName",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Score Name",
      id: "scoreName",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Tags",
      id: "tags",
      type: "arrayOptions",
      options: tagsOptions,
      internal: "internalValue",
    },
    {
      name: "User",
      id: "user",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Session",
      id: "session",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Metadata",
      id: "metadata",
      type: "stringObject",
      internal: "internalValue",
    },
    {
      name: "Release",
      id: "release",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Version",
      id: "version",
      type: "string",
      internal: "internalValue",
    },
  ];

  // Fetch widget data if addWidgetId is present
  const widgetToAdd = api.dashboardWidgets.get.useQuery(
    { projectId, widgetId: addWidgetId || "" },
    {
      enabled: Boolean(projectId) && Boolean(addWidgetId),
    },
  );

  useEffect(() => {
    if (dashboard.data && !localDashboardDefinition) {
      setLocalDashboardDefinition(dashboard.data.definition);
    }
  }, [dashboard.data, localDashboardDefinition]);

  // Initialize filters from dashboard data
  useEffect(() => {
    if (dashboard.data?.filters) {
      setSavedFilters(dashboard.data.filters);
      setCurrentFilters(dashboard.data.filters);
    }
  }, [dashboard.data?.filters]);

  useEffect(() => {
    if (localDashboardDefinition && widgetToAdd.data && addWidgetId) {
      if (
        !localDashboardDefinition.widgets.some(
          (w) => w.type === "widget" && w.widgetId === addWidgetId,
        )
      ) {
        addWidgetToDashboard(widgetToAdd.data);
      }
      // Remove the addWidgetId query parameter
      router.replace({
        pathname: router.pathname,
        query: { projectId, dashboardId },
      });
    }
  }, [
    widgetToAdd.data,
    addWidgetId,
    addWidgetToDashboard,
    localDashboardDefinition,
    projectId,
    dashboardId,
    router,
  ]);

  // Handle deleting a widget
  const handleDeleteWidget = (tileId: string) => {
    if (localDashboardDefinition) {
      const updatedWidgets = localDashboardDefinition.widgets.filter(
        (widget) => widget.id !== tileId,
      );

      const updatedDefinition = {
        ...localDashboardDefinition,
        widgets: updatedWidgets,
      };

      if (isLockedEditable) {
        // Carry the removal into the clone instead of mutating.
        openCloneFirst("delete_widget", updatedDefinition);
        return;
      }

      setLocalDashboardDefinition(updatedDefinition);
      saveDashboardChanges(updatedDefinition);
    }
  };

  // Handle adding a widget
  const handleAddWidget = () => {
    if (isLockedEditable) {
      openCloneFirst("add_widget");
      return;
    }
    setIsWidgetDialogOpen(true);
  };

  // Handle widget selection from dialog
  const handleSelectWidget = (widget: WidgetItem) => {
    addWidgetToDashboard(widget);
  };

  const mutateCloneDashboard = api.dashboard.cloneDashboard.useMutation({
    onSuccess: (data) => {
      utils.dashboard.invalidate();
      capture("dashboard:clone_dashboard", { source: "detail_clone_button" });
      // Redirect to new dashboard
      if (data?.id) {
        router.replace(
          `/project/${projectId}/dashboards/${encodeURIComponent(data.id)}`,
        );
      }
    },
    onError: (e) => {
      showErrorToast("Failed to clone dashboard", e.message);
    },
  });

  const handleCloneDashboard = () => {
    if (!projectId || !dashboardId) return;
    mutateCloneDashboard.mutate({ projectId, dashboardId });
  };

  const dashboardTimeRangePresets = DASHBOARD_AGGREGATION_OPTIONS;
  const widgetSchedulerPrefix = `dashboard:${projectId}:${dashboardId}:widget:`;
  const widgetPlacements = useMemo(
    () => localDashboardDefinition?.widgets ?? [],
    [localDashboardDefinition?.widgets],
  );

  const getWidgetSchedulerId = useCallback(
    (widgetPlacementId: string) =>
      `${widgetSchedulerPrefix}${widgetPlacementId}`,
    [widgetSchedulerPrefix],
  );

  const schedulerResetKey = useMemo(() => {
    return [
      projectId,
      dashboardId,
      absoluteTimeRange?.from?.toISOString() ?? "",
      absoluteTimeRange?.to?.toISOString() ?? "",
      JSON.stringify(currentFilters),
      selectedEnvironments.join(","),
      widgetPlacements.map((widget) => widget.id).join(","),
    ].join("|");
  }, [
    absoluteTimeRange?.from,
    absoluteTimeRange?.to,
    currentFilters,
    dashboardId,
    projectId,
    selectedEnvironments,
    widgetPlacements,
  ]);

  const scheduler = useDashboardQueryScheduler({
    maxConcurrent: getDashboardQuerySchedulerMaxConcurrent(timeRange),
    resetKey: schedulerResetKey,
  });

  return (
    <DashboardQuerySchedulerProvider
      scheduler={scheduler}
      shouldBucketQueriesByTimeRange={!("from" in timeRange)}
    >
      <Page
        withPadding
        scrollable
        headerProps={{
          title:
            (dashboard.data?.name || "Dashboard") +
            (dashboard.data?.owner === "LANGFUSE"
              ? " (Langfuse Maintained)"
              : ""),
          titleContent:
            hasCUDAccess && dashboard.data ? (
              <InlineEditText
                value={dashboard.data.name}
                required
                aria-label="Rename dashboard"
                onSave={(name) => {
                  capture("dashboard:dashboard_renamed_inline", {
                    dashboard_id: dashboardId,
                  });
                  updateDashboardMetadata.mutate({
                    projectId,
                    dashboardId,
                    name,
                    description: dashboard.data?.description ?? "",
                  });
                }}
              />
            ) : undefined,
          breadcrumb: [
            {
              name: "Dashboards",
              href: `/project/${projectId}/dashboards`,
            },
          ],
          help: {
            description:
              dashboard.data?.description || "No description available",
          },
          actionButtonsLeft: (
            <>
              <MultiSelect
                title="Environment"
                label="Env"
                values={selectedEnvironments}
                onValueChange={useDebounce(setSelectedEnvironments)}
                options={environmentOptions}
                className="my-0 w-auto overflow-hidden"
              />
              <PopoverFilterBuilder
                columns={filterColumns}
                filterState={currentFilters}
                onChange={setCurrentFilters}
              />
            </>
          ),
          actionButtonsRight: (
            <>
              {(updateDashboardDefinition.isPending ||
                updateDashboardMetadata.isPending ||
                updateDashboardFilters.isPending ||
                setHomeDashboard.isPending) && (
                <span
                  className="flex items-center"
                  title="Saving..."
                  role="status"
                  aria-label="Saving"
                >
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                </span>
              )}
              {hasCUDAccess && hasUnsavedFilterChanges && (
                <Button
                  onClick={handleSaveFilters}
                  disabled={updateDashboardFilters.isPending}
                  variant="outline"
                >
                  {updateDashboardFilters.isPending
                    ? "Saving..."
                    : "Save Filters"}
                </Button>
              )}
              {hasRbacCUDAccess && (
                <Button onClick={handleAddWidget}>
                  <PlusIcon size={16} className="mr-1 h-4 w-4" />
                  Add Widget
                </Button>
              )}
              {hasCloneAccess && (
                <Button
                  variant="outline"
                  onClick={handleCloneDashboard}
                  disabled={mutateCloneDashboard.isPending}
                >
                  <Copy size={16} className="mr-1 h-4 w-4" />
                  Clone
                </Button>
              )}
              {hasRbacCUDAccess && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="More actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={isCurrentHome || setHomeDashboard.isPending}
                      onClick={() => {
                        capture("dashboard:home_dashboard_set_default", {
                          dashboard_id: dashboardId,
                          source: "detail_menu",
                        });
                        setHomeDashboard.mutate({
                          projectId,
                          dashboardId:
                            dashboardId === LANGFUSE_HOME_DASHBOARD_ID
                              ? null
                              : dashboardId,
                        });
                      }}
                    >
                      <HomeIcon className="mr-2 h-4 w-4" />
                      {isCurrentHome ? "Shown on Home" : "Use as Home"}
                    </DropdownMenuItem>
                    {hasCUDAccess && (
                      <DropdownMenuItem
                        onClick={() => setIsEditDialogOpen(true)}
                      >
                        <PencilIcon className="mr-2 h-4 w-4" />
                        Edit name & description
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          ),
        }}
      >
        <PageHeaderControlsPortal>
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={dashboardTimeRangePresets}
            className="my-0 max-w-full overflow-x-auto"
            triggerClassName="px-2"
            disabled={
              lookbackLimit
                ? {
                    before: new Date(
                      new Date().getTime() -
                        lookbackLimit * 24 * 60 * 60 * 1000,
                    ),
                  }
                : undefined
            }
          />
        </PageHeaderControlsPortal>
        <SelectWidgetDialog
          open={isWidgetDialogOpen}
          onOpenChange={setIsWidgetDialogOpen}
          projectId={projectId}
          onSelectWidget={handleSelectWidget}
          onSelectPreset={addPresetToDashboard}
          dashboardId={dashboardId}
        />
        {isEditDialogOpen && dashboard.data && (
          <EditDashboardDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            projectId={projectId}
            dashboardId={dashboardId}
            initialName={dashboard.data.name}
            initialDescription={dashboard.data.description}
          />
        )}
        <CloneFirstDialog
          open={cloneFirstState.open}
          onOpenChange={(open) =>
            setCloneFirstState((prev) => ({ ...prev, open }))
          }
          projectId={projectId}
          dashboardId={dashboardId}
          dashboardName={dashboard.data?.name ?? "Dashboard"}
          pendingDefinition={cloneFirstState.pendingDefinition}
          onCancel={() => {
            // Revert the attempted drag/resize by remounting the grid with
            // the unchanged definition.
            setCloneFirstState({ open: false, pendingDefinition: null });
            setGridResetKey((key) => key + 1);
          }}
        />
        {dashboard.isPending || !localDashboardDefinition ? (
          <NoDataOrLoading isLoading={true} />
        ) : dashboard.isError ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-destructive">
              Error: {dashboard.error.message}
            </div>
          </div>
        ) : (
          <div>
            <DashboardGrid
              key={gridResetKey}
              widgets={localDashboardDefinition.widgets}
              onChange={(updatedWidgets) => {
                if (isLockedEditable) {
                  // Carry the attempted layout change into the clone.
                  openCloneFirst("layout_change", {
                    ...localDashboardDefinition,
                    widgets: updatedWidgets,
                  });
                  return;
                }
                setLocalDashboardDefinition({
                  ...localDashboardDefinition,
                  widgets: updatedWidgets,
                });
                saveDashboardChanges({
                  ...localDashboardDefinition,
                  widgets: updatedWidgets,
                });
              }}
              canEdit={hasRbacCUDAccess}
              dashboardId={dashboardId}
              projectId={projectId}
              dateRange={absoluteTimeRange}
              filterState={gridFilterState}
              onDeleteWidget={handleDeleteWidget}
              dashboardOwner={dashboard.data?.owner}
              getWidgetSchedulerId={getWidgetSchedulerId}
              onLockedEditAttempt={
                isLockedEditable
                  ? () => openCloneFirst("widget_pencil")
                  : undefined
              }
              onDuplicateWidget={
                hasCUDAccess ? handleDuplicateWidget : undefined
              }
            />
          </div>
        )}
      </Page>
    </DashboardQuerySchedulerProvider>
  );
}
