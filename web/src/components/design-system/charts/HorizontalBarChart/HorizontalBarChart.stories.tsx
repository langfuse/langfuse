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

export const SideTooltip = meta.story({
  name: "(Test) Side Tooltip",
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole("graphics-symbol", {
      name: "Alpha: 12",
    });
    bar.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await waitFor(() => {
      const barBounds = bar.getBoundingClientRect();
      const tooltipBounds = tooltip.getBoundingClientRect();
      expect(
        tooltipBounds.left >= barBounds.right ||
          tooltipBounds.right <= barBounds.left,
      ).toBe(true);
    });
  },
});

export const HoverTransition = meta.story({
  name: "(Test) Hover Transition",
  play: async ({ canvasElement }) => {
    const bars =
      canvasElement.querySelectorAll<SVGRectElement>("[data-bar-fill]");
    const first = bars[0];
    const second = bars[1];
    if (!first || !second) throw new Error("Bars not found");
    const hoverArea = first.parentElement?.querySelector<SVGRectElement>(
      'rect[fill="transparent"][aria-hidden="true"]',
    );
    if (!hoverArea) throw new Error("Hover area not found");
    await userEvent.hover(hoverArea);
    await expect(second).toHaveAttribute(
      "fill",
      expect.stringContaining("20%"),
    );
  },
});

export const HoverAcrossRowGap = meta.story({
  name: "(Test) Hover Across Row Gap",
  play: async ({ canvasElement }) => {
    const bars =
      canvasElement.querySelectorAll<SVGRectElement>("[data-bar-fill]");
    const first = bars[0];
    const second = bars[1];
    const svg = canvasElement.querySelector<SVGSVGElement>(
      "svg[aria-label='Horizontal bar chart']",
    );
    if (!first || !second || !svg) throw new Error("Chart bars not found");
    const hoverArea = first.parentElement?.querySelector<SVGRectElement>(
      'rect[fill="transparent"][aria-hidden="true"]',
    );
    if (!hoverArea) throw new Error("Hover area not found");
    await userEvent.hover(hoverArea);
    const firstBounds = first.getBoundingClientRect();
    const secondBounds = second.getBoundingClientRect();
    const gapTarget = canvasElement.ownerDocument.elementFromPoint(
      firstBounds.left + 20,
      (firstBounds.bottom + secondBounds.top) / 2,
    );
    if (!gapTarget || !svg.contains(gapTarget)) {
      throw new Error("Gap is not part of the chart hit area");
    }
    await userEvent.hover(gapTarget);
    await expect(second).toHaveAttribute(
      "fill",
      expect.stringContaining("20%"),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByRole("tooltip"),
    ).toHaveTextContent("Alpha");
    const secondHoverArea = second.parentElement?.querySelector<SVGRectElement>(
      'rect[fill="transparent"][aria-hidden="true"]',
    );
    if (!secondHoverArea) throw new Error("Second hover area not found");
    await userEvent.hover(secondHoverArea);
    await expect(first).toHaveAttribute("fill", expect.stringContaining("20%"));
    await userEvent.unhover(secondHoverArea);
    await expect(first).not.toHaveAttribute(
      "fill",
      expect.stringContaining("20%"),
    );
  },
});

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
    const topGap = Number(first.getAttribute("y")) - 26;
    const bottomGap =
      Number(svg.getAttribute("height")) -
      12 -
      Number(last.getAttribute("y")) -
      Number(last.getAttribute("height"));
    await expect(topGap).toBeGreaterThan(1);
    await expect(bottomGap).toBeCloseTo(topGap, 0);
  },
});

export const CenteredRowText = meta.story({
  name: "(Test) Centered Row Text",
  play: async ({ canvasElement }) => {
    const bars =
      canvasElement.querySelectorAll<SVGRectElement>("[data-bar-fill]");
    for (const bar of bars) {
      const row = bar.parentElement;
      const texts = row?.querySelectorAll<SVGTextElement>("text");
      if (!texts || texts.length !== 2) throw new Error("Row text not found");
      const barBounds = bar.getBoundingClientRect();
      const barCenter = (barBounds.top + barBounds.bottom) / 2;
      for (const text of texts) {
        const bounds = text.getBoundingClientRect();
        await expect(
          Math.abs((bounds.top + bounds.bottom) / 2 - barCenter),
        ).toBeLessThan(2);
      }
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

    const bar = canvas.getByRole("graphics-symbol", { name: "Beta: -24" });
    const hoverArea = bar.parentElement?.querySelector<SVGRectElement>(
      "rect[fill='transparent'][aria-hidden='true']",
    );
    if (!hoverArea) throw new Error("Row hover area not found");
    await userEvent.hover(hoverArea);
    const hoveredTooltip = await within(
      canvasElement.ownerDocument.body,
    ).findByRole("tooltip");
    await expect(hoveredTooltip).toHaveTextContent("Beta");
    bar.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent(
      "Click or press Enter to copy label",
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
    const rightGridline = canvasElement.querySelector<SVGLineElement>(
      "[data-axis-tick]:last-child line",
    );
    const nothing = within(canvasElement).getByRole("graphics-symbol", {
      name: "Nothing: 0 units",
    });
    const row = nothing.parentElement;
    const leader = row?.querySelector<SVGLineElement>("[data-leader-line]");
    if (!rightGridline || !leader) {
      throw new Error("Leader or gridline not found");
    }
    await expect(Number(leader.getAttribute("x2"))).toBeGreaterThan(
      Number(rightGridline.getAttribute("x1")),
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

export const LabelOnRoomierSide = meta.story({
  name: "(Test) Label On Roomier Side",
  args: {
    data: [
      { label: "A long label that cannot fit in this bar", value: 100 },
      { label: "A long label that cannot fit in this bar", value: 70 },
      { label: "A long label that cannot fit in this bar", value: 10 },
    ],
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-[440px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const bars =
      canvasElement.querySelectorAll<SVGRectElement>("[data-bar-fill]");
    const labels =
      canvasElement.querySelectorAll<SVGTextElement>("[data-row-label]");
    const large = bars[1];
    const largeLabel = labels[1];
    const small = bars[2];
    const smallLabel = labels[2];
    if (!large || !largeLabel || !small || !smallLabel) {
      throw new Error("Chart rows not found");
    }
    await expect(largeLabel.getBoundingClientRect().left).toBeLessThan(
      large.getBoundingClientRect().right,
    );
    await expect(
      smallLabel.getBoundingClientRect().left,
    ).toBeGreaterThanOrEqual(small.getBoundingClientRect().right);
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

export const LeaderEndpoints = meta.story({
  name: "(Test) Leader Endpoints",
  args: {
    data: [
      { label: "niklas@langfuse.com", value: 2032.81 },
      { label: "tobias.wo...", value: 1762 },
      { label: "valeriy.meleshkin@clickhouse.com", value: 442.94 },
      { label: "n/a", value: 77.15 },
      { label: "fair-regression", value: 0.191997 },
    ],
    valueFormatter: (value: number) => `$${value.toLocaleString()}`,
  },
  decorators: [
    (Story) => (
      <div className="h-72 w-[800px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const bars =
      canvasElement.querySelectorAll<SVGRectElement>("[data-bar-fill]");
    let visibleLeaders = 0;
    for (const bar of bars) {
      const row = bar.parentElement;
      const leader = row?.querySelector<SVGLineElement>("[data-leader-line]");
      if (!leader) throw new Error("Leader not found");
      if (leader.getAttribute("visibility") === "visible") {
        visibleLeaders++;
      }
    }
    await expect(visibleLeaders).toBeGreaterThan(0);
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
    lastBar.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Category 30");
  },
});

export const Empty = meta.story({ args: { data: [] } });
