import { expect } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineRowMetrics } from "./TimelineRowMetrics";
import { createTextMeasurer } from "../../fns/timeline/textMeasurer";
import { resolveDensity } from "../../fns/timeline/density";
import { type PositionedNode } from "../../fns/timeline/layout";
import { type ClusterScore } from "../../fns/timeline/metricCluster";

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

/** A numeric score, as the badges receive them: metadata already stringified. */
function score(
  name: string,
  value: number,
  extras: { comment?: string } = {},
): ClusterScore {
  return {
    id: `score-${name}`,
    projectId: "project",
    environment: "default",
    name,
    value,
    stringValue: null,
    dataType: "NUMERIC",
    source: "API",
    authorUserId: null,
    comment: extras.comment ?? null,
    metadata: null,
    configId: null,
    queueId: null,
    executionTraceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    timestamp: new Date(),
    traceId: "trace",
    sessionId: null,
    datasetRunId: null,
    observationId: "n0",
    longStringValue: "",
  } as unknown as ClusterScore;
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

export const Everything = meta.story({
  args: {
    metrics: {
      costText: "$0.0021",
      commentCount: 3,
      scores: [score("helpfulness", 0.92), score("accuracy", 0.71)],
    },
  },
});

/**
 * The whole point of pricing each item: the box clips, so anything admitted has
 * to fit whole. A row that shows half a score badge is worse than one that says
 * "2 scores" in its title.
 */
export const NothingIsEverHalfDrawn = meta.story({
  name: "(Test) Nothing Is Ever Half Drawn",
  args: {
    // Hard against the right edge, so the cluster has almost no room after it.
    row: row({ x: 60, width: 500, labelX: 566 }),
    metrics: {
      costText: "$0.0021",
      commentCount: 42,
      scores: [
        score("helpfulness-of-the-answer", 0.92),
        score("factual-accuracy", 0.71),
        score("tone", 0.5),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-metrics"]',
    );
    if (!cluster) throw new Error("no cluster");
    await expect(cluster.scrollWidth).toBeLessThanOrEqual(
      cluster.clientWidth + 0.5,
    );
    // What did not fit is still reachable, in the row's own title.
    const drawnScores = cluster.querySelector(
      '[data-testid="timeline-dense-scores"]',
    );
    if (!drawnScores) await expect(cluster.title).toContain("3 scores");
  },
});

/** Scores and comments arrive from the trace data, and they render. */
export const ScoresAndCommentsRender = meta.story({
  name: "(Test) Scores And Comments Render",
  args: {
    row: row({ x: 10, width: 120, labelX: 136 }),
    metrics: {
      commentCount: 3,
      scores: [score("helpfulness", 0.92)],
    },
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-metrics"]',
    );
    if (!cluster) throw new Error("no cluster");
    await expect(cluster.innerText).toContain("helpfulness");
    await expect(
      cluster.querySelector('[data-testid="comment-count"]')?.textContent,
    ).toBe("3");
    await expect(cluster.scrollWidth).toBeLessThanOrEqual(
      cluster.clientWidth + 0.5,
    );
  },
});

/** The view-options duration switch, which the tree honours too. */
export const TheDurationSwitchIsHonoured = meta.story({
  name: "(Test) The Duration Switch Is Honoured",
  args: {
    showDuration: false,
    metrics: { costText: "$0.0021" },
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-metrics"]',
    );
    if (!cluster) throw new Error("no cluster");
    await expect(cluster.innerText).toContain("$0.0021");
    await expect(
      cluster.querySelector('[data-testid="timeline-dense-duration"]'),
    ).toBeNull();
  },
});

/** Heat-map colouring, when the user has it on. */
export const MetricsTakeTheHeatMapClass = meta.story({
  name: "(Test) Metrics Take The Heat Map Class",
  args: {
    metrics: {
      costText: "$0.0021",
      durationClass: "text-dark-red",
      costClass: "text-dark-yellow",
    },
  },
  play: async ({ canvasElement }) => {
    const duration = canvasElement.querySelector<HTMLElement>(
      '[data-testid="timeline-dense-duration"]',
    );
    if (!duration) throw new Error("no duration");
    await expect(duration.className).toContain("text-dark-red");
  },
});
