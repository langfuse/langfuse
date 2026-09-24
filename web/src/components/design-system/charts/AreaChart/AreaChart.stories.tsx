import preview from "../../../../../.storybook/preview";
import { expect, userEvent, within } from "storybook/test";
import { AreaChart } from "./AreaChart";
import { type LineChartLegend } from "../LineChart/LineChart";
import { AreaChartTimeSeries } from "@/src/features/widgets/chart-library/AreaChartTimeSeries";

const series = [
  { id: "api", label: "API", color: "#3a3dee" },
  { id: "worker", label: "Worker", color: "#07b9d5" },
];

const data = Array.from({ length: 14 }, (_, index) => ({
  x: new Date(Date.UTC(2026, 8, index + 1)),
  values: {
    api: 18 + index * 2 + Math.sin(index) * 8,
    worker: 42 - index + Math.cos(index) * 6,
  },
}));

const gaps = [
  { x: new Date(Date.UTC(2026, 8, 1)), values: { api: 8, worker: null } },
  { x: new Date(Date.UTC(2026, 8, 2)), values: { api: null, worker: null } },
  { x: new Date(Date.UTC(2026, 8, 3)), values: { api: 12, worker: 4 } },
  { x: new Date(Date.UTC(2026, 8, 4)), values: { api: null, worker: 9 } },
  { x: new Date(Date.UTC(2026, 8, 5)), values: { api: 16, worker: null } },
];

type StoryProps = {
  scenario?:
    | "single"
    | "time"
    | "stacked"
    | "gaps"
    | "negative"
    | "category"
    | "denseCategory"
    | "mixedBuckets";
  connectNulls?: boolean;
  legend?: LineChartLegend;
};

function AreaChartDemo({
  scenario = "single",
  connectNulls,
  legend,
}: StoryProps) {
  if (scenario === "mixedBuckets") {
    return (
      <AreaChartTimeSeries
        data={[
          { time_dimension: "2026-09-01", dimension: "api", metric: 12 },
          { time_dimension: "2026-09-02", dimension: "api", metric: 18 },
          { time_dimension: "Unknown", dimension: "api", metric: 7 },
        ]}
      />
    );
  }
  if (scenario === "denseCategory") {
    return (
      <AreaChart
        data={Array.from({ length: 80 }, (_, index) => ({
          x: `Category ${index}`,
          values: { api: index },
        }))}
        series={series.slice(0, 1)}
        xAxis={{ type: "category" }}
      />
    );
  }
  if (scenario === "category") {
    return (
      <AreaChart
        data={[
          { x: "Development", values: { api: 12, worker: 7 } },
          { x: "Staging", values: { api: 26, worker: 14 } },
          { x: "Production", values: { api: 43, worker: 31 } },
        ]}
        series={series}
        xAxis={{ type: "category" }}
        legend={legend}
      />
    );
  }

  const chartData =
    scenario === "gaps"
      ? gaps
      : scenario === "negative"
        ? data.map((datum, index) => ({
            ...datum,
            values: { api: index * 3 - 18, worker: 12 - index * 2 },
          }))
        : data;

  return (
    <AreaChart
      data={chartData}
      series={scenario === "single" ? series.slice(0, 1) : series}
      xAxis={{ type: "time" }}
      valueFormatter={(value) => `${value.toFixed(1)} requests`}
      stacked={scenario === "stacked"}
      connectNulls={connectNulls}
      legend={legend}
    />
  );
}

const meta = preview.meta({
  component: AreaChartDemo,
  parameters: { layout: "fullscreen" },
  args: {},
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

export const DenseCategories = meta.story({
  args: { scenario: "denseCategory" },
  play: async ({ canvasElement }) => {
    const labels = canvasElement.querySelectorAll('[data-x-axis-label=""]');
    await expect(labels.length).toBeGreaterThan(1);
    await expect(labels.length).toBeLessThan(80);
    await expect(labels[0]).toHaveTextContent("Category");
  },
});

export const MixedBuckets = meta.story({
  args: { scenario: "mixedBuckets" },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("graphics-symbol", {
        name: /Unknown.*7/,
      }),
    ).toBeInTheDocument();
  },
});

export const OverlappingAreas = meta.story({
  name: "(Test) Overlapping Areas",
  args: { scenario: "time" },
  play: async ({ canvasElement }) => {
    const fills = canvasElement.querySelectorAll<SVGPathElement>(
      'path[fill^="url(#"]',
    );
    await expect(fills).toHaveLength(2);
    const stops = canvasElement.querySelectorAll(
      'linearGradient stop[stop-color^="color-mix"]',
    );
    await expect(stops).toHaveLength(4);
    await expect(stops[0]).toHaveAttribute(
      "stop-color",
      "color-mix(in srgb, #3a3dee 75%, hsl(var(--background)))",
    );
    await expect(stops[2]).toHaveAttribute(
      "stop-color",
      "color-mix(in srgb, #07b9d5 75%, hsl(var(--background)))",
    );
    for (const fill of fills) {
      await expect(fill).not.toHaveAttribute("fill-opacity");
      await expect(fill.getAttribute("fill")).toMatch(/^url\(#.+\)$/);
    }
    const hoverArea = canvasElement.querySelector<SVGRectElement>(
      'rect[fill="transparent"]',
    );
    if (!hoverArea) throw new Error("Hover area not found");
    await userEvent.hover(hoverArea);
    await expect(stops[0]).toHaveAttribute(
      "stop-color",
      "color-mix(in srgb, #3a3dee 75%, hsl(var(--background)))",
    );
    await expect(stops[2]).toHaveAttribute(
      "stop-color",
      "color-mix(in srgb, #07b9d5 75%, hsl(var(--background)))",
    );
    for (const stroke of canvasElement.querySelectorAll('path[stroke^="#"]')) {
      await expect(stroke).toHaveAttribute("stroke-width", "2.5");
    }
  },
});

export const StackedAreas = meta.story({
  args: {
    scenario: "stacked",
    legend: { visibility: "visible", interaction: "toggle", summary: "sum" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const apiPoint = canvas.getAllByRole("graphics-symbol", { name: /API/ })[0];
    const workerPoint = canvas.getAllByRole("graphics-symbol", {
      name: /Worker/,
    })[0];
    if (!apiPoint || !workerPoint) throw new Error("Data points not found");
    await expect(Number(workerPoint.getAttribute("cy"))).toBeLessThan(
      Number(apiPoint.getAttribute("cy")),
    );
    const workerFill = canvasElement.querySelectorAll<SVGPathElement>(
      'path[fill^="url(#"]',
    )[1];
    const baseline = workerFill?.getAttribute("d")?.match(/L[\d.]+,([\d.]+)Z$/);
    await expect(Number(baseline?.[1])).toBeCloseTo(
      Number(apiPoint.getAttribute("cy")),
      0,
    );
    workerPoint.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Worker");
    await expect(tooltip).toHaveTextContent("48.0 requests");
    await userEvent.click(
      await canvas.findByRole("button", { name: "Hide API" }),
    );
    await expect(
      canvasElement.querySelectorAll('path[fill^="url(#"]'),
    ).toHaveLength(1);
  },
});

export const WithLegend = meta.story({
  args: {
    scenario: "time",
    legend: { visibility: "visible", interaction: "toggle", summary: "sum" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const api = await canvas.findByRole("button", { name: "Hide API" });
    await expect(api).toHaveTextContent("Sum:");
    await userEvent.click(api);
    await expect(
      canvas.getByRole("button", { name: "Show API" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      canvasElement.querySelector('linearGradient stop[stop-color*="#3a3dee"]'),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show API" }));
    await expect(
      canvasElement.querySelector('linearGradient stop[stop-color*="#3a3dee"]'),
    ).toBeInTheDocument();
  },
});

export const HighlightLegend = meta.story({
  args: {
    scenario: "time",
    legend: {
      visibility: "visible",
      interaction: "highlight",
      summary: "none",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Show only API" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Show all series" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvasElement.querySelector('linearGradient stop[stop-color*="#07b9d5"]'),
    ).toHaveAttribute(
      "stop-color",
      "color-mix(in srgb, #07b9d5 15%, hsl(var(--background)))",
    );
  },
});

export const LimitedVisibleSeries = meta.story({
  args: {
    scenario: "time",
    legend: {
      visibility: "visible",
      interaction: "toggle",
      summary: "none",
      maxVisibleSeries: 1,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvasElement.querySelectorAll('path[fill^="url(#"]'),
    ).toHaveLength(1);
    await expect(
      await canvas.findByRole("button", { name: /Show (API|Worker)/ }),
    ).toHaveAttribute("aria-pressed", "false");
  },
});

export const GapsAndIsolatedPoints = meta.story({
  args: { scenario: "gaps" },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelectorAll('circle[fill="#3a3dee"][r="4"]'),
    ).toHaveLength(3);
    const firstPoint = within(canvasElement).getByRole("graphics-symbol", {
      name: /API 8\.0 requests/,
    });
    firstPoint.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("8.0 requests");
  },
});

export const ConnectNulls = meta.story({
  args: { scenario: "gaps", connectNulls: true },
});

export const NegativeValues = meta.story({
  args: { scenario: "negative" },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector("[data-zero-baseline]"),
    ).toBeInTheDocument();
  },
});

export const Categories = meta.story({ args: { scenario: "category" } });
