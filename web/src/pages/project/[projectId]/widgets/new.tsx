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
import { type QueryType } from "@/src/features/query";
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
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import { Label } from "@/src/components/ui/label";
import { viewDeclarations } from "@/src/features/query/dataModel";
import { type z } from "zod";
import { type views } from "@/src/features/query/types";
import { Input } from "@/src/components/ui/input";

export default function NewWidget() {
  const session = useSession();
  const isAdmin = session.data?.user?.admin === true;

  const router = useRouter();
  const { projectId } = router.query as { projectId: string };

  // Define timestamps for the query
  const toTimestamp = new Date("2025-04-04");
  const fromTimestamp = new Date("2025-03-01");

  // State for form fields
  const [widgetName, setWidgetName] = useState<string>("Traces");
  const [widgetDescription, setWidgetDescription] = useState<string>("Traces grouped by name for the last 30 days.");
  const [selectedView, setSelectedView] = useState<z.infer<typeof views> | "">(
    "traces",
  );
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<string>("");
  const [selectedFilters, setSelectedFilters] = useState<any[]>([]);

  // Chart type options
  type ChartType = {
    group: "Time Series" | "Total Value";
    name: string;
    value: string;
  };

  const chartTypes: ChartType[] = [
    { group: "Time Series", name: "Line Chart", value: "line-time-series" },
    {
      group: "Time Series",
      name: "Vertical Bar Chart",
      value: "bar-time-series",
    },
    { group: "Total Value", name: "Number", value: "number" },
    {
      group: "Total Value",
      name: "Horizontal Bar Chart",
      value: "bar-horizontal",
    },
    { group: "Total Value", name: "Vertical Bar Chart", value: "bar-vertical" },
    { group: "Total Value", name: "Pie Chart", value: "pie" },
  ];

  const [selectedChartType, setSelectedChartType] =
    useState<string>("line-time-series");

  // Reset form fields when view changes
  useEffect(() => {
    if (selectedView) {
      setSelectedMetrics([]);
      setSelectedDimension("");
      setSelectedFilters([]);
    }
  }, [selectedView]);

  // Get available metrics for the selected view
  const availableMetrics = useMemo(() => {
    if (!selectedView) return [];

    const viewDeclaration = viewDeclarations[selectedView];
    return Object.entries(viewDeclaration.measures).map(([key, measure]) => ({
      value: key,
      label:
        key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1"),
    }));
  }, [selectedView]);

  // Get available dimensions for the selected view
  const availableDimensions = useMemo(() => {
    if (!selectedView) return [];

    const viewDeclaration = viewDeclarations[selectedView];
    return Object.entries(viewDeclaration.dimensions).map(
      ([key, dimension]) => ({
        value: key,
        label:
          key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1"),
      }),
    );
  }, [selectedView]);

  const tracesQuery: QueryType = {
    view: "traces",
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: [],
    timeDimension: null,
    fromTimestamp: fromTimestamp.toISOString(),
    toTimestamp: toTimestamp.toISOString(),
    orderBy: null,
  };

  const traces = api.dashboard.executeQuery.useQuery(
    {
      projectId,
      query: tracesQuery,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: isAdmin, // Only run query if isAdmin is true and projectId exists
    },
  );

  const transformedTraces =
    traces.data?.map((item: any) => ({
      name: item.name ? (item.name as string) : "Unknown",
      total: Number(item.count_count),
    })) ?? [];

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
                    <SelectItem value="traces">Traces</SelectItem>
                    <SelectItem value="observations">Observations</SelectItem>
                    <SelectItem value="scores-numeric">
                      Scores (Numeric)
                    </SelectItem>
                    <SelectItem value="scores-categorical">
                      Scores (Categorical)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Metrics Selection */}
              <div className="space-y-2">
                <Label htmlFor="metrics-select">Metric</Label>
                <Select disabled={!selectedView}>
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
                <Select disabled={!selectedView}>
                  <SelectTrigger id="metrics-select">
                    <SelectValue placeholder="Select Aggregation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Count</SelectItem>
                    <SelectItem value="sum">Sum</SelectItem>
                    <SelectItem value="avg">Average</SelectItem>
                    <SelectItem value="max">Max</SelectItem>
                    <SelectItem value="min">Min</SelectItem>
                    <SelectItem value="p50">P50</SelectItem>
                    <SelectItem value="p75">P75</SelectItem>
                    <SelectItem value="p90">P90</SelectItem>
                    <SelectItem value="p95">P95</SelectItem>
                    <SelectItem value="p99">P99</SelectItem>
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
                      <SelectItem value="line-time-series">
                        Line Chart
                      </SelectItem>
                      <SelectItem value="bar-time-series">
                        Vertical Bar Chart
                      </SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Total Value</SelectLabel>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="bar-horizontal">
                        Horizontal Bar Chart
                      </SelectItem>
                      <SelectItem value="bar-vertical">
                        Vertical Bar Chart
                      </SelectItem>
                      <SelectItem value="pie">Pie Chart</SelectItem>
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
              <CardDescription>
                {widgetDescription}
              </CardDescription>
            </CardHeader>
            {traces.data ? (
              <CardContent>
                <ChartContainer
                  config={{
                    total: {
                      theme: {
                        light: "hsl(var(--chart-1))",
                        dark: "hsl(var(--chart-1))",
                      },
                    },
                  }}
                >
                  <BarChart
                    accessibilityLayer
                    data={transformedTraces}
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
                      dataKey="name"
                      stroke="#888888"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Bar
                      dataKey="total"
                      radius={[0, 4, 4, 0]}
                      className="fill-[--color-total]"
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
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}
