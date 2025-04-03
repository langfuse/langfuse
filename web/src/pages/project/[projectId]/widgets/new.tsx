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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/src/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { api } from "@/src/utils/api";
import { metricAggregations, type QueryType } from "@/src/features/query";
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
  // const [selectedFilters, setSelectedFilters] = useState<FilterState>([]);

  // Chart type options
  type ChartType = {
    group: "time-series" | "total-value";
    name: string;
    value: string;
  };

  const chartTypes: ChartType[] = [
    { group: "time-series", name: "Line Chart", value: "line-time-series" },
    {
      group: "time-series",
      name: "Vertical Bar Chart",
      value: "bar-time-series",
    },
    { group: "total-value", name: "Number", value: "number" },
    {
      group: "total-value",
      name: "Horizontal Bar Chart",
      value: "bar-horizontal",
    },
    { group: "total-value", name: "Vertical Bar Chart", value: "bar-vertical" },
    { group: "total-value", name: "Pie Chart", value: "pie" },
  ];

  const [selectedChartType, setSelectedChartType] =
    useState<string>("line-time-series");

  // Reset form fields when view changes
  useEffect(() => {
    if (selectedView) {
      setSelectedMetric("count");
      setSelectedMetric("count");
      setSelectedDimension("none");
      // setSelectedFilters([]);
    }
  }, [selectedView]);

  // Get available metrics for the selected view
  const availableMetrics = useMemo(() => {
    if (!selectedView) return [];
    const viewDeclaration = viewDeclarations[selectedView];
    return Object.entries(viewDeclaration.measures).map(([key]) => ({
      value: key,
      label: startCase(key),
    }));
  }, [selectedView]);

  // Get available dimensions for the selected view
  const availableDimensions = useMemo(() => {
    if (!selectedView) return [];
    const viewDeclaration = viewDeclarations[selectedView];
    return Object.entries(viewDeclaration.dimensions).map(([key]) => ({
      value: key,
      label: startCase(key),
    }));
  }, [selectedView]);

  // Create a dynamic query based on the selected view
  const query = useMemo<QueryType>(
    () => ({
      view: selectedView,
      dimensions:
        selectedDimension !== "none" ? [{ field: selectedDimension }] : [],
      metrics: [{ measure: selectedMetric, aggregation: selectedAggregation }],
      filters: [],
      timeDimension: null,
      fromTimestamp: new Date("2025-03-01").toISOString(),
      toTimestamp: new Date("2025-04-04").toISOString(),
      orderBy: null,
    }),
    [selectedView, selectedDimension, selectedAggregation, selectedMetric],
  );

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
      enabled: isAdmin && !!selectedView, // Only run query if isAdmin is true and a view is selected
    },
  );

  // Transform the query results to a consistent format for charts
  const transformedData = useMemo(
    () =>
      queryResult.data?.map((item: any) => {
        // Get the dimension field (first dimension in the query)
        const dimensionField = selectedDimension;
        // Get the metric field (first metric in the query with its aggregation)
        const metricField = `${selectedAggregation}_${selectedMetric}`;

        return {
          dimension: item[dimensionField]
            ? (item[dimensionField] as string)
            : "Unknown",
          metric: Number(item[metricField] || 0),
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
        <div className="w-1/3">
          <Card>
            <CardHeader>
              <CardTitle>Widget Configuration</CardTitle>
              <CardDescription>
                Configure your widget by selecting data and visualization
                options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  disabled={!selectedView}
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
                <Select
                  disabled={!selectedView}
                  value={selectedAggregation}
                  onValueChange={(value) =>
                    setSelectedAggregation(
                      value as z.infer<typeof metricAggregations>,
                    )
                  }
                >
                  <SelectTrigger id="metrics-select">
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
              </div>

              {/* Dimension Selection (Breakdown) */}
              <div className="space-y-2">
                <Label htmlFor="dimension-select">
                  Breakdown Dimension (Optional)
                </Label>
                <Select
                  value={selectedDimension}
                  onValueChange={setSelectedDimension}
                  disabled={!selectedView}
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

              {/* Chart Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="chart-type-select">Chart Type</Label>
                <Select
                  value={selectedChartType}
                  onValueChange={setSelectedChartType}
                  disabled={!selectedView}
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
              <CardContent>
                <ChartContainer
                  config={{
                    metric: {
                      theme: {
                        light: "hsl(var(--chart-1))",
                        dark: "hsl(var(--chart-1))",
                      },
                    },
                  }}
                >
                  <BarChart
                    accessibilityLayer
                    data={transformedData}
                    layout={"vertical"}
                  >
                    <XAxis
                      type="number"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="dimension"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Bar
                      dataKey="metric"
                      radius={[0, 4, 4, 0]}
                      className="fill-[--color-metric]"
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value: number) =>
                            Intl.NumberFormat("en-US").format(value).toString()
                          }
                        />
                      }
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
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
