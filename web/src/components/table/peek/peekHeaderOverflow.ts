/**
 * Layout planner for the peek header. Pure + framework-free so the adaptive
 * behaviour can be unit-tested without a DOM. The header measures its parts and
 * calls this to decide — from the PEEK's own width, not the screen's — how to
 * stay uncluttered while keeping the title readable.
 *
 * The rule: the title always gets at least `minTitle` px. When it wouldn't, we
 * apply reductions in least-painful order until it fits:
 *   1. fold the trace actions into the "…" menu (still one click away),
 *   2. shrink the type badge to icon-only (never truncate it to "Tr…"),
 *   3. compact the prev/next nav (icon-only arrows, K/J in the tooltip),
 *   4. fold open-in-tab into "…".
 * Anything still over budget just lets the title truncate (its natural state).
 */

export type PeekHeaderPlan = {
  foldActions: boolean;
  foldOpenInTab: boolean;
  badgeShowLabel: boolean;
  navCompact: boolean;
};

export type PlanPeekHeaderArgs = {
  /** The peek header's measured width, px (= the peek's width). */
  headerWidth: number;
  /** Minimum width the title keeps before anything else collapses, px. */
  minTitle: number;
  badgeLabelWidth: number;
  badgeIconWidth: number;
  /** Prev/next nav width with K/J chips, px (0 when no nav). */
  navFullWidth: number;
  /** Prev/next nav width as compact icon arrows, px (0 when no nav). */
  navCompactWidth: number;
  /** Pinned controls other than nav (expand + close + divider), px. */
  otherPinnedWidth: number;
  /** Width of the "…" overflow trigger, counted once anything folds, px. */
  moreWidth: number;
  /** Trace actions cluster width, px; omit when there are no actions. */
  actionsWidth?: number;
  /** Open-in-tab button width, px; omit when it isn't shown. */
  openInTabWidth?: number;
  /** Slack absorbing inter-control gaps + rounding, px. */
  safety?: number;
};

export function planPeekHeaderLayout({
  headerWidth,
  minTitle,
  badgeLabelWidth,
  badgeIconWidth,
  navFullWidth,
  navCompactWidth,
  otherPinnedWidth,
  moreWidth,
  actionsWidth,
  openInTabWidth,
  safety = 16,
}: PlanPeekHeaderArgs): PeekHeaderPlan {
  const hasActions = actionsWidth != null;
  const hasOpenInTab = openInTabWidth != null;

  let foldActions = false;
  let foldOpenInTab = false;
  let badgeShowLabel = true;
  let navCompact = false;

  const pinnedWidth = () =>
    (navCompact ? navCompactWidth : navFullWidth) + otherPinnedWidth;
  const clusterWidth = () =>
    pinnedWidth() +
    (foldActions || foldOpenInTab ? moreWidth : 0) +
    (hasActions && !foldActions ? (actionsWidth ?? 0) : 0) +
    (hasOpenInTab && !foldOpenInTab ? (openInTabWidth ?? 0) : 0) +
    safety;
  const badgeWidth = () => (badgeShowLabel ? badgeLabelWidth : badgeIconWidth);
  const titleAvailable = () => headerWidth - badgeWidth() - clusterWidth();

  const reductions: Array<() => void> = [
    () => {
      if (hasActions) foldActions = true;
    },
    () => {
      badgeShowLabel = false;
    },
    () => {
      navCompact = true;
    },
    () => {
      if (hasOpenInTab) foldOpenInTab = true;
    },
  ];

  for (const reduce of reductions) {
    if (titleAvailable() >= minTitle) break;
    reduce();
  }

  return { foldActions, foldOpenInTab, badgeShowLabel, navCompact };
}
