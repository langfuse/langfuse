import { expect, userEvent } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { ChartCanvas } from "./ChartCanvas";
import { type ComponentProps } from "react";

const meta = preview.meta({
  component: ChartCanvas,
  args: {
    chartType: "LINE_TIME_SERIES",
    breakdown: "none",
    aggregation: "count",
    metricLabel: "Count",
    emptyMessage: "No matching observations",
    data: [],
  } satisfies ComponentProps<typeof ChartCanvas>,
  decorators: [
    (Story) => (
      <div className="h-96 w-full max-w-2xl">
        <Story />
      </div>
    ),
  ],
});

export const Empty = meta.story({
  name: "(Test) Empty and null measurements",
  render: (args) => (
    <div className="grid h-full grid-cols-3 gap-4">
      {(
        ["LINE_TIME_SERIES", "AREA_TIME_SERIES", "BAR_TIME_SERIES"] as const
      ).map((chartType) => (
        <div key={chartType} className="grid grid-rows-2 gap-4">
          <ChartCanvas {...args} chartType={chartType} data={[]} />
          <ChartCanvas
            {...args}
            chartType={chartType}
            data={[undefined, "series-a"].map((dimension) => ({
              time_dimension: "2026-01-01T00:00:00Z",
              dimension,
              metric: null,
            }))}
          />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas, args }) => {
    const messages = canvas.getAllByText(args.emptyMessage);
    await expect(messages).toHaveLength(6);
    for (const message of messages) await expect(message).toBeVisible();
  },
});

export const Zero = meta.story({
  name: "(Test) Zero measurements",
  args: {
    data: [undefined, "series-a"].map((dimension) => ({
      time_dimension: "2026-01-01T00:00:00Z",
      dimension,
      metric: 0,
    })),
  },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvas.queryByText(args.emptyMessage)).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("svg")).toBeVisible();
  },
});

export const LargeDataset = meta.story({
  name: "(Test) Large dataset confirmation",
  args: {
    data: Array.from({ length: 2001 }, () => ({
      time_dimension: "2026-01-01T00:00:00Z",
      dimension: undefined,
      metric: 1,
    })),
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Large Dataset Warning")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: /proceed|render|continue/i }),
    );
    await expect(
      canvas.queryByText("Large Dataset Warning"),
    ).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("svg")).toBeVisible();
  },
});
