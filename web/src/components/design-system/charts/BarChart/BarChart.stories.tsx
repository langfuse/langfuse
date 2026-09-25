import preview from "../../../../../.storybook/preview";
import { expect, spyOn, userEvent, within } from "storybook/test";

import { BarChart } from "./BarChart";

const data = [
  { label: "Alpha", value: 12 },
  { label: "Beta", value: 24 },
  { label: "Gamma", value: 18 },
];

const meta = preview.meta({
  component: BarChart,
  parameters: { layout: "fullscreen" },
  args: { data },
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

export const PositiveBaseline = meta.story({
  name: "(Test) Positive Baseline",
  play: async ({ canvasElement }) => {
    const bars = within(canvasElement).getAllByRole("graphics-symbol");
    const smallestBar = bars[0];
    if (!smallestBar) throw new Error("Bar not found");
    await expect(Number(smallestBar.getAttribute("height"))).toBeGreaterThan(1);
  },
});

export const KeyboardFocus = meta.story({
  name: "(Test) Keyboard Focus",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstBar = canvas.getByRole("graphics-symbol", { name: "Alpha: 12" });
    firstBar.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Alpha");
    await expect(tooltip).toHaveTextContent("12");
    await expect(tooltip).toHaveTextContent(
      "Click or press Enter to copy label",
    );
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(firstBar);
      await expect(copy).toHaveBeenCalledWith("Alpha");
      firstBar.focus();
      await userEvent.keyboard("{Enter}");
      await expect(copy).toHaveBeenCalledTimes(2);
    } finally {
      copy.mockRestore();
    }
    await userEvent.tab();
    await expect(
      canvas.getByRole("graphics-symbol", { name: "Beta: 24" }),
    ).toHaveFocus();
  },
});

export const CategoryHoverArea = meta.story({
  name: "(Test) Category Hover Area",
  play: async ({ canvasElement }) => {
    const area = canvasElement.querySelector<SVGRectElement>(
      "[data-bar-hover-area]",
    );
    if (!area) throw new Error("Hover area not found");
    await userEvent.hover(area);
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Alpha");
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await userEvent.click(area);
      await expect(copy).toHaveBeenCalledWith("Alpha");
    } finally {
      copy.mockRestore();
    }
  },
});

export const CategoryColors = meta.story({
  args: {
    data: data.map((item, index) => ({
      ...item,
      color: ["#3a3dee", "#07b9d5", "#f18a42"][index],
    })),
    legend: {
      items: data.map((item, index) => ({
        id: item.label,
        label: item.label,
        color: ["#3a3dee", "#07b9d5", "#f18a42"][index] ?? "",
      })),
    },
  },
});

export const CategoryColorTooltip = meta.story({
  name: "(Test) Category Color Tooltip",
  args: {
    data: data.map((item, index) => ({
      ...item,
      color: ["#3a3dee", "#07b9d5", "#f18a42"][index],
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole("graphics-symbol", { name: "Alpha: 12" }).focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip.querySelector("svg rect")).toHaveAttribute(
      "fill",
      "#3a3dee",
    );
  },
});

export const CategoryColorsWithoutLegend = meta.story({
  args: {
    data: data.map((item, index) => ({
      ...item,
      color: ["#3a3dee", "#07b9d5", "#f18a42"][index],
    })),
  },
});

export const CompactLegend = meta.story({
  name: "(Test) Compact Legend",
  args: {
    hideXAxisLabels: true,
    data: data.map((item, index) => ({
      ...item,
      label: `production-evaluation-run-${item.label}-with-a-long-name`,
      color: ["#3a3dee", "#07b9d5", "#f18a42"][index],
    })),
    legend: {
      items: data.map((item, index) => ({
        id: item.label,
        label: `production-evaluation-run-${item.label}-with-a-long-name`,
        color: ["#3a3dee", "#07b9d5", "#f18a42"][index] ?? "",
      })),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas
        .getAllByTitle("production-evaluation-run-Alpha-with-a-long-name")
        .some((item) => !item.closest('[aria-hidden="true"]')),
    ).toBe(true);
    await expect(
      canvasElement.querySelectorAll("[data-x-axis-label]"),
    ).toHaveLength(0);
  },
});

export const ManyCategories = meta.story({
  args: {
    data: Array.from({ length: 9 }, (_, index) => ({
      label: `Run ${index + 1}`,
      value: 10 + index,
    })),
  },
});

export const LongLabels = meta.story({
  name: "(Test) Long Labels",
  args: {
    data: Array.from({ length: 12 }, (_, index) => ({
      label: `production-evaluation-run-${index + 1}-with-a-long-name`,
      value: 12 + index,
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstBar = canvas.getAllByRole("graphics-symbol")[0];
    if (!firstBar) throw new Error("Bar not found");
    await expect(
      canvasElement.querySelector("[data-x-axis-label]"),
    ).toHaveTextContent(/…$/);
    await userEvent.hover(firstBar);
    await expect(
      canvasElement.querySelector("[data-active-x-axis-label]"),
    ).toHaveTextContent("production-evaluation-run-1-with-a-long-name");
  },
});

export const EdgeLabels = meta.story({
  name: "(Test) Edge Labels",
  args: {
    data: [
      { label: "production-evaluation-run-Alpha-with-a-long-name", value: 12 },
      { label: "production-evaluation-run-Beta-with-a-long-name", value: 24 },
    ],
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-[300px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    for (const bar of within(canvasElement).getAllByRole("graphics-symbol")) {
      await userEvent.hover(bar);
      const label = canvasElement.querySelector<SVGTextElement>(
        "[data-active-x-axis-label]",
      );
      if (!label) throw new Error("Active label not found");
      const chartWidth = label.ownerSVGElement?.width.baseVal.value ?? 0;
      const bounds = label.getBBox();
      await expect(bounds.x).toBeGreaterThanOrEqual(0);
      await expect(bounds.x + bounds.width).toBeLessThanOrEqual(chartWidth);
    }
  },
});

export const FullyTruncatedLabels = meta.story({
  name: "(Test) Fully Truncated Labels",
  args: {
    data: Array.from({ length: 20 }, (_, index) => ({
      label: `Experiment ${index + 1}`,
      value: index + 1,
    })),
  },
  decorators: [
    (Story) => (
      <div className="h-40 w-[300px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvasElement.querySelectorAll("[data-x-axis-label]"),
    ).toHaveLength(0);
    const firstBar = canvas.getByRole("graphics-symbol", {
      name: "Experiment 1: 1",
    });
    firstBar.focus();
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Experiment 1");
  },
});

export const NegativeValues = meta.story({
  args: {
    data: [
      { label: "Increase", value: 8 },
      { label: "Decrease", value: -5 },
      { label: "No data", value: null },
    ],
  },
});

export const Empty = meta.story({ args: { data: [] } });
