import { expect, waitFor } from "storybook/test";
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

/** 13 daily buckets so a 3-day tick step lands on the last bar (Aug 13). */
const dailyStacked: DataPoint[] = Array.from({ length: 13 }, (_, day) => {
  const time_dimension = new Date(Date.UTC(2026, 7, 1 + day)).toISOString();
  return [
    {
      time_dimension,
      dimension: "gpt-4o",
      metric: 40_000 + day * 1_200,
    },
    {
      time_dimension,
      dimension: "gpt-4o-mini",
      metric: 65_000 + day * 800,
    },
  ];
}).flat();

export const LastDateAtEdge = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="bg-background h-[220px] w-[480px] overflow-hidden rounded-lg border p-4">
      <VerticalBarChartTimeSeries data={dailyStacked} legendPosition="none" />
    </div>
  ),
});

export const TestLastDateFullyVisible = meta.story({
  name: "(Test) Last Date Fully Visible",
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="bg-background h-[220px] w-[480px] overflow-hidden rounded-lg border p-4">
      <VerticalBarChartTimeSeries data={dailyStacked} legendPosition="none" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const svg = canvasElement.querySelector("svg");
      expect(svg).toBeTruthy();
    });
    const svg = canvasElement.querySelector("svg");
    if (!svg) throw new Error("chart svg not found");
    const svgBox = svg.getBoundingClientRect();
    const timeLabels = [...svg.querySelectorAll("text")].filter((el) =>
      /^[A-Z][a-z]{2} \d/.test(el.textContent ?? ""),
    );
    await expect(timeLabels.length).toBeGreaterThan(0);
    const lastLabel = timeLabels.at(-1);
    if (!lastLabel) throw new Error("no date tick found");
    await expect(lastLabel.textContent).toMatch(/Aug 1[13]/);
    for (const label of timeLabels) {
      const box = label.getBoundingClientRect();
      await expect(box.right).toBeLessThanOrEqual(svgBox.right + 1);
      await expect(box.left).toBeGreaterThanOrEqual(svgBox.left - 1);
    }
  },
});
