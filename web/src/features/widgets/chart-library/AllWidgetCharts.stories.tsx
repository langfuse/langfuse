import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import preview from "../../../../.storybook/preview";
import { Chart } from "./Chart";
import { type DataPoint } from "./chart-props";

const models = [
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "gpt-5.4",
  "claude-haiku-4-5",
  "gpt-5.4-mini",
];

const timeSeries: DataPoint[] = Array.from({ length: 14 }, (_, day) => {
  const time_dimension = new Date(Date.UTC(2026, 8, 30 + day)).toISOString();
  return models.map((dimension, index) => ({
    time_dimension,
    dimension,
    metric: Math.round(
      (60 - index * 9) * (1 + 0.35 * Math.sin(day / 2 + index)) * 10,
    ),
  }));
}).flat();

const traceNames: DataPoint[] = [
  ["agent-turn", 3493],
  ["in-app-agent-conversation", 1677],
  ["search-bar-filter", 303],
  ["experiment-item-run", 202],
  ["natural-language-filter", 64],
  ["introspection-only", 12],
].map(([dimension, metric]) => ({
  time_dimension: undefined,
  dimension: dimension as string,
  metric: metric as number,
}));

const modelTotals: DataPoint[] = models.map((dimension, index) => ({
  time_dimension: undefined,
  dimension,
  metric: [910, 648, 320, 120, 40][index] ?? 0,
}));

const latencyBins: DataPoint[] = Array.from({ length: 12 }, (_, bin) => ({
  time_dimension: undefined,
  dimension: `${bin * 250}-${(bin + 1) * 250}ms`,
  metric: Math.round(400 * Math.exp(-((bin - 3) ** 2) / 8)),
}));

const widgets: {
  title: string;
  chartType: DashboardWidgetChartType;
  data: DataPoint[];
  colorBarsByCategory?: boolean;
}[] = [
  {
    title: "Line time series",
    chartType: "LINE_TIME_SERIES",
    data: timeSeries,
  },
  {
    title: "Area time series",
    chartType: "AREA_TIME_SERIES",
    data: timeSeries,
  },
  { title: "Bar time series", chartType: "BAR_TIME_SERIES", data: timeSeries },
  { title: "Vertical bar", chartType: "VERTICAL_BAR", data: traceNames },
  {
    title: "Vertical bar, colour by category",
    chartType: "VERTICAL_BAR",
    data: modelTotals,
    colorBarsByCategory: true,
  },
  { title: "Horizontal bar", chartType: "HORIZONTAL_BAR", data: traceNames },
  { title: "Pie", chartType: "PIE", data: modelTotals },
  { title: "Histogram", chartType: "HISTOGRAM", data: latencyBins },
  {
    title: "Number",
    chartType: "NUMBER",
    data: [{ time_dimension: undefined, dimension: undefined, metric: 38750 }],
  },
];

function AllWidgetCharts() {
  return (
    <div className="bg-background grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
      {widgets.map((widget) => (
        <div
          key={widget.title}
          className="bg-card flex h-80 flex-col rounded-lg border"
        >
          <div className="p-4 pb-2 text-sm font-bold">{widget.title}</div>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <Chart
              chartType={widget.chartType}
              data={widget.data}
              rowLimit={20}
              legendPosition="auto"
              colorBarsByCategory={widget.colorBarsByCategory}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const meta = preview.meta({
  component: AllWidgetCharts,
  parameters: { layout: "fullscreen" },
});

export const Default = meta.story({});
