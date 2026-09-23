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
    await expect(first).toHaveAttribute("rx", "0");
    await expect(
      Number(first.getAttribute("x")) + Number(first.getAttribute("width")) + 2,
    ).toBeCloseTo(Number(second.getAttribute("x")));
  },
});

export const SubtleFill = meta.story({
  args: { variant: "subtle" },
});

export const ManyBins = meta.story({
  args: {
    data: Array.from({ length: 20 }, (_, index) => ({
      label: `[${index * 10}, ${(index + 1) * 10}]`,
      value: 8 + index,
    })),
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
