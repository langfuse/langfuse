import { expect, userEvent, waitFor } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { TimelineBar } from "./TimelineBar";
import {
  MAX_SCORE_GROUPS,
  SCORE_GROUP_GAP_PX,
  overflowButtonWidth,
  scoreBadgesWidth,
} from "../../fns/timeline/metricCluster";
import {
  createTextMeasurer,
  createTextMeasurerFrom,
} from "../../fns/timeline/textMeasurer";
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
/**
 * The widest a chip gets: a row that MIXES score levels grows a spelled-out pill
 * per chip ("Observation", not a dot), and a value carrying both a comment and
 * metadata grows two icons. Under-price any of those and the badges are admitted
 * and then clipped — the one direction that must not happen.
 */
export const AnnotatedMixedLevelScoresAreNeverClipped = meta.story({
  name: "(Test) Annotated Mixed-Level Scores Are Never Clipped",
  args: {
    showScores: true,
    scores: [
      score("quality", 0.92, {
        level: "observation",
        comment: "looks right",
        metadata: '{"model":"gpt-5.4"}',
      }),
      score("quality", 0.71, { level: "trace" }),
    ],
    row: makeRow({ x: 60, width: 300, labelX: 366 }),
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      "div[style*='max-width']",
    );
    if (!cluster) throw new Error("metric cluster not found");
    // Whole or absent, never half-drawn.
    await expect(cluster.scrollWidth).toBeLessThanOrEqual(
      cluster.clientWidth + 0.5,
    );
    if (cluster.textContent?.includes("quality")) {
      // If it was admitted, everything it brings has to fit: the level pill too.
      await expect(cluster.innerText).toMatch(/Observation|Trace/);
    } else {
      await expect(cluster.title).toContain("2 scores");
    }
  },
});

/**
 * The invariant behind all of the above, asserted directly: what the cluster
 * RESERVES for the badges is never less than what they render at.
 *
 * The two stories above can only catch a mispricing that changes the admit/drop
 * decision at their one lane width, so three rounds of under-reservation
 * (a flat 48px, a flat level pill, one gap instead of one per child) passed
 * them. This one prices the same scores the bar prices, measures the DOM the
 * badges actually produced, and compares the two numbers.
 */
/**
 * A measurer seeded from what the DOM is ACTUALLY setting the chips in, the way
 * the app seeds one from a tick-label probe. Pricing text against a font nothing
 * renders in would make a band assertion pass for the wrong reason.
 */
const measurerFor = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  return createTextMeasurerFrom(
    document.createElement("canvas").getContext("2d"),
    `${style.fontSize} ${style.fontFamily}`,
  );
};

// Every width-bearing feature at once: two levels in one group (two pills), two
// values under one name (comma + separator), a value carrying BOTH a comment and
// metadata (two icons), and a name at the truncation limit.
const PRICED_SCORES = [
  score("quality", 0.92, {
    level: "observation",
    comment: "looks right",
    metadata: '{"model":"gpt-5.4"}',
  }),
  score("quality", 0.71, { level: "trace" }),
  score("helpfulness-of-the-answer", 0.68, { level: "trace" }),
];

export const ScorePricingNeverUnderReserves = meta.story({
  name: "(Test) Score Pricing Never Under-Reserves",
  args: {
    showScores: true,
    scores: PRICED_SCORES,
    laneWidth: 900,
    row: makeRow({ x: 0, width: 120, labelX: 126 }),
  },
  play: async ({ canvasElement }) => {
    const rendered = await waitFor(() => {
      const el = canvasElement.querySelector<HTMLElement>(
        "[data-testid='timeline-bar-scores']",
      );
      if (!el) throw new Error("the badges were not admitted at all");
      return el;
    });
    const priced = scoreBadgesWidth(
      PRICED_SCORES,
      measurerFor(rendered),
      MAX_SCORE_GROUPS,
    );
    // Under a clipping ancestor the box would report the SMALLER of natural and
    // available, which would make any under-price look safe. Compare against a
    // width that is actually the badges' own.
    await expect(rendered.scrollWidth).toBeLessThanOrEqual(
      rendered.clientWidth,
    );
    const actual = rendered.getBoundingClientRect().width;

    // Never below: the cluster's overflow box cuts whatever it over-admits.
    await expect(priced).toBeGreaterThanOrEqual(actual);
    // And within a few px above, which is what makes the line above bite: with
    // loose slack anywhere in the sum, a whole missing term still "passes". The
    // budget here is 2 chips' measurement margin plus the icons' rounding.
    await expect(priced - actual).toBeLessThan(12);
  },
});

// Thirteen distinct names, all the same shape, so the three admitted chips are
// interchangeable and the only variable left is the "+10" button. Categorical, so
// every chip is measured exactly and the band below is tight enough to be about
// the button rather than about the slack in three numeric values.
const MANY_SCORES = Array.from({ length: 13 }, (_, index) =>
  score(`score-${String.fromCharCode(97 + index)}`, 0, {
    stringValue: "good",
  }),
);

/**
 * The same invariant with the overflow button in play. A flat reservation for
 * "+N" was fine until a node carried ten hidden groups and the button grew a
 * second digit — which the cluster then clipped, having priced one.
 */
export const OverflowButtonIsPricedFromItsDigits = meta.story({
  name: "(Test) Overflow Button Is Priced From Its Digits",
  args: {
    showScores: true,
    scores: MANY_SCORES,
    row: makeRow({ x: 0, width: 120, labelX: 126 }),
  },
  play: async ({ canvasElement }) => {
    const rendered = await waitFor(() => {
      const el = canvasElement.querySelector<HTMLElement>(
        "[data-testid='timeline-bar-scores']",
      );
      if (!el) throw new Error("the badges were not admitted at all");
      return el;
    });
    // Ten hidden groups, so the button is two digits wide — the case a flat
    // reservation got wrong.
    await expect(rendered.textContent).toContain("+10");
    await expect(rendered.scrollWidth).toBeLessThanOrEqual(
      rendered.clientWidth,
    );
    const priced = scoreBadgesWidth(
      MANY_SCORES,
      measurerFor(rendered),
      MAX_SCORE_GROUPS,
    );
    const actual = rendered.getBoundingClientRect().width;
    await expect(priced).toBeGreaterThanOrEqual(actual);

    // And the button against ITS own box, which is the sharp version: a
    // cluster-wide band cannot isolate this term, because pricing deliberately
    // charges the WIDEST groups while the DOM renders the alphabetically first
    // ones, and that difference is bigger than a digit.
    const button = rendered.querySelector<HTMLElement>("button");
    if (!button) throw new Error("no overflow button");
    const charged =
      overflowButtonWidth(10, measurerFor(rendered)) - SCORE_GROUP_GAP_PX;
    const drawn = button.getBoundingClientRect().width;
    await expect(charged).toBeGreaterThanOrEqual(drawn);
    // A wider ceiling than the chips get: this term carries an explicit margin,
    // because its measurement is the one that moved between font stacks.
    await expect(charged - drawn).toBeLessThan(8);
    // Bold is what it renders in, so bold is what it must be priced at — the
    // regular weight is short, and short is the direction that clips.
    const regular = measurerFor(rendered).measure("+10");
    await expect(measurerFor(rendered).measureBold("+10")).toBeGreaterThan(
      regular,
    );
  },
});

/**
 * A comment count is a badge hanging off the corner of its bubble. It used to
 * hang outside the icon's own box, so the cluster's clip cut it — and only ever
 * for a 2-digit count, which is why it survived the single-digit stories.
 */
export const CommentCountIsNeverClipped = meta.story({
  name: "(Test) Comment Count Is Never Clipped",
  args: {
    showComments: true,
    commentCount: 42,
    showDuration: false,
    // Room to spare, so the icon is certainly drawn and this is about its shape.
    row: makeRow({ x: 0, width: 500, labelPlacement: "hidden" }),
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      "div[style*='max-width']",
    );
    if (!cluster) throw new Error("metric cluster not found");
    if (!cluster.textContent?.includes("42")) {
      // Dropped rather than clipped is the other acceptable outcome, and then
      // the row still has to say the comments exist.
      await expect(cluster.title).toContain("42 comments");
      return;
    }
    // Admitted: the count has to be whole, inside the icon's box and inside the
    // cluster's.
    const badge = cluster.querySelector<HTMLElement>(
      "[data-testid='comment-count']",
    );
    if (!badge) throw new Error("no count badge");
    const icon = badge.parentElement!.getBoundingClientRect();
    await expect(badge.getBoundingClientRect().right).toBeLessThanOrEqual(
      icon.right + 0.5,
    );
    await expect(cluster.scrollWidth).toBeLessThanOrEqual(
      cluster.clientWidth + 0.5,
    );
  },
});

/**
 * And the same count against a budget that leaves room for the bubble but not for
 * its badge. Whichever way it goes — drawn whole or refused — the cluster must not
 * end up holding half a number, which is what a flat "an icon is 22px" produced
 * once the badge became part of the icon's footprint.
 */
export const CommentCountIsPricedFromItsDigits = meta.story({
  name: "(Test) Comment Count Is Priced From Its Digits",
  args: {
    showComments: true,
    commentCount: 42,
    showDuration: false,
    // 24px of lane left after the bar: a two-digit count needs a little more.
    row: makeRow({ x: 0, width: 610, labelPlacement: "hidden" }),
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      "div[style*='max-width']",
    );
    if (cluster) {
      // Admitted: whole, or not at all — never a half-drawn number.
      await expect(cluster.scrollWidth).toBeLessThanOrEqual(
        cluster.clientWidth + 0.5,
      );
      if (!cluster.textContent?.includes("42")) {
        await expect(cluster.title).toContain("42 comments");
      }
      return;
    }
    // Refused, which is the correct outcome at this width — and then the bar
    // itself has to say the comments exist, since there is no cluster left to.
    const bar = canvasElement.querySelector<HTMLElement>("div[title]");
    if (!bar) throw new Error("nothing on the row mentions the comments");
    await expect(bar.title).toContain("42 comments");
  },
});

/**
 * "+N" cannot expand in place here. The cluster was measured for three chips, so
 * an unbounded expansion inside its clip does not reveal the hidden scores — it
 * cuts the ones already on screen.
 */
export const ExpandingOverflowCannotClipTheCluster = meta.story({
  name: "(Test) Expanding Overflow Cannot Clip The Cluster",
  args: {
    showScores: true,
    scores: MANY_SCORES,
    row: makeRow({ x: 0, width: 120, labelX: 126 }),
  },
  play: async ({ canvasElement }) => {
    const cluster = canvasElement.querySelector<HTMLElement>(
      "div[style*='max-width']",
    );
    if (!cluster) throw new Error("metric cluster not found");
    const button = canvasElement.querySelector<HTMLElement>(
      "button[aria-label*='more score']",
    );
    if (!button) throw new Error("no overflow button");
    const before = cluster.textContent;
    await userEvent.click(button);
    // Nothing expanded, and nothing was cut.
    await expect(cluster.textContent).toBe(before);
    await expect(cluster.scrollWidth).toBeLessThanOrEqual(
      cluster.clientWidth + 0.5,
    );
  },
});

/**
 * A streaming bar is two phases in one bar, told apart by shade. The frame must
 * not paint the ground: a translucent wait over an opaque frame of the same
 * colour composites back to that colour, and the split disappears.
 */
export const StreamingPhasesReadAsTwoShades = meta.story({
  name: "(Test) Streaming Phases Read As Two Shades",
  args: {
    row: makeRow({ x: 40, width: 400, firstTokenX: 160, labelX: 446 }),
  },
  play: async ({ canvasElement }) => {
    const waiting = canvasElement.querySelector<HTMLElement>(
      "div[title='Time to first token']",
    );
    if (!waiting) throw new Error("no first-token segment");
    const completion = waiting.nextElementSibling as HTMLElement | null;
    if (!completion) throw new Error("no completion segment");
    // Same hue, different shade — and the difference has to survive whatever the
    // frame paints behind them.
    const frame = waiting.parentElement!;
    await expect(getComputedStyle(frame).backgroundColor).toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/,
    );
    await expect(Number(getComputedStyle(waiting).opacity)).toBeLessThan(
      Number(getComputedStyle(completion).opacity),
    );
  },
});

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
