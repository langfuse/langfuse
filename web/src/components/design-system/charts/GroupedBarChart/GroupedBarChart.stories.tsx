import preview from "../../../../../.storybook/preview";
import { expect, userEvent, within } from "storybook/test";
import { GroupedBarChart } from "./GroupedBarChart";

const meta = preview.meta({
  component: GroupedBarChart,
  parameters: { layout: "fullscreen" },
  args: {
    data: [
      { key: "False", values: { first: 12, second: 8 } },
      { key: "True", values: { first: 18, second: 10 } },
    ],
    series: [
      { id: "first", label: "First", color: "hsl(var(--chart-1))" },
      { id: "second", label: "Second", color: "hsl(var(--chart-2))" },
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

export const SideBySide = meta.story({
  name: "(Test) Side by Side",
  args: {
    legend: { visibility: "visible", interaction: "toggle", summary: "none" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = canvas.getByRole("graphics-symbol", { name: "First: 12" });
    const second = canvas.getByRole("graphics-symbol", { name: "Second: 8" });
    await expect(first.getBoundingClientRect().right).toBeLessThanOrEqual(
      second.getBoundingClientRect().left,
    );
    first.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("False");
    await expect(tooltip).toHaveTextContent("First");
    await expect(tooltip).toHaveTextContent("Second");
    const firstPosition = tooltip.getBoundingClientRect();
    second.focus();
    await expect(tooltip.getBoundingClientRect().left).toBeCloseTo(
      firstPosition.left,
      0,
    );
    await expect(tooltip.getBoundingClientRect().top).toBeCloseTo(
      firstPosition.top,
      0,
    );
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
    await userEvent.click(
      canvas.getByRole("button", { name: "Show only Second" }),
    );
    await expect(
      canvas.getByRole("graphics-symbol", { name: "First: 12" }),
    ).toHaveAttribute("fill", expect.stringContaining("20%"));
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(4);
    await userEvent.click(
      canvas.getByRole("button", { name: "Show all series" }),
    );
  },
});

export const LegendToggle = meta.story({
  name: "(Test) Legend Toggle",
  args: {
    legend: { visibility: "visible", interaction: "toggle", summary: "sum" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(4);
    await userEvent.click(canvas.getByRole("button", { name: "Hide Second" }));
    await expect(
      canvas.queryAllByRole("graphics-symbol", { name: /Second:/ }),
    ).toHaveLength(0);
    await userEvent.click(canvas.getByRole("button", { name: "Show Second" }));
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(4);
  },
});

export const NegativeAndMissingValues = meta.story({
  name: "(Test) Negative and Missing Values",
  args: {
    data: [
      { key: "Monday", values: { first: -12, second: 8 } },
      { key: "Tuesday", values: { first: null, second: 0 } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("graphics-symbol")).toHaveLength(3);
    await expect(
      canvas.getByRole("graphics-symbol", { name: "First: -12" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("graphics-symbol", { name: "Second: 0" }),
    ).toBeInTheDocument();
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
      values: { first: index + 1, second: index % 3 === 0 ? null : 10 },
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
    await expect(
      within(canvasElement).getAllByRole("graphics-symbol"),
    ).toHaveLength(100);
    await expect(
      canvasElement.querySelectorAll("[data-x-axis-label]").length,
    ).toBe(0);
    const svg = canvasElement.querySelector(
      "svg[aria-label='Grouped bar chart']",
    );
    const hoverArea = svg?.querySelector<SVGRectElement>(
      'rect[fill="transparent"]',
    );
    if (!svg || !hoverArea) throw new Error("Chart plot not found");
    await expect(
      Number(hoverArea.getAttribute("y")) +
        Number(hoverArea.getAttribute("height")),
    ).toBe(Number(svg.getAttribute("height")) - 12);
  },
});

export const LongCategoryLabels = meta.story({
  name: "(Test) Long Category Labels",
  args: {
    data: Array.from({ length: 3 }, (_, index) => ({
      key: `dataset-run-${index + 1}-transcription`,
      values: { first: index + 1, second: 12 - index },
    })),
  },
  decorators: [
    (Story) => (
      <div className="h-48 w-[320px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvasElement.querySelector("[data-x-axis-label]"),
    ).toHaveTextContent(/…$/);
    await userEvent.hover(
      canvas.getByRole("graphics-symbol", { name: "First: 1" }),
    );
    await expect(
      canvasElement.querySelector("[data-active-x-axis-label]"),
    ).toHaveTextContent("dataset-run-1-transcription");
    await expect(
      canvasElement.querySelector("[data-active-x-axis-label-background]"),
    ).not.toBeInTheDocument();
  },
});

export const FormattedValues = meta.story({
  name: "(Test) Formatted Values",
  args: {
    valueFormatter: (value) => `${value.toLocaleString()} scores`,
    tooltipFormatter: (key) => `Category: ${key}`,
  },
  play: async ({ canvasElement }) => {
    within(canvasElement)
      .getByRole("graphics-symbol", { name: "First: 12 scores" })
      .focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Category: False");
    await expect(tooltip).toHaveTextContent("12 scores");
  },
});

export const Empty = meta.story({ args: { data: [] } });
