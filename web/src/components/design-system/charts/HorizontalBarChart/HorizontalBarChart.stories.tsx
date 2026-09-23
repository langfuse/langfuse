import preview from "../../../../../.storybook/preview";
import { expect, spyOn, userEvent, waitFor, within } from "storybook/test";

import { HorizontalBarChart } from "./HorizontalBarChart";

const meta = preview.meta({
  component: HorizontalBarChart,
  parameters: { layout: "fullscreen" },
  args: {
    data: [
      { label: "Alpha", value: 12 },
      { label: "Beta", value: -24 },
      { label: "Gamma", value: 6 },
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

export const FillsAvailableHeight = meta.story({
  name: "(Test) Fills Available Height",
  play: async ({ canvasElement }) => {
    const bars =
      canvasElement.querySelectorAll<SVGRectElement>("[data-bar-fill]");
    const svg = canvasElement.querySelector(
      "svg[aria-label='Horizontal bar chart']",
    );
    const first = bars[0];
    const last = bars[bars.length - 1];
    if (!first || !last || !svg) throw new Error("Chart bars not found");
    await expect(first.getAttribute("height")).toBe(
      last.getAttribute("height"),
    );
    const topGap = Number(first.getAttribute("y")) - 26;
    const bottomGap =
      Number(svg.getAttribute("height")) -
      12 -
      Number(last.getAttribute("y")) -
      Number(last.getAttribute("height"));
    await expect(topGap).toBeGreaterThan(1);
    await expect(bottomGap).toBeCloseTo(topGap, 0);
    if (Number(svg.getAttribute("height")) >= 600) {
      await expect(topGap).toBeGreaterThan(12);
    }
  },
});

export const LayoutAndCopy = meta.story({
  name: "(Test) Layout and Copy",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bars =
      canvasElement.querySelectorAll<SVGRectElement>("[data-bar-fill]");
    const widths = Array.from(bars, (bar) => Number(bar.getAttribute("width")));
    await expect(widths[0]).toBeCloseTo((widths[1] ?? 0) / 2);
    await expect(widths[2]).toBeCloseTo((widths[1] ?? 0) / 4);
    const rightTick = canvasElement.querySelector<SVGLineElement>(
      "[data-axis-tick]:last-child line",
    );
    const plotRight = Number(rightTick?.getAttribute("x1"));
    await expect(plotRight).toBeGreaterThan(
      Number(bars[1]?.getAttribute("width")),
    );
    const values = canvasElement.querySelectorAll<SVGTextElement>(
      'text[text-anchor="end"]',
    );
    await expect(values[0]?.getAttribute("x")).toBe(
      values[1]?.getAttribute("x"),
    );

    const bar = canvas.getByRole("graphics-symbol", { name: "Beta: -24" });
    const hoverArea = bar.parentElement?.querySelector<SVGRectElement>(
      "rect[fill='transparent'][aria-hidden='true']",
    );
    if (!hoverArea) throw new Error("Row hover area not found");
    await expect(Number(hoverArea.getAttribute("width"))).toBeGreaterThan(
      Number(bar.getAttribute("width")),
    );
    await userEvent.hover(hoverArea);
    const hoveredTooltip = await within(
      canvasElement.ownerDocument.body,
    ).findByRole("tooltip");
    await expect(hoveredTooltip).toHaveTextContent("Beta");
    bar.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Beta");
    await expect(tooltip).toHaveTextContent(
      "Click or press Enter to copy label",
    );
    await expect(
      tooltip.querySelector("svg.lucide-check")?.parentElement,
    ).toHaveClass("invisible");
    await expect(bars[0]).toHaveAttribute(
      "fill",
      expect.stringContaining("20%"),
    );

    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(bar);
      await expect(copy).toHaveBeenCalledWith("Beta");
      await expect(
        within(tooltip).getByText("Label copied to clipboard"),
      ).toBeVisible();
      bar.focus();
      await userEvent.keyboard("{Enter}");
      await expect(copy).toHaveBeenCalledTimes(2);
      await userEvent.click(hoverArea);
      await expect(copy).toHaveBeenCalledTimes(3);
    } finally {
      copy.mockRestore();
    }
  },
});

export const CategoryColors = meta.story({
  name: "(Test) Category Colors",
  args: {
    data: [
      { label: "Alpha", value: 12, color: "#3a3dee" },
      { label: "Beta", value: 24, color: "#07b9d5" },
    ],
  },
  play: async ({ canvasElement }) => {
    within(canvasElement)
      .getByRole("graphics-symbol", { name: "Beta: 24" })
      .focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip.querySelector("svg rect")).toHaveAttribute(
      "fill",
      "#07b9d5",
    );
  },
});

export const NarrowWithLongValues = meta.story({
  name: "(Test) Narrow With Long Values",
  args: {
    data: [
      { label: "Maximum", value: 1234567 },
      { label: "Small", value: 12345 },
      { label: "Nothing", value: 0 },
    ],
    valueFormatter: (value: number) => `${value.toLocaleString()} units`,
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-[320px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const ticks = Array.from(
      canvasElement.querySelectorAll<SVGTextElement>("[data-axis-tick] text"),
    );
    await expect(ticks.length).toBeGreaterThan(1);
    for (let index = 1; index < ticks.length; index++) {
      const previous = ticks[index - 1];
      const current = ticks[index];
      if (!previous || !current) throw new Error("Axis tick not found");
      await expect(current.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        previous.getBoundingClientRect().right,
      );
    }
    const value = within(canvasElement).getByText("1,234,567 units");
    await expect(value.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.getBoundingClientRect().right,
    );
  },
});

export const ZeroNegativeAndMissing = meta.story({
  name: "(Test) Zero, Negative and Missing",
  args: {
    data: [
      { label: "Positive", value: 8 },
      { label: "Negative", value: -4 },
      { label: "Zero", value: 0 },
      { label: "Missing", value: null },
    ],
  },
  play: async ({ canvasElement }) => {
    const fills =
      canvasElement.querySelectorAll<SVGRectElement>("[data-bar-fill]");
    await expect(Number(fills[1]?.getAttribute("width"))).toBeCloseTo(
      Number(fills[0]?.getAttribute("width")) / 2,
    );
    await expect(fills[2]).toHaveAttribute("width", "0");
    const zero = within(canvasElement).getByRole("graphics-symbol", {
      name: "Zero: 0",
    });
    await expect(Number(zero.getAttribute("width"))).toBeGreaterThanOrEqual(24);
    within(canvasElement)
      .getByRole("graphics-symbol", { name: "Missing: 0" })
      .focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Missing");
  },
});

export const LongAndDuplicateLabels = meta.story({
  name: "(Test) Long and Duplicate Labels",
  args: {
    data: [
      { label: "production-evaluation-run-with-a-very-long-name", value: 10 },
      { label: "Repeated label", value: 7 },
      { label: "Repeated label", value: 3 },
    ],
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-[280px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByRole("graphics-symbol", { name: /Repeated label:/ }),
    ).toHaveLength(2);
    canvas
      .getByRole("graphics-symbol", {
        name: "production-evaluation-run-with-a-very-long-name: 10",
      })
      .focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent(
      "production-evaluation-run-with-a-very-long-name",
    );
  },
});

export const TinyBarsBesideOutlier = meta.story({
  name: "(Test) Tiny Bars Beside Outlier",
  args: {
    data: [
      { label: "n/a", value: 101.21 },
      ...Array.from({ length: 19 }, (_, index) => ({
        label: `User ${index + 1}`,
        value: 0.31 - index * 0.004,
      })),
    ],
    valueFormatter: (value: number) => `$${value.toFixed(value < 1 ? 6 : 2)}`,
  },
  decorators: [
    (Story) => (
      <div className="h-[600px] w-[440px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const small = canvas.getByRole("graphics-symbol", {
      name: "User 1: $0.310000",
    });
    const row = small.parentElement;
    if (!row) throw new Error("Bar row not found");
    const bar = row.querySelector<SVGRectElement>("[data-bar-fill]");
    const label = within(row).getByText("User 1");
    const value = within(row).getByText("$0.310000");
    const leader = row.querySelector<SVGLineElement>("[data-leader-line]");
    if (!bar || !leader) throw new Error("Bar or leader not found");
    await expect(label.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      bar.getBoundingClientRect().right,
    );
    await expect(leader.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      label.getBoundingClientRect().right,
    );
    await expect(leader.getBoundingClientRect().right).toBeLessThanOrEqual(
      value.getBoundingClientRect().left,
    );
    const large = canvas.getByRole("graphics-symbol", { name: "n/a: $101.21" });
    large.focus();
    await waitFor(() => {
      expect(label).toHaveAttribute("fill", expect.stringContaining("40%"));
      expect(value).toHaveAttribute("fill", expect.stringContaining("40%"));
    });
  },
});

export const ManyRows = meta.story({
  name: "(Test) Many Rows",
  args: {
    data: Array.from({ length: 30 }, (_, index) => ({
      label: `Category ${index + 1}`,
      value: 30 - index,
    })),
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-[360px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const chart = canvasElement.querySelector<HTMLElement>(
      "[data-testid='top-list-chart']",
    );
    if (!chart) throw new Error("Chart not found");
    await expect(chart.scrollHeight).toBeGreaterThan(chart.clientHeight);
    const lastBar = within(canvasElement).getByRole("graphics-symbol", {
      name: "Category 30: 1",
    });
    await expect(Number(lastBar.getAttribute("height"))).toBeCloseTo(14, 0);
    lastBar.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Category 30");
  },
});

export const Empty = meta.story({ args: { data: [] } });
