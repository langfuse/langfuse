import { expect } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineRowMetrics } from "./TimelineRowMetrics";
import { createTextMeasurer } from "../../fns/timeline/textMeasurer";
import { resolveDensity } from "../../fns/timeline/density";
import { type PositionedNode } from "../../fns/timeline/layout";

const LANE = 640;

/** A positioned row, as `layout()` hands one over. */
function row(overrides: Partial<PositionedNode> = {}): PositionedNode {
  const node = {
    id: "n0",
    name: "llm.chat",
    type: "GENERATION",
    startTime: new Date("2024-01-01T00:00:00.000Z"),
    endTime: new Date("2024-01-01T00:00:02.000Z"),
    children: [],
  };
  return {
    node,
    id: node.id,
    name: node.name,
    type: node.type,
    index: 0,
    depth: 0,
    treeLines: [],
    isLastSibling: true,
    hasChildren: false,
    isCollapsed: false,
    y: 0,
    height: 26,
    x: 60,
    width: 220,
    clippedLeft: false,
    clippedRight: false,
    offscreen: false,
    durationMs: 2000,
    firstTokenX: null,
    label: "2.00s",
    labelWidth: 32,
    labelPlacement: "after",
    labelX: 286,
    startMs: 0,
    endMs: 2000,
    ...overrides,
  } as PositionedNode;
}

const meta = preview.meta({
  component: TimelineRowMetrics,
  args: {
    row: row(),
    laneWidth: LANE,
    // A generic family, and the SAME one the decorator renders in: a canvas
    // resolves `ui-sans-serif` to a face ~19% narrower than the DOM does, so a
    // measurer seeded with the app's stack prices text nobody renders. The app
    // avoids this by seeding from a probe; a story has to state both sides.
    measurer: createTextMeasurer("12px sans-serif"),
    density: resolveDensity({ pointer: "fine" }),
    metrics: {},
    showDuration: true,
    toneClass: "text-white/95",
  },
  decorators: [
    (Story) => (
      <div
        className="bg-background relative h-[26px] w-[640px] rounded border"
        style={{ fontFamily: "sans-serif" }}
      >
        <Story />
      </div>
    ),
  ],
});

export const DurationOnly = meta.story({});

/**
 * A bar can be wide enough to hold the duration and still be the WORST place to
 * put the cluster. `layout()` picks a side by measuring the duration alone, so
 * inheriting its choice confined the cluster to a 142px bar while 424px of lane
 * sat free beside it — which is what made annotations vanish as you zoomed in:
 * growing a bar shrank the budget.
 */
export const TheRoomierSideWins = meta.story({
  name: "(Test) The Roomier Side Wins",
  args: {
    // 150px bar in a 640px lane: `layout()` says the duration fits inside it.
    row: row({ x: 60, width: 150, labelPlacement: "inside", labelX: 66 }),
    metrics: { costText: "$0.0021" },
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-metrics"]',
    );
    if (!cluster) throw new Error("no cluster");

    // It went where the room is, not where the duration happened to fit.
    await expect(cluster.dataset.placement).toBe("after");
    await expect(Number.parseFloat(cluster.style.maxWidth)).toBeGreaterThan(
      150,
    );
    // Both items survive, which they would not have in a 142px box.
    await expect(cluster.innerText).toContain("2.00s");
    await expect(cluster.innerText).toContain("$0.0021");
    await expect(cluster.scrollWidth).toBeLessThanOrEqual(
      cluster.clientWidth + 0.5,
    );
  },
});
