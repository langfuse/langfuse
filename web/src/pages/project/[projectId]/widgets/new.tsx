import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import {
  metricAggregations,
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import { useState, useMemo, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Label } from "@/src/components/ui/label";
import { viewDeclarations } from "@/src/features/query/dataModel";
import { type z } from "zod";
import { views } from "@/src/features/query/types";
import { Input } from "@/src/components/ui/input";
import { startCase } from "lodash";
import { DatePickerWithRange } from "@/src/components/date-picker";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { type ColumnDefinition } from "@langfuse/shared";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

export default function NewWidget() {
  const session = useSession();
  const isAdmin = session.data?.user?.admin === true;

  const router = useRouter();
  const { projectId } = router.query as { projectId: string };

  // State for form fields
  const [widgetName, setWidgetName] = useState<string>("Traces");
  const [widgetDescription, setWidgetDescription] = useState<string>(
    "Traces grouped by name for the last 30 days.",
  );
  const [selectedView, setSelectedView] =
    useState<z.infer<typeof views>>("traces");
  const [selectedMetric, setSelectedMetric] = useState<string>("count");
  const [selectedAggregation, setSelectedAggregation] =
    useState<z.infer<typeof metricAggregations>>("count");
  const [selectedDimension, setSelectedDimension] = useState<string>("none");

  // Filter state
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useDashboardDateRange();
  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "widgets",
    projectId,
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

  // Chart type options
  type ChartType = {
    group: "time-series" | "total-value";
    name: string;
    value: string;
  };

  const chartTypes: ChartType[] = useMemo(
    () => [
      { group: "time-series", name: "Line Chart", value: "line-time-series" },
      {
        group: "time-series",
        name: "Vertical Bar Chart",
        value: "bar-time-series",
      },
      {
        group: "total-value",
        name: "Horizontal Bar Chart",
        value: "bar-horizontal",
      },
      {
        group: "total-value",
        name: "Vertical Bar Chart",
        value: "bar-vertical",
      },
      { group: "total-value", name: "Pie Chart", value: "pie" },
    ],
    [],
  );

  const [selectedChartType, setSelectedChartType] =
    useState<string>("line-time-series");
  const [rowLimit, setRowLimit] = useState<number>(100);

  // Reset form fields when view changes
  useEffect(() => {
    if (selectedView) {
      setSelectedMetric("count");
      setSelectedAggregation("count");
      setSelectedDimension("none");
    }
  }, [selectedView]);

  // Set aggregation to "count" when metric is "count"
  useEffect(() => {
    if (selectedMetric === "count") {
      setSelectedAggregation("count");
    }
  }, [selectedMetric]);

  // Get available metrics for the selected view
  const availableMetrics = useMemo(() => {
    const viewDeclaration = viewDeclarations[selectedView];
    return Object.entries(viewDeclaration.measures).map(([key]) => ({
      value: key,
      label: startCase(key),
    }));
  }, [selectedView]);

  // Get available dimensions for the selected view
  const availableDimensions = useMemo(() => {
    const viewDeclaration = viewDeclarations[selectedView];
    return Object.entries(viewDeclaration.dimensions).map(([key]) => ({
      value: key,
      label: startCase(key),
    }));
  }, [selectedView]);

  // Check if the selected chart type is a time series chart
  const isTimeSeriesChart = useMemo(() => {
    return (
      chartTypes.find((chart) => chart.value === selectedChartType)?.group ===
      "time-series"
    );
  }, [selectedChartType, chartTypes]);

  // Create a dynamic query based on the selected view
  const query = useMemo<QueryType>(() => {
    // Calculate fromTimestamp and toTimestamp from dateRange
    const fromTimestamp = dateRange
      ? dateRange.from
      : new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000); // Default to last 7 days
    const toTimestamp = dateRange ? dateRange.to : new Date();

    return {
      view: selectedView,
      dimensions:
        selectedDimension !== "none" ? [{ field: selectedDimension }] : [],
      metrics: [{ measure: selectedMetric, aggregation: selectedAggregation }],
      filters: [...mapLegacyUiTableFilterToView(selectedView, userFilterState)],
      timeDimension: isTimeSeriesChart ? { granularity: "auto" } : null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy: null,
    };
  }, [
    selectedView,
    selectedDimension,
    selectedAggregation,
    selectedMetric,
    userFilterState,
    dateRange,
    isTimeSeriesChart,
  ]);

  const queryResult = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: isAdmin, // Only run query if isAdmin is true
    },
  );

  // Transform the query results to a consistent format for charts
  const transformedData: DataPoint[] = useMemo(
    () =>
      queryResult.data?.map((item: any) => {
        // Get the dimension field (first dimension in the query)
        const dimensionField = selectedDimension;
        // Get the metric field (first metric in the query with its aggregation)
        const metricField = `${selectedAggregation}_${selectedMetric}`;

        return {
          dimension: item[dimensionField]
            ? (item[dimensionField] as string)
            : "n/a",
          metric: Number(item[metricField] || 0),
          time_dimension: item["time_dimension"],
        };
      }) ?? [],
    [queryResult.data, selectedAggregation, selectedDimension, selectedMetric],
  );

  if (!isAdmin) {
    return null; // Blank page for non-admins
  }

  return (
    <Page
      withPadding
      headerProps={{
        title: "New Widget",
        help: {
          description: "Create a new widget",
        },
      }}
    >
      <div className="flex h-full gap-4">
        {/* Left column - Form */}
        <div className="h-full w-1/3">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>Widget Configuration</CardTitle>
              <CardDescription>
                Configure your widget by selecting data and visualization
                options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              {/* Widget Name */}
              <div className="space-y-2">
                <Label htmlFor="widget-name">Name</Label>
                <Input
                  id="widget-name"
                  value={widgetName}
                  onChange={(e) => setWidgetName(e.target.value)}
                  placeholder="Enter widget name"
                />
              </div>

              {/* Widget Description */}
              <div className="space-y-2">
                <Label htmlFor="widget-description">Description</Label>
                <Input
                  id="widget-description"
                  value={widgetDescription}
                  onChange={(e) => setWidgetDescription(e.target.value)}
                  placeholder="Enter widget description"
                />
              </div>

              {/* Data Selection Section */}
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-bold">Data Selection</h3>

                {/* View Selection */}
                <div className="space-y-2">
                  <Label htmlFor="view-select">View</Label>
                  <Select
                    value={selectedView}
                    onValueChange={(value) =>
                      setSelectedView(value as z.infer<typeof views>)
                    }
                  >
                    <SelectTrigger id="view-select">
                      <SelectValue placeholder="Select a view" />
                    </SelectTrigger>
                    <SelectContent>
                      {views.options.map((view) => (
                        <SelectItem key={view} value={view}>
                          {startCase(view)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Metrics Selection */}
                <div className="space-y-2">
                  <Label htmlFor="metrics-select">Metric</Label>
                  <Select
                    value={selectedMetric}
                    onValueChange={(value) => setSelectedMetric(value)}
                  >
                    <SelectTrigger id="metrics-select">
                      <SelectValue placeholder="Select metrics" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMetrics.map((metric) => (
                        <SelectItem key={metric.value} value={metric.value}>
                          {metric.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedMetric !== "count" && (
                    <Select
                      value={selectedAggregation}
                      onValueChange={(value) =>
                        setSelectedAggregation(
                          value as z.infer<typeof metricAggregations>,
                        )
                      }
                    >
                      <SelectTrigger id="aggregation-select">
                        <SelectValue placeholder="Select Aggregation" />
                      </SelectTrigger>
                      <SelectContent>
                        {metricAggregations.options.map((aggregation) => (
                          <SelectItem key={aggregation} value={aggregation}>
                            {startCase(aggregation)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Filters Section */}
                <div className="space-y-2">
                  <Label>Filters</Label>
                  <div className="space-y-2">
                    <InlineFilterBuilder
                      columns={filterColumns}
                      filterState={userFilterState}
                      onChange={setUserFilterState}
                    />
                  </div>
                </div>

                {/* Dimension Selection (Breakdown) */}
                <div className="space-y-2">
                  <Label htmlFor="dimension-select">
                    Breakdown Dimension (Optional)
                  </Label>
                  <Select
                    value={selectedDimension}
                    onValueChange={setSelectedDimension}
                  >
                    <SelectTrigger id="dimension-select">
                      <SelectValue placeholder="Select a dimension" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {availableDimensions.map((dimension) => (
                        <SelectItem
                          key={dimension.value}
                          value={dimension.value}
                        >
                          {dimension.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Visualization Section */}
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-bold">Visualization</h3>

                {/* Chart Type Selection */}
                <div className="space-y-2">
                  <Label htmlFor="chart-type-select">Chart Type</Label>
                  <Select
                    value={selectedChartType}
                    onValueChange={setSelectedChartType}
                  >
                    <SelectTrigger id="chart-type-select">
                      <SelectValue placeholder="Select a chart type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Time Series</SelectLabel>
                        {chartTypes
                          .filter((item) => item.group === "time-series")
                          .map((chart) => (
                            <SelectItem key={chart.value} value={chart.value}>
                              {chart.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Total Value</SelectLabel>
                        {chartTypes
                          .filter((item) => item.group === "total-value")
                          .map((chart) => (
                            <SelectItem key={chart.value} value={chart.value}>
                              {chart.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date-select">Date Range</Label>
                  <DatePickerWithRange
                    dateRange={dateRange}
                    setDateRangeAndOption={setDateRangeAndOption}
                    selectedOption={selectedOption}
                    className="w-full"
                  />
                </div>

                {/* Row Limit Selection - Only shown for non-time series charts */}
                {!isTimeSeriesChart && (
                  <div className="space-y-2">
                    <Label htmlFor="row-limit">Row Limit (1-1000)</Label>
                    <Input
                      id="row-limit"
                      type="number"
                      min={1}
                      max={1000}
                      value={rowLimit}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value >= 1 && value <= 1000) {
                          setRowLimit(value);
                        }
                      }}
                      placeholder="Enter row limit (1-1000)"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Chart */}
        <div className="w-2/3">
          <Card>
            <CardHeader>
              <CardTitle>{widgetName}</CardTitle>
              <CardDescription>{widgetDescription}</CardDescription>
            </CardHeader>
            {queryResult.data ? (
              <Chart
                chartType={selectedChartType}
                data={transformedData}
                rowLimit={rowLimit}
              />
            ) : (
              <CardContent>
                <div className="flex h-[300px] items-center justify-center">
                  <p className="text-muted-foreground">
                    Waiting for Input / Loading...
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}
