import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import Page from "@/src/components/layouts/page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DashboardWidget } from "@/src/features/widgets";
import { DatePickerWithRange } from "@/src/components/date-picker";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { useEffect, useState } from "react";
import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  SelectWidgetDialog,
  type WidgetItem,
} from "@/src/features/widgets/components/SelectWidgetDialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { v4 as uuidv4 } from "uuid";

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
  const { projectId, dashboardId } = router.query as {
    projectId: string;
    dashboardId: string;
  };

  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  // Filter state
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useDashboardDateRange();
  const [userFilterState, setUserFilterState] = useState<FilterState>([]);

  // State for handling widget deletion and addition
  const [localDashboardDefinition, setLocalDashboardDefinition] = useState<{
    widgets: WidgetPlacement[];
  } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // State for the widget selection dialog
  const [isWidgetDialogOpen, setIsWidgetDialogOpen] = useState(false);

  // Mutation for updating dashboard definition
  const updateDashboardDefinition =
    api.dashboard.updateDashboardDefinition.useMutation({
      onSuccess: () => {
        showSuccessToast({
          title: "Dashboard updated",
          description: "Your changes have been saved successfully",
        });
        setHasUnsavedChanges(false);
        // Invalidate the dashboard query to refetch the data
        dashboard.refetch();
      },
      onError: (error) => {
        showErrorToast("Error updating dashboard", error.message);
      },
    });

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

  // Fetch dashboard data
  const dashboard = api.dashboard.getDashboard.useQuery(
    { projectId, dashboardId },
    {
      enabled: Boolean(projectId) && Boolean(dashboardId),
    },
  );

  useEffect(() => {
    if (dashboard.data && !localDashboardDefinition) {
      setLocalDashboardDefinition(dashboard.data.definition);
    }
  }, [dashboard.data, localDashboardDefinition]);

  // Handle deleting a widget
  const handleDeleteWidget = (tileId: string) => {
    if (localDashboardDefinition) {
      const updatedWidgets = localDashboardDefinition.widgets.filter(
        (widget) => widget.id !== tileId,
      );

      setLocalDashboardDefinition({
        ...localDashboardDefinition,
        widgets: updatedWidgets,
      });

      setHasUnsavedChanges(true);
    }
  };

  // Handle adding a widget
  const handleAddWidget = () => {
    setIsWidgetDialogOpen(true);
  };

  // Handle widget selection from dialog
  const handleSelectWidget = (widget: WidgetItem) => {
    if (localDashboardDefinition) {
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
        y_size: 2, // Default height of 2 rows
        type: "widget",
      };

      // Add the widget to the local dashboard definition
      setLocalDashboardDefinition({
        ...localDashboardDefinition,
        widgets: [...localDashboardDefinition.widgets, newWidgetPlacement],
      });

      setHasUnsavedChanges(true);

      showSuccessToast({
        title: "Widget added",
        description: `"${widget.name}" has been added to the dashboard. Click Save to apply changes.`,
      });
    }
  };

  // Handle saving the dashboard
  const handleSaveDashboard = () => {
    if (localDashboardDefinition && hasUnsavedChanges) {
      updateDashboardDefinition.mutate({
        projectId,
        dashboardId,
        definition: localDashboardDefinition,
      });
    }
  };

  return (
    <>
      <SelectWidgetDialog
        open={isWidgetDialogOpen}
        onOpenChange={setIsWidgetDialogOpen}
        projectId={projectId}
        onSelectWidget={handleSelectWidget}
      />

      <Page
        withPadding
        scrollable
        headerProps={{
          title: dashboard.data?.name || "Dashboard",
          help: {
            description:
              dashboard.data?.description || "No description available",
          },
          actionButtonsRight: (
            <>
              <Button onClick={handleAddWidget} disabled={!hasCUDAccess}>
                <PlusIcon size={16} />
                Add Widget
              </Button>
              <Button
                onClick={handleSaveDashboard}
                disabled={
                  !hasUnsavedChanges ||
                  updateDashboardDefinition.isLoading ||
                  !hasCUDAccess
                }
                loading={updateDashboardDefinition.isLoading}
              >
                Save
              </Button>
            </>
          ),
        }}
      >
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
            <div className="grid grid-cols-12 gap-4">
              {localDashboardDefinition.widgets.map((widgetPlacement) => (
                <DashboardWidget
                  key={widgetPlacement.id}
                  projectId={projectId}
                  placement={widgetPlacement}
                  dateRange={dateRange}
                  filterState={userFilterState}
                  onDeleteWidget={handleDeleteWidget}
                />
              ))}
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
