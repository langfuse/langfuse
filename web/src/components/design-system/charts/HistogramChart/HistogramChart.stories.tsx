import preview from "../../../../../.storybook/preview";
import { expect, within } from "storybook/test";

import { HistogramChart } from "./HistogramChart";

const data = [
  { label: "[0, 10]", value: 12 },
  { label: "[10, 20]", value: 24 },
  { label: "[20, 30]", value: 18 },
];

const meta = preview.meta({
  component: HistogramChart,
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

export const HistogramBinSpacing = meta.story({
  name: "(Test) Histogram Bin Spacing",
  play: async ({ canvasElement }) => {
    const bars = within(canvasElement).getAllByRole("graphics-symbol");
    const first = bars[0];
    const second = bars[1];
    if (!first || !second) throw new Error("Histogram bins not found");
    await expect(first.getBoundingClientRect().right).toBeLessThan(
      second.getBoundingClientRect().left,
    );
  },
});

export const ManyBins = meta.story({
  args: {
    data: Array.from({ length: 20 }, (_, index) => ({
      label: `[${index * 10}, ${(index + 1) * 10}]`,
      value: 8 + index,
    })),
  },
});

const denseBins = Array.from({ length: 100 }, (_, index) => ({
  label: `Bin ${index + 1}`,
  value: index + 1,
}));

export const NarrowBins = meta.story({
  name: "(Test) Narrow Bins Remain Visible",
  args: { data: denseBins },
  decorators: [
    (Story) => (
      <div className="h-40 w-[240px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const bars = within(canvasElement).getAllByRole("graphics-symbol");
    await expect(bars).toHaveLength(100);
    for (const bar of bars) {
      await expect(Number(bar.getAttribute("width"))).toBeGreaterThan(0);
    }
  },
});

export const InsufficientSpace = meta.story({
  name: "(Test) Insufficient Space For Bins",
  args: { data: denseBins },
  decorators: [
    (Story) => (
      <div className="h-40 w-[100px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Insufficient space")).toBeInTheDocument();
  },
});

export const NormalDistribution = meta.story({
  args: {
    data: Array.from({ length: 31 }, (_, index) => {
      const x = (index - 15) / 3;
      return {
        label: `[${index - 15}, ${index - 14}]`,
        value: 100 * Math.exp(-0.5 * x * x),
      };
    }),
  },
});
