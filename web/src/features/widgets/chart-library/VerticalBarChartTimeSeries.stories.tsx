import preview from "../../../../.storybook/preview";
import { type ChartProps, type DataPoint } from "./chart-props";
import { VerticalBarChartTimeSeries } from "./VerticalBarChartTimeSeries";

const VerticalBarChartTimeSeriesDemo = (props: ChartProps) => (
  <VerticalBarChartTimeSeries {...props} />
);

const data: DataPoint[] = [
  {
    time_dimension: "2026-06-22T00:00:00.000Z",
    dimension: "gpt-4o",
    metric: 42_000,
  },
  {
    time_dimension: "2026-06-22T00:00:00.000Z",
    dimension: "gpt-4o-mini",
    metric: 68_000,
  },
  {
    time_dimension: "2026-06-23T00:00:00.000Z",
    dimension: "gpt-4o",
    metric: 51_000,
  },
  {
    time_dimension: "2026-06-23T00:00:00.000Z",
    dimension: "gpt-4o-mini",
    metric: 73_000,
  },
  {
    time_dimension: "2026-06-24T00:00:00.000Z",
    dimension: "gpt-4o",
    metric: 47_000,
  },
  {
    time_dimension: "2026-06-24T00:00:00.000Z",
    dimension: "gpt-4o-mini",
    metric: 81_000,
  },
];

const meta = preview.meta({
  component: VerticalBarChartTimeSeriesDemo,
  parameters: { layout: "fullscreen" },
});

export const Default = meta.story({
  args: {
    data,
    legendPosition: "auto",
  },
});
