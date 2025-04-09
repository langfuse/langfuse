import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import {
  metricAggregations,
  type QueryType,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";
import React, { useState, useMemo, useEffect } from "react";
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
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { type ColumnDefinition } from "@langfuse/shared";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { Button } from "@/src/components/ui/button";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type FilterState } from "@langfuse/shared";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import {
  BarChart,
  PieChart,
  LineChart,
  BarChartHorizontal,
} from "lucide-react";

export function WidgetForm({
  initialValues,
  projectId,
  onSave,
}: {
  initialValues: {
    name: string;
    description: string;
    view: z.infer<typeof views>;
    measure: string;
    aggregation: z.infer<typeof metricAggregations>;
    dimension: string;
    filters?: FilterState;
    chartType: DashboardWidgetChartType;
    chartConfig?: { type: DashboardWidgetChartType; row_limit?: number };
  };
  projectId: string;
  onSave: (widgetData: {
    name: string;
    description: string;
    view: string;
    dimensions: { field: string }[];
    metrics: { measure: string; agg: string }[];
    filters: any[];
    chartType: DashboardWidgetChartType;
    chartConfig: { type: DashboardWidgetChartType; row_limit?: number };
  }) => void;
}) {
  // State for form fields
  const [widgetName, setWidgetName] = useState<string>(initialValues.name);
  const [widgetDescription, setWidgetDescription] = useState<string>(
    initialValues.description,
  );
  const [selectedView, setSelectedView] = useState<z.infer<typeof views>>(
    initialValues.view,
  );
  const [selectedMeasure, setSelectedMeasure] = useState<string>(
    initialValues.measure,
  );
  const [selectedAggregation, setSelectedAggregation] = useState<
    z.infer<typeof metricAggregations>
  >(initialValues.aggregation);
  const [selectedDimension, setSelectedDimension] = useState<string>(
    initialValues.dimension,
  );

  const [selectedChartType, setSelectedChartType] = useState<string>(
    initialValues.chartType,
  );
  const [rowLimit, setRowLimit] = useState<number>(
    initialValues.chartConfig?.row_limit ?? 100,
  );

  // Filter state
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useDashboardDateRange();
  const [userFilterState, setUserFilterState] = useState<FilterState>(
    initialValues.filters ?? [],
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
    value: DashboardWidgetChartType;
    icon: React.ElementType;
  };

  const chartTypes: ChartType[] = useMemo(
    () => [
      {
        group: "time-series",
        name: "Line Chart",
        value: "LINE_TIME_SERIES",
        icon: LineChart,
      },
      {
        group: "time-series",
        name: "Vertical Bar Chart",
        value: "BAR_TIME_SERIES",
        icon: BarChart,
      },
      {
        group: "total-value",
        name: "Horizontal Bar Chart",
        value: "HORIZONTAL_BAR",
        icon: BarChartHorizontal,
      },
      {
        group: "total-value",
        name: "Vertical Bar Chart",
        value: "VERTICAL_BAR",
        icon: BarChart,
      },
      { group: "total-value", name: "Pie Chart", value: "PIE", icon: PieChart },
    ],
    [],
  );

  // Set aggregation to "count" when metric is "count"
  useEffect(() => {
    if (selectedMeasure === "count") {
      setSelectedAggregation("count");
    }
  }, [selectedMeasure]);

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
      metrics: [{ measure: selectedMeasure, aggregation: selectedAggregation }],
      filters: [...mapLegacyUiTableFilterToView(selectedView, userFilterState)],
      timeDimension: isTimeSeriesChart(
        selectedChartType as DashboardWidgetChartType,
      )
        ? { granularity: "auto" }
        : null,
      fromTimestamp: fromTimestamp.toISOString(),
      toTimestamp: toTimestamp.toISOString(),
      orderBy: null,
    };
  }, [
    selectedView,
    selectedDimension,
    selectedAggregation,
    selectedMeasure,
    userFilterState,
    dateRange,
    selectedChartType,
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
    },
  );

  // Transform the query results to a consistent format for charts
  const transformedData: DataPoint[] = useMemo(
    () =>
      queryResult.data?.map((item: any) => {
        // Get the dimension field (first dimension in the query)
        const dimensionField = selectedDimension;
        // Get the metric field (first metric in the query with its aggregation)
        const metricField = `${selectedAggregation}_${selectedMeasure}`;

        return {
          dimension: item[dimensionField]
            ? (item[dimensionField] as string)
            : startCase(metricField === "count_count" ? "Count" : metricField),
          metric: Number(item[metricField] || 0),
          time_dimension: item["time_dimension"],
        };
      }) ?? [],
    [queryResult.data, selectedAggregation, selectedDimension, selectedMeasure],
  );

  const handleSaveWidget = () => {
    if (!widgetName.trim()) {
      showErrorToast("Error", "Widget name is required");
      return;
    }

    onSave({
      name: widgetName,
      description: widgetDescription,
      view: selectedView,
      dimensions:
        selectedDimension !== "none" ? [{ field: selectedDimension }] : [],
      metrics: [{ measure: selectedMeasure, agg: selectedAggregation }],
      filters: mapLegacyUiTableFilterToView(selectedView, userFilterState),
      chartType: selectedChartType as DashboardWidgetChartType,
      chartConfig: isTimeSeriesChart(
        selectedChartType as DashboardWidgetChartType,
      )
        ? { type: selectedChartType as DashboardWidgetChartType }
        : {
            type: selectedChartType as DashboardWidgetChartType,
            row_limit: rowLimit,
          },
    });
  };

  return (
    <div className="flex h-full gap-4">
      {/* Left column - Form */}
      <div className="h-full w-1/3 min-w-[430px]">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle>Widget Configuration</CardTitle>
            <CardDescription>
              Configure your widget by selecting data and visualization options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 overflow-y-auto">
            {/* Data Selection Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold">Data Selection</h3>

              {/* View Selection */}
              <div className="space-y-2">
                <Label htmlFor="view-select">View</Label>
                <Select
                  value={selectedView}
                  onValueChange={(value) => {
                    if (value !== selectedView) {
                      setSelectedMeasure("count");
                      setSelectedAggregation("count");
                      setSelectedDimension("none");
                    }
                    setSelectedView(value as z.infer<typeof views>);
                  }}
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
                  value={selectedMeasure}
                  onValueChange={(value) => setSelectedMeasure(value)}
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
                {selectedMeasure !== "count" && (
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
                      <SelectItem key={dimension.value} value={dimension.value}>
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
                            <div className="flex items-center">
                              {" "}
                              {React.createElement(chart.icon, {
                                className: "mr-2 w-4",
                              })}
                              <span>{chart.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Total Value</SelectLabel>
                      {chartTypes
                        .filter((item) => item.group === "total-value")
                        .map((chart) => (
                          <SelectItem key={chart.value} value={chart.value}>
                            <div className="flex items-center">
                              {" "}
                              {React.createElement(chart.icon, {
                                className: "mr-2 w-4",
                              })}
                              <span>{chart.name}</span>
                            </div>
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
              {!isTimeSeriesChart(
                selectedChartType as DashboardWidgetChartType,
              ) && (
                <div className="space-y-2">
                  <Label htmlFor="row-limit">
                    Breakdown Row Limit (0-1000)
                  </Label>
                  <Input
                    id="row-limit"
                    type="number"
                    min={0}
                    max={1000}
                    value={rowLimit}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (!isNaN(value) && value >= 0 && value <= 1000) {
                        setRowLimit(value);
                      }
                    }}
                    placeholder="Enter breakdown row limit (0-1000)"
                  />
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="mt-auto">
            <Button className="w-full" size="lg" onClick={handleSaveWidget}>
              Save Widget
            </Button>
          </CardFooter>
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
              chartType={selectedChartType as DashboardWidgetChartType}
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
  );
}
