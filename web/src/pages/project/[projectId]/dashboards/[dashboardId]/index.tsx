import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import Page from "@/src/components/layouts/page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DashboardWidget } from "@/src/features/widgets";
import { DatePickerWithRange } from "@/src/components/date-picker";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { useState } from "react";
import type { ColumnDefinition, FilterState } from "@langfuse/shared";

interface WidgetPlacement {
  id: string;
  x: number;
  y: number;
  x_size: number;
  y_size: number;
}

export default function DashboardDetail() {
  const router = useRouter();
  const { projectId, dashboardId } = router.query as {
    projectId: string;
    dashboardId: string;
  };

  // Filter state
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useDashboardDateRange();
  const [userFilterState, setUserFilterState] = useState<FilterState>([]);

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

  return (
    <Page
      withPadding
      headerProps={{
        title: dashboard.data?.name || "Dashboard",
        help: {
          description:
            dashboard.data?.description || "No description available",
        },
      }}
    >
      {dashboard.isLoading || !dashboard.data ? (
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
                ...(dashboard.data.definition.widgets as WidgetPlacement[]).map(
                  (w) => w.y + w.y_size,
                ),
              )}, minmax(200px, auto))`,
            }}
          >
            {(dashboard.data.definition.widgets as WidgetPlacement[]).map(
              (widgetPlacement) => (
                <DashboardWidget
                  key={widgetPlacement.id}
                  projectId={projectId}
                  placement={widgetPlacement}
                  dateRange={dateRange}
                  filterState={userFilterState}
                />
              ),
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
