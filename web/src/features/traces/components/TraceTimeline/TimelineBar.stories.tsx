import { expect, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineBar } from "./TimelineBar";
import { createTextMeasurer } from "../../fns/timeline/textMeasurer";
import {
  makeRow,
  makeTreeNode,
  cost,
  score,
} from "./__tests__/timeline.fixtures";

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

/** No room on either side of the bar, so nothing in the cluster fits. */
export const LabelHidden = meta.story({
  args: {
    row: makeRow({ x: 636, width: 4, labelPlacement: "hidden" }),
  },
});

/**
 * An in-flight span has no duration to label, but it can still have a comment,
 * a cost or a score — and room in the lane to show them.
 */
export const InFlightWithComments = meta.story({
  name: "(Test) In Flight Span Keeps Its Icons",
  args: {
    showComments: true,
    commentCount: 2,
    row: makeRow({
      node: makeTreeNode({ endTime: null, latency: undefined }),
      width: 40,
      durationMs: null,
      label: "",
      labelWidth: 0,
      labelPlacement: "hidden",
    }),
  },
  play: async ({ canvasElement }) => {
    // `hidden` is layout()'s verdict on the duration LABEL. Reading it as a
    // verdict on the whole cluster hid every icon on every in-flight span.
    await waitFor(() =>
      expect(canvasElement.querySelector("svg")).not.toBeNull(),
    );
    await expect(canvasElement.textContent).toContain("2");
  },
});

/**
 * A leftover budget that fits either the comment icon or the score badges, but
 * not both. They are charged to one running budget, so the cluster still ends up
 * narrower than the space it was given.
 */
export const CrowdedCluster = meta.story({
  name: "(Test) Crowded Cluster Never Clips",
  args: {
    showComments: true,
    showScores: true,
    commentCount: 3,
    scores: [score("quality", 0.92), score("helpfulness", 0.71)],
    // 90px of room after the bar: enough for the duration and then EITHER the
    // comment icon (22px) or the score badges (48px), never both.
    row: makeRow({ x: 60, width: 484, labelX: 550 }),
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      "div[style*='max-width']",
    );
    if (!cluster) throw new Error("metric cluster not found");

    // Admitting the icon and the badges against the SAME leftover let both in,
    // and their combined width was then clipped by the cluster's overflow box —
    // the mid-content clipping this whole layout exists to remove. Charged to one
    // running budget, the badges are dropped rather than half-drawn.
    await expect(cluster.textContent).toContain("2.00s");
    await expect(cluster.textContent).not.toContain("quality");
    await expect(cluster.scrollWidth).toBeLessThanOrEqual(
      cluster.clientWidth + 0.5,
    );
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
