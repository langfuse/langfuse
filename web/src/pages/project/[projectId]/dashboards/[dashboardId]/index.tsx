import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import Page from "@/src/components/layouts/page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DatePickerWithRange } from "@/src/components/date-picker";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { useEffect, useState, useCallback } from "react";
import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { PlusIcon, Copy } from "lucide-react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  SelectWidgetDialog,
  type WidgetItem,
} from "@/src/features/widgets/components/SelectWidgetDialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { v4 as uuidv4 } from "uuid";
import { useDebounce } from "@/src/hooks/useDebounce";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";

interface WidgetPlacement {
  id: string;
  widgetId: string;
  x: number;
  y: number;
  x_size: number;
  y_size: number;
  type: "widget";
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

  // Fetch dashboard data
  const dashboard = api.dashboard.getDashboard.useQuery({
    projectId,
    dashboardId,
  });

  const hasCUDAccess =
    useHasProjectAccess({
      projectId,
      scope: "dashboards:CUD",
    }) && dashboard.data?.owner !== "LANGFUSE";

  // Access for cloning (independent of dashboard owner)
  const hasCloneAccess =
    useHasProjectAccess({
      projectId,
      scope: "dashboards:CUD",
    }) && dashboard.data?.owner === "LANGFUSE";

  // Filter state
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useDashboardDateRange({ defaultRelativeAggregation: "7 days" });
  const [userFilterState, setUserFilterState] = useState<FilterState>([]);

  // State for handling widget deletion and addition
  const [localDashboardDefinition, setLocalDashboardDefinition] = useState<{
    widgets: WidgetPlacement[];
  } | null>(null);

  // State for the widget selection dialog
  const [isWidgetDialogOpen, setIsWidgetDialogOpen] = useState(false);

  // Mutation for updating dashboard definition
  const updateDashboardDefinition =
    api.dashboard.updateDashboardDefinition.useMutation({
      onSuccess: () => {
        showSuccessToast({
          title: "Dashboard updated",
          description: "Your changes have been saved automatically",
          duration: 2000,
        });
        // Invalidate the dashboard query to refetch the data
        dashboard.refetch();
      },
      onError: (error) => {
        showErrorToast("Error updating dashboard", error.message);
      },
    });

  const saveDashboardChanges = useDebounce(
    (definition: { widgets: WidgetPlacement[] }) => {
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

  // Helper function to add a widget to the dashboard
  const addWidgetToDashboard = useCallback(
    (widget: WidgetItem) => {
      if (!localDashboardDefinition) return;

      // Find the maximum y position to place the new widget at the bottom
      const maxY =
        localDashboardDefinition.widgets.length > 0
          ? Math.max(
              ...localDashboardDefinition.widgets.map((w) => w.y + w.y_size),
            )
          : 0;

      // Create a new widget placement
      const newWidgetPlacement: WidgetPlacement = {
        id: uuidv4(),
        widgetId: widget.id,
        x: 0, // Start at left
        y: maxY, // Place below existing widgets
        x_size: 6, // Default size (half of 12-column grid)
        y_size: 6, // Default height of 6 rows
        type: "widget",
      };

      // Add the widget to the local dashboard definition
      const updatedDefinition = {
        ...localDashboardDefinition,
        widgets: [...localDashboardDefinition.widgets, newWidgetPlacement],
      };
      setLocalDashboardDefinition(updatedDefinition);
      saveDashboardChanges(updatedDefinition);
    },
    [
      localDashboardDefinition,
      setLocalDashboardDefinition,
      saveDashboardChanges,
    ],
  );

  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId,
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

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId },
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
  const environmentOptions =
    environmentFilterOptions.data?.map((value) => ({
      value: value.environment,
    })) || [];
  const nameOptions = traceFilterOptions.data?.name || [];
  const tagsOptions = traceFilterOptions.data?.tags || [];

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

  useEffect(() => {
    if (localDashboardDefinition && widgetToAdd.data && addWidgetId) {
      if (
        !localDashboardDefinition.widgets.some(
          (w) => w.widgetId === addWidgetId,
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
      setLocalDashboardDefinition(updatedDefinition);
      saveDashboardChanges(updatedDefinition);
    }
  };

  // Handle adding a widget
  const handleAddWidget = () => {
    setIsWidgetDialogOpen(true);
  };

  // Handle widget selection from dialog
  const handleSelectWidget = (widget: WidgetItem) => {
    addWidgetToDashboard(widget);
  };

  const mutateCloneDashboard = api.dashboard.cloneDashboard.useMutation({
    onSuccess: (data) => {
      void utils.dashboard.invalidate();
      capture("dashboard:clone_dashboard");
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

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title:
          (dashboard.data?.name || "Dashboard") +
          (dashboard.data?.owner === "LANGFUSE"
            ? " (Langfuse Maintained)"
            : ""),
        help: {
          description:
            dashboard.data?.description || "No description available",
        },
        actionButtonsRight: (
          <>
            {hasCUDAccess && (
              <Button onClick={handleAddWidget}>
                <PlusIcon size={16} className="mr-1 h-4 w-4" />
                Add Widget
              </Button>
            )}
            {hasCloneAccess && (
              <Button
                onClick={handleCloneDashboard}
                disabled={mutateCloneDashboard.isLoading}
              >
                <Copy size={16} className="mr-1 h-4 w-4" />
                Clone
              </Button>
            )}
          </>
        ),
      }}
    >
      <SelectWidgetDialog
        open={isWidgetDialogOpen}
        onOpenChange={setIsWidgetDialogOpen}
        projectId={projectId}
        onSelectWidget={handleSelectWidget}
        dashboardId={dashboardId}
      />
      {dashboard.isLoading || !localDashboardDefinition ? (
        <NoDataOrLoading isLoading={true} />
      ) : dashboard.isError ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-destructive">
            Error: {dashboard.error.message}
          </div>
        </div>
      ) : (
        <div>
          <div className="my-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:gap-3">
              <DatePickerWithRange
                dateRange={dateRange}
                setDateRangeAndOption={setDateRangeAndOption}
                selectedOption={selectedOption}
                className="my-0 max-w-full overflow-x-auto"
              />
              <PopoverFilterBuilder
                columns={filterColumns}
                filterState={userFilterState}
                onChange={setUserFilterState}
              />
            </div>
          </div>
          <DashboardGrid
            widgets={localDashboardDefinition.widgets}
            onChange={(updatedWidgets) => {
              setLocalDashboardDefinition({
                ...localDashboardDefinition,
                widgets: updatedWidgets,
              });
              saveDashboardChanges({
                ...localDashboardDefinition,
                widgets: updatedWidgets,
              });
            }}
            canEdit={hasCUDAccess}
            dashboardId={dashboardId}
            projectId={projectId}
            dateRange={dateRange}
            filterState={userFilterState}
            onDeleteWidget={handleDeleteWidget}
            dashboardOwner={dashboard.data?.owner}
          />
        </div>
      )}
    </Page>
  );
}
