import { expect, userEvent } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { WidgetChartCard } from "./WidgetChartCard";

const meta = preview.meta({
  component: WidgetChartCard,
  args: {
    chartType: "AREA_TIME_SERIES" as const,
    title: "Widget chart",
    data: [
      {
        dimension: "Traces",
        metric: 12,
        time_dimension: "2026-11-01T00:00:00.000Z",
      },
      {
        dimension: "Traces",
        metric: 24,
        time_dimension: "2026-11-02T00:00:00.000Z",
      },
    ],
  },
  decorators: [
    (Story) => (
      <div className="h-96 w-full max-w-2xl">
        <Story />
      </div>
    ),
  ],
});

export const Area = meta.story({});

export const NumberAggregation = meta.story({
  name: "(Test) Number aggregation",
  args: {
    chartType: "NUMBER",
    metricFormatter: (value) => ({ main: `${value} requests` }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("36 requests")).toBeVisible();
  },
});

export const CategoricalRowLimit = meta.story({
  args: {
    chartType: "HORIZONTAL_BAR",
    rowLimit: 1,
    data: [
      { time_dimension: undefined, dimension: "api", metric: 12 },
      { time_dimension: undefined, dimension: "worker", metric: 7 },
    ],
  },
});

export const PivotTable = meta.story({
  name: "(Test) Pivot table",
  args: {
    chartType: "PIVOT_TABLE",
    data: [
      {
        dimension: "Model A",
        metric: 12,
        time_dimension: undefined,
      },
    ],
    chartConfig: {
      type: "PIVOT_TABLE",
      dimensions: ["dimension"],
      metrics: ["metric"],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("table")).toBeVisible();
    await expect(canvas.getByText("Model A")).toBeVisible();
  },
});

export const LargeDataset = meta.story({
  name: "(Test) Large dataset",
  args: {
    chartType: "NUMBER",
    data: Array.from({ length: 2001 }, () => ({
      dimension: "Traces",
      metric: 1,
      time_dimension: undefined,
    })),
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: "I understand, proceed to render the chart",
      }),
    );
    await expect(canvas.getByTitle("2001")).toBeVisible();
  },
});
