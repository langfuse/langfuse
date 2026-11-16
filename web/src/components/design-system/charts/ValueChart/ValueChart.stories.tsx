import { expect } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { ValueChart } from "./ValueChart";

const meta = preview.meta({
  component: ValueChart,
  args: { variant: "default" },
  decorators: [
    (Story) => (
      <div className="h-40 w-80">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({
  args: { value: 1200 },
  name: "(Test) Default",
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1200")).toBeVisible();
  },
});
export const Loading = meta.story({ args: { variant: "loading" } });
export const Zero = meta.story({
  name: "(Test) Zero",
  args: { value: 0 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("0")).toBeVisible();
  },
});
export const Formatted = meta.story({
  name: "(Test) Formatted",
  args: {
    value: -1200,
    valueFormatter: () => ({
      negative: true,
      prefix: "$",
      main: "1.2",
      suffix: "K",
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1.2")).toBeVisible();
    await expect(canvas.getByText("-")).toBeVisible();
    await expect(canvas.getByText("K")).toBeVisible();
  },
});
