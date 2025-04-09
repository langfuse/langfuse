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
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

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

  // State for handling widget deletion
  const [localDashboardDefinition, setLocalDashboardDefinition] = useState<{
    widgets: WidgetPlacement[];
  } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
    showSuccessToast({
      title: "Add Widget",
      description: "Add widget button clicked",
    });
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
    <Page
      withPadding
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
          <div
            className="grid auto-rows-[minmax(200px,auto)] grid-cols-12 gap-4"
            style={{
              gridTemplateRows: `repeat(${Math.max(
                ...localDashboardDefinition.widgets.map((w) => w.y + w.y_size),
              )}, minmax(200px, auto))`,
            }}
          >
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
  );
}
