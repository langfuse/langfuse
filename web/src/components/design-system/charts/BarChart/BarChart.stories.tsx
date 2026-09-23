import preview from "../../../../../.storybook/preview";
import { expect, userEvent, within } from "storybook/test";

import { BarChart } from "./BarChart";

const data = [
  { label: "Alpha", value: 12 },
  { label: "Beta", value: 24 },
  { label: "Gamma", value: 18 },
];

const meta = preview.meta({
  component: BarChart,
  parameters: { layout: "fullscreen" },
  args: { data, zeroBaseline: true },
  decorators: [
    (Story) => (
      <div className="h-dvh w-full">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

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
    await expect(tooltip.querySelector("svg")).toBeNull();
    await expect(firstBar).toHaveAttribute("fill", "hsl(var(--chart-1))");
    await expect(
      canvas.getByRole("graphics-symbol", { name: "Beta: 24" }),
    ).toHaveAttribute("fill", expect.stringContaining("20%"));
    await userEvent.tab();
    await expect(
      canvas.getByRole("graphics-symbol", { name: "Beta: 24" }),
    ).toHaveFocus();
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
      canvas.getByTitle("production-evaluation-run-Alpha-with-a-long-name"),
    ).toBeVisible();
    await expect(
      canvas.queryAllByText("production-evaluation-run-Beta-with-a-long-name"),
    ).toHaveLength(1);
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

export const SubtleFill = meta.story({
  args: { variant: "subtle" },
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
    for (const label of canvasElement.querySelectorAll("[data-x-axis-label]")) {
      await expect(label).toHaveAttribute("text-anchor", "middle");
    }
    await expect(
      canvasElement.querySelector("[data-x-axis-label]"),
    ).toHaveTextContent(/…$/);
    await userEvent.hover(firstBar);
    await expect(
      canvasElement.querySelector("[data-active-x-axis-label]"),
    ).toHaveTextContent("production-evaluation-run-1-with-a-long-name");
    await expect(
      canvasElement.querySelector("[data-active-x-axis-label-background]"),
    ).toBeInTheDocument();
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
    await expect(
      canvasElement.querySelectorAll("[data-category-tick]"),
    ).toHaveLength(20);
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
