import { Info } from "lucide-react";
import { expect, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { TotalMetric } from "./TotalMetric";

const meta = preview.meta({
  component: TotalMetric,
});

export default meta;

export const Default = meta.story({
  args: {
    metric: "434.15K",
    description: "Total traces tracked",
  },
});

export const Currency = meta.story({
  args: {
    metric: "$9,753.19",
    description: "Total cost",
  },
});

export const WithInfoIcon = meta.story({
  args: {
    metric: "$9,753.19",
    description: "Total cost",
    children: <Info className="text-muted-foreground h-3 w-3" />,
  },
});

// Dashboard tiles sit three-across, so the metric used to share a row with
// its label and wrap into a stacked word list. The label now sits under the
// number even in a tile-width container.
export const TestStacksLabelUnderMetric = meta.story({
  name: "(Test) Stacks label under metric",
  render: () => (
    <div className="w-60">
      <TotalMetric metric="434.15K" description="Total traces tracked" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const metric = canvas.getByText("434.15K");
    const description = canvas.getByText("Total traces tracked");
    const metricRect = metric.getBoundingClientRect();
    const descriptionRect = description.getBoundingClientRect();

    await expect(descriptionRect.top).toBeGreaterThanOrEqual(
      metricRect.bottom - 1,
    );
    await expect(Math.abs(descriptionRect.left - metricRect.left)).toBeLessThan(
      2,
    );
    await expect(descriptionRect.height).toBeLessThan(metricRect.height);
  },
});
