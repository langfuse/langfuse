import preview from "../../../../../.storybook/preview";
import { expect, userEvent, within } from "storybook/test";

import { StackedBarChart } from "./StackedBarChart";

const meta = preview.meta({
  component: StackedBarChart,
  parameters: { layout: "fullscreen" },
  args: {
    data: [
      { key: "Monday", values: { api: 12, worker: 8 } },
      { key: "Tuesday", values: { api: 18, worker: null } },
      { key: "Wednesday", values: { api: 10, worker: 15 } },
    ],
    series: [
      { id: "api", label: "API", color: "hsl(var(--chart-1))" },
      { id: "worker", label: "Worker", color: "hsl(var(--chart-2))" },
    ],
  },
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

export const StackingAndTooltip = meta.story({
  name: "(Test) Stacking and Tooltip",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const api = canvas.getAllByRole("graphics-symbol", { name: "API: 12" })[0];
    const worker = canvas.getByRole("graphics-symbol", { name: "Worker: 8" });
    if (!api) throw new Error("API bar missing");
    await expect(
      Number(worker.getAttribute("y")) + Number(worker.getAttribute("height")),
    ).toBeCloseTo(Number(api.getAttribute("y")), 0);
    worker.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Monday");
    await expect(tooltip).toHaveTextContent("API");
    await expect(tooltip).toHaveTextContent("Worker");
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(5);
  },
});

export const NegativeValues = meta.story({
  name: "(Test) Negative Values",
  args: {
    data: [{ key: "Monday", values: { api: -12, worker: 8 } }],
  },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector("[data-zero-baseline]"),
    ).toBeInTheDocument();
  },
});

export const LegendToggle = meta.story({
  name: "(Test) Legend Toggle and Summary",
  args: {
    legend: {
      visibility: "visible",
      interaction: "toggle",
      summary: "sum",
      maxVisibleSeries: 1,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryAllByRole("graphics-symbol", { name: /Worker:/ }),
    ).toHaveLength(0);
    await expect(
      canvas.getByRole("button", { name: "Show Worker" }),
    ).toHaveTextContent("Sum: 23");
    await userEvent.click(canvas.getByRole("button", { name: "Show Worker" }));
    await expect(
      canvas.getAllByRole("graphics-symbol", { name: /Worker:/ }),
    ).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Hide API" }));
    await expect(
      canvas.queryAllByRole("graphics-symbol", { name: /API:/ }),
    ).toHaveLength(0);
  },
});

export const LegendHighlight = meta.story({
  name: "(Test) Legend Highlight",
  args: {
    legend: {
      visibility: "visible",
      interaction: "highlight",
      summary: "none",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const api = canvas.getByRole("graphics-symbol", { name: "API: 12" });
    const worker = canvas.getByRole("graphics-symbol", { name: "Worker: 8" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Show only Worker" }),
    );
    await expect(api).toHaveAttribute(
      "fill",
      "color-mix(in srgb, hsl(var(--chart-1)) 20%, hsl(var(--background)))",
    );
    await expect(worker).toHaveAttribute("fill", "hsl(var(--chart-2))");
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(5);
    await userEvent.click(
      canvas.getByRole("button", { name: "Show all series" }),
    );
    await expect(api).toHaveAttribute("fill", "hsl(var(--chart-1))");
  },
});

export const Empty = meta.story({
  args: { data: [] },
});

export const SingleSeriesAutoLegend = meta.story({
  name: "(Test) Single Series Auto Legend",
  args: {
    series: [{ id: "api", label: "API", color: "hsl(var(--chart-1))" }],
    legend: { visibility: "auto", interaction: "highlight", summary: "none" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Show only API" }),
    ).toBeNull();
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(3);
  },
});

export const SingleSeriesInitiallyHidden = meta.story({
  name: "(Test) Single Series Initially Hidden",
  args: {
    series: [{ id: "api", label: "API", color: "hsl(var(--chart-1))" }],
    legend: {
      visibility: "auto",
      interaction: "toggle",
      summary: "none",
      maxVisibleSeries: 0,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryAllByRole("graphics-symbol")).toHaveLength(0);
    await userEvent.click(canvas.getByRole("button", { name: "Show API" }));
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(3);
  },
});

export const MissingBuckets = meta.story({
  name: "(Test) Missing Buckets",
  args: {
    data: [
      { key: "Monday", values: { api: null, worker: null } },
      { key: "Tuesday", values: { api: 0, worker: null } },
      { key: "Wednesday", values: { api: 10, worker: 5 } },
    ],
    legend: { visibility: "visible", interaction: "toggle", summary: "sum" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(3);
    const zero = canvas.getByRole("graphics-symbol", { name: "API: 0" });
    await expect(zero).not.toHaveAttribute("clip-path");
    await expect(zero).toHaveAttribute("height", "1");
    await expect(
      canvas.getByRole("button", { name: "Hide API" }),
    ).toHaveTextContent("Sum: 10");
    await expect(
      canvas.getByRole("button", { name: "Hide Worker" }),
    ).toHaveTextContent("Sum: 5");
  },
});

export const NegativeStack = meta.story({
  name: "(Test) Negative Stack",
  args: {
    data: [{ key: "Monday", values: { api: -12, worker: -8 } }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const api = canvas.getByRole("graphics-symbol", { name: "API: -12" });
    const worker = canvas.getByRole("graphics-symbol", { name: "Worker: -8" });
    await expect(Number(worker.getAttribute("y"))).toBeCloseTo(
      Number(api.getAttribute("y")) + Number(api.getAttribute("height")),
      0,
    );
    await expect(
      canvasElement.querySelector("[data-zero-baseline]"),
    ).toBeInTheDocument();
  },
});

export const ManyBuckets = meta.story({
  name: "(Test) Many Buckets",
  args: {
    data: Array.from({ length: 60 }, (_, index) => ({
      key: `Bucket ${index + 1}`,
      values: { api: index + 1, worker: index % 3 === 0 ? null : 10 },
    })),
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-[320px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const labels = Array.from(
      canvasElement.querySelectorAll<SVGTextElement>("[data-x-axis-label]"),
    );
    await expect(labels.length).toBeGreaterThan(1);
    for (let index = 1; index < labels.length; index++) {
      const previous = labels[index - 1];
      const current = labels[index];
      if (!previous || !current) throw new Error("Axis label missing");
      await expect(current.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        previous.getBoundingClientRect().right,
      );
    }
    await expect(labels.at(-1)).toHaveTextContent("Bucket 60");
  },
});

export const SyncedBucket = meta.story({
  name: "(Test) Synced Bucket",
  args: {
    sync: { activeKey: "Tuesday", onActiveKeyChange: () => undefined },
  },
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector("[data-active-reference-line]");
    const bar = within(canvasElement).getByRole("graphics-symbol", {
      name: "API: 18",
    });
    if (!line) throw new Error("Active reference line missing");
    await expect(Number(line.getAttribute("x1"))).toBeCloseTo(
      Number(bar.getAttribute("x")) + Number(bar.getAttribute("width")) / 2,
    );
  },
});

export const LongCategoryLabels = meta.story({
  name: "(Test) Long category labels",
  args: {
    data: Array.from({ length: 12 }, (_, index) => ({
      key: `dataset-run-${index + 1}-transcription`,
      values: { api: index + 1 },
    })),
    tickFormatter: (key) => `${key.slice(0, 23)}…`,
    categoryXAxisLabels: true,
  },
  decorators: [
    (Story) => (
      <div className="h-48 w-[320px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const labels = canvasElement.querySelectorAll<SVGTextElement>(
      "[data-x-axis-label]",
    );
    await expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      await expect(label).not.toHaveAttribute("transform");
      await expect(label.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        0,
      );
    }
  },
});

export const NarrowTemporalTicks = meta.story({
  name: "(Test) Narrow temporal tick spacing",
  args: {
    data: Array.from({ length: 24 }, (_, index) => ({
      key: `2026-09-${String(index + 1).padStart(2, "0")}`,
      values: { api: index + 1 },
    })),
    tickFormatter: (key) => key.slice(5),
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-[320px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const labels = canvasElement.querySelectorAll("[data-x-axis-label]");
    await expect(labels.length).toBeLessThanOrEqual(5);
  },
});
