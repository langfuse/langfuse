import preview from "../../../../../.storybook/preview";
import { TimelineBar } from "./TimelineBar";
import { createTextMeasurer } from "../../fns/timeline/textMeasurer";
import { makeRow, makeTreeNode, cost } from "./__tests__/timeline.fixtures";

const meta = preview.meta({
  component: TimelineBar,
  args: {
    row: makeRow(),
    laneWidth: 640,
    measurer: createTextMeasurer(),
    isSelected: false,
    showDuration: true,
    showCostTokens: false,
    showScores: false,
    showComments: false,
    colorCodeMetrics: false,
  },
  // The bar positions itself absolutely on the time axis; host it in a
  // row-height relative track so its left offset renders in context.
  decorators: [
    (Story) => (
      <div className="bg-background relative h-[26px] w-[640px] rounded border">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

export const Selected = meta.story({
  args: { isSelected: true },
});

export const ZeroDuration = meta.story({
  args: {
    row: makeRow({
      node: makeTreeNode({
        endTime: new Date("2024-01-01T00:00:00.000Z"),
        latency: 0,
      }),
      width: 4,
      durationMs: 0,
      label: "0.00s",
      labelX: 70,
    }),
  },
});

export const Streaming = meta.story({
  args: {
    row: makeRow({ width: 260, firstTokenX: 150, labelX: 326 }),
  },
});

/** No room on either side of the bar, so the metric cluster is not drawn. */
export const LabelHidden = meta.story({
  args: {
    row: makeRow({ x: 636, width: 4, labelPlacement: "hidden" }),
  },
});

export const WithCostAndTokens = meta.story({
  args: {
    showCostTokens: true,
    row: makeRow({
      node: makeTreeNode({
        totalCost: cost(0.0021),
        inputUsage: 320,
        outputUsage: 140,
        totalUsage: 460,
      }),
    }),
  },
});

export const WithComments = meta.story({
  args: { showComments: true, commentCount: 3 },
});
