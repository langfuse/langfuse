/**
 * What a row's metric cluster COSTS, in px, measured rather than guessed.
 *
 * A cluster is the duration, the subtree total, the cost, a comment icon and the
 * score badges, laid beside a bar in whatever room the lane has left. The box it
 * lives in clips, so a reservation that comes out under what the DOM renders
 * cuts the last item mid-glyph — which is why every number here is measured from
 * the thing it is paying for, and why the widest candidates are priced rather
 * than the likeliest: over-reserving drops a badge and says so in the row's
 * title, under-reserving clips one and says nothing.
 *
 * Pure and shared, because two renderers place this cluster and a second copy of
 * the arithmetic is a second chance to get it wrong.
 */

import { groupScoresByName } from "@/src/components/grouped-score-badge";
import {
  SCORE_LEVEL_LABELS,
  scoreLevelFromScore,
} from "@/src/components/score-tag";
import { type TextMeasurer } from "./textMeasurer";
import type { ScoreDomain } from "@langfuse/shared";
import type { WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

/** The score shape the badges render, and therefore the one this prices. */
type ClusterScore = WithStringifiedMetadata<ScoreDomain>;

/**
 * The cluster's own `gap-2`. The budget has to reserve the gap the cluster
 * actually renders with, not a smaller one: five admitted items multiply a 2px
 * under-reservation into a clipped last item.
 */
export const CLUSTER_ITEM_GAP_PX = 8;
/** The speech bubble of a comment icon, plus its own `mr-1`. */
const ICON_GLYPH_PX = 20;
/** Its count badge overlaps the bubble by `-ml-2`, so only the rest is width. */
const ICON_BADGE_OVERLAP_PX = 7;
/** `px-[0.2rem]` both sides plus the badge's 1px border. */
const ICON_BADGE_CHROME_PX = 8;
/** `min-w-[0.8rem]` floors a single digit. */
const ICON_BADGE_MIN_PX = 12;

/**
 * A comment icon is its bubble plus a count badge, and the badge grows with the
 * count — 99 comments is wider than 9, and "99+" wider again. A flat number for
 * "an icon" under-reserved every 2-digit count, which is the direction that
 * clips: the badge is in the flow now, so what it takes is what it takes.
 *
 * The digits are measured at the cluster's own font, a little larger than the
 * badge's `text-[8px]`, which over-reserves by a px or two and never under.
 */
export function commentIconWidth(
  count: number,
  measurer: TextMeasurer,
): number {
  const label = count > 99 ? "99+" : String(count);
  const badge = Math.max(
    measurer.measure(label) + ICON_BADGE_CHROME_PX,
    ICON_BADGE_MIN_PX,
  );
  return ICON_GLYPH_PX - ICON_BADGE_OVERLAP_PX + badge;
}
/** `px-2.5` both sides plus the 1px border of a score chip. */
const SCORE_CHIP_CHROME_PX = 22;
/** `max-w-20` truncates a score's name. */
const SCORE_NAME_MAX_PX = 80;
/** `gap-1`, which a score chip applies between EVERY one of its flex children. */
const SCORE_GAP_PX = 4;
/** `gap-1` plus the value span's own `ml-1`, between two values of one name. */
const SCORE_VALUE_SEPARATOR_PX = 8;
/**
 * One `size-3` icon plus its gap, rounded up (the app's root font scale makes a
 * `size-3` 10.8px). A value can carry BOTH a comment and metadata, and they
 * render as two separate icons.
 */
const SCORE_VALUE_ICON_PX = 16;
/** `px-1` both sides of a ScoreTag level pill; the label itself is measured. */
const SCORE_PILL_CHROME_PX = 8;
/** `px-1` both sides of the "+N" button for groups past `maxVisible`, and its border. */
const SCORE_OVERFLOW_CHROME_PX = 10;
/** `gap-1` on the score-badges wrapper — not the cluster's own `gap-2`. */
export const SCORE_GROUP_GAP_PX = 4;
/**
 * A canvas measurement and the browser's own layout of the same string agree to
 * a fraction of a px, not exactly — enough that a chip priced to the last tenth
 * came out 0.09px short on another font stack. One px a chip, in the direction
 * that does not clip.
 */
const MEASURE_MARGIN_PX = 1;

/**
 * The trailing "+N" button, plus the `gap-1` before it. Its digits are measured
 * because a flat number for it under-priced every count past 9 — a node can
 * carry a dozen distinct score names, and "+10" is wider than "+9".
 */
export function overflowButtonWidth(
  hidden: number,
  measurer: TextMeasurer,
): number {
  // Bold, and measured as bold: at the regular weight this came out ~4% short,
  // which fitted on one font stack and clipped on another. Two px of margin on
  // top, because this is the one item whose own measurement was observed to
  // disagree with layout by more than a rounding error, and it is admitted last
  // — over-reserving it can only drop badges in a lane that was borderline
  // anyway, while under-reserving it cuts a digit off.
  return (
    measurer.measureBold(`+${hidden}`) +
    SCORE_OVERFLOW_CHROME_PX +
    SCORE_GROUP_GAP_PX +
    MEASURE_MARGIN_PX * 2
  );
}

/**
 * What `GroupedScoreBadges` will actually take, measured rather than guessed.
 *
 * A flat 48px reservation was the bug: two real scores render 100-300px, so a
 * leftover budget anywhere in between admitted the badges and then let the
 * cluster's overflow box cut them mid-glyph — exactly the clipping this layout
 * exists to remove, in exactly the narrow lanes it targets. The widest groups are
 * priced, because over-reserving drops a badge (recoverable, and the title says
 * so) while under-reserving clips one (not recoverable).
 *
 * Every term here is one the DOM actually charges, and the gap between this sum
 * and the rendered width is pinned in Storybook — three rounds of missing terms
 * (a flat 48px, a flat level pill, one gap instead of one per child) all passed
 * stories that could only see the admit-or-drop decision at one lane width.
 */
export function scoreBadgesWidth(
  scores: ClusterScore[],
  measurer: TextMeasurer,
  maxVisible: number,
): number {
  // Bucketed by the badges' own grouping rule, so this cannot price a chip that
  // never renders — or miss one that does.
  const groups = Object.entries(groupScoresByName(scores));
  // Level pills appear only when the row MIXES levels; a row whose scores share
  // one level needs no per-chip disambiguation. Same rule the badges use.
  const mixesLevels =
    new Set(scores.map((score) => scoreLevelFromScore(score))).size > 1;

  const comma = measurer.measure(",");

  const widths = groups
    .map(([name, group]) => {
      // Each value is its own flex span: the text, one icon per comment and per
      // metadata (a value carrying both grows two), and a comma on all but the
      // last. Two spans are separated by the box's `gap-1` AND the span's `ml-1`.
      const values = group.reduce((total, score, index) => {
        const text = score.stringValue ?? score.value?.toFixed(2) ?? "";
        const icons = (score.comment ? 1 : 0) + (score.metadata ? 1 : 0);
        const separator =
          index === group.length - 1
            ? 0
            : SCORE_GAP_PX + comma + SCORE_VALUE_SEPARATOR_PX;
        return (
          total +
          measurer.measure(text) +
          icons * SCORE_VALUE_ICON_PX +
          separator
        );
      }, 0);
      // The pill spells its level out ("Observation" is not "Trace"), so it is
      // measured rather than assumed.
      const levels = mixesLevels
        ? [...new Set(group.map((score) => scoreLevelFromScore(score)))]
        : [];
      const pills = levels.reduce(
        (total, level) =>
          total +
          measurer.measure(SCORE_LEVEL_LABELS[level]) +
          SCORE_PILL_CHROME_PX,
        0,
      );
      // The chip is one `gap-1` flex row whose direct children are every level
      // pill, the name, and the values box — so N pills mean N + 1 gaps. Pricing
      // the name-to-values gap alone under-reserved a mixed-level chip by 4px
      // per extra pill, and the cluster's overflow box cuts what it admits.
      const gaps = (levels.length + 1) * SCORE_GAP_PX;
      return (
        Math.min(measurer.measure(`${name}:`), SCORE_NAME_MAX_PX) +
        values +
        pills +
        gaps +
        SCORE_CHIP_CHROME_PX +
        MEASURE_MARGIN_PX
      );
    })
    .sort((a, b) => b - a)
    .slice(0, maxVisible);

  // Groups past the cap collapse into a "+N" button, which is also width.
  const hidden = groups.length - maxVisible;
  const overflow = hidden > 0 ? overflowButtonWidth(hidden, measurer) : 0;
  return widths.reduce(
    (total, width, index) =>
      total + width + (index > 0 ? SCORE_GROUP_GAP_PX : 0),
    overflow,
  );
}

/** How many score groups a cluster shows before the rest collapse into "+N". */
export const MAX_SCORE_GROUPS = 3;

/**
 * Admit items into the room the lane has left, in priority order, charging each
 * the gap the cluster actually renders with. The flex gap sits BETWEEN children,
 * so the first item is charged none: billing it for a gap it does not have
 * rejected content that renders perfectly well alone.
 */
export function createClusterFitter(budgetPx: number, gapPx: number) {
  let spentPx = 0;
  return (widthPx: number): boolean => {
    const next = spentPx + widthPx + (spentPx > 0 ? gapPx : 0);
    if (next > budgetPx) return false;
    spentPx = next;
    return true;
  };
}
