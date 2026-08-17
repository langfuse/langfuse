import { expect, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineBar } from "./TimelineBar";
import { createTextMeasurer } from "../../fns/timeline/textMeasurer";
import { resolveDensity } from "../../fns/timeline/density";
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
    // The same density layout() positions with — the cluster's gap and inset
    // come from it, so a story that omitted it would measure a different bar.
    density: resolveDensity({ pointer: "fine" }),
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
    // What was dropped stays reachable, counts and all: a narrow row used not to
    // mention that a comment or a score existed at all.
    await expect(cluster.title).toContain("3 comments");
    await expect(cluster.title).toContain("2 scores");
  },
});

/**
 * Two real scores render 100-300px, not the 48px a flat reservation assumed. A
 * lane with room for the duration and *almost* room for the badges is where that
 * gap used to clip them mid-glyph.
 */
export const ScoreBadgesArePricedFromTheirContent = meta.story({
  name: "(Test) Score Badges Are Priced From Their Content",
  args: {
    showScores: true,
    scores: [
      score("helpfulness-of-the-answer", 0.71),
      score("factual-accuracy", 0.92),
    ],
    row: makeRow({ x: 60, width: 420, labelX: 486 }),
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      "div[style*='max-width']",
    );
    if (!cluster) throw new Error("metric cluster not found");
    await expect(cluster.scrollWidth).toBeLessThanOrEqual(
      cluster.clientWidth + 0.5,
    );
    // Either the badges fit whole, or they are not drawn — never half-drawn.
    const showsBadges = cluster.textContent?.includes("factual-accuracy");
    if (showsBadges) {
      await expect(cluster.textContent).toContain("helpfulness");
    } else {
      await expect(cluster.title).toContain("2 scores");
    }
  },
});

/**
 * A bar hard against the right edge: the duration fits on neither side, but the
 * space BEFORE it is wide open. The cluster belongs there, not in the 0px after.
 */
export const HiddenLabelUsesTheRoomierSide = meta.story({
  name: "(Test) Hidden Label Uses The Roomier Side",
  args: {
    showComments: true,
    commentCount: 4,
    row: makeRow({ x: 600, width: 38, labelPlacement: "hidden" }),
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      "div[style*='max-width']",
    );
    if (!cluster) throw new Error("the cluster went nowhere at all");
    const box = cluster.getBoundingClientRect();
    const bar = canvasElement
      .querySelector<HTMLElement>("div[style*='left: 600px']")
      ?.getBoundingClientRect();
    if (!bar) throw new Error("no bar");
    // Left of the bar, and inside the lane.
    await expect(box.right).toBeLessThanOrEqual(bar.left + 0.5);
    await expect(box.width).toBeGreaterThan(0);
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
