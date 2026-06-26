import preview from "../../../../../.storybook/preview";
import { TimelineBar } from "./TimelineBar";
import { makeTreeNode, makeMetrics, cost } from "./timeline.fixtures";

const meta = preview.meta({
  component: TimelineBar,
  args: {
    node: makeTreeNode(),
    metrics: makeMetrics(),
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
    node: makeTreeNode({
      endTime: new Date("2024-01-01T00:00:00.000Z"),
      latency: 0,
    }),
    metrics: makeMetrics({ itemWidth: 0, latency: 0 }),
  },
});

export const Streaming = meta.story({
  args: {
    metrics: makeMetrics({
      startOffset: 60,
      itemWidth: 260,
      firstTokenTimeOffset: 150,
    }),
  },
});

export const WithCostAndTokens = meta.story({
  args: {
    showCostTokens: true,
    node: makeTreeNode({
      totalCost: cost(0.0021),
      inputUsage: 320,
      outputUsage: 140,
      totalUsage: 460,
    }),
  },
});

export const WithComments = meta.story({
  args: { showComments: true, commentCount: 3 },
});
