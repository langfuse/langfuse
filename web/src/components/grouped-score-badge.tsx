import { useState } from "react";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { scoreLevelFromScore } from "@/src/components/score-tag";
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import { ScoreHoverList } from "@/src/components/ScoreBadge/ScoreHoverList";

/**
 * Bucket scores by name, the way the badges group them. Exported so a caller that
 * has to RESERVE room for these badges buckets them identically — two copies of
 * the grouping rule are two chances to price a chip that never renders.
 */
const groupScoresByName = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>(
  scores: T[],
): Record<string, T[]> =>
  scores.reduce<Record<string, T[]>>((groups, score) => {
    const bucket = groups[score.name];
    if (!bucket || !Array.isArray(bucket)) groups[score.name] = [score];
    else bucket.push(score);
    return groups;
  }, {});

const partitionScores = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>(
  scores: Record<string, T[]>,
  maxVisible?: number,
) => {
  const sortedScores = Object.entries(scores).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  if (!maxVisible) return { visibleScores: sortedScores, hiddenScores: [] };

  const visibleScores = sortedScores.slice(0, maxVisible);
  const hiddenScores = sortedScores.slice(maxVisible);
  return { visibleScores, hiddenScores };
};

export const GroupedScoreBadges = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>({
  scores,
  maxVisible,
  compact,
  hideLevels = false,
  expandable = true,
  overflowPreview = true,
}: {
  scores: T[];
  maxVisible?: number;
  compact?: boolean;
  /**
   * Whether "+N" expands the hidden chips IN PLACE. A caller that has measured a
   * box for exactly `maxVisible` chips has to say no: expanding is unbounded by
   * construction, so inside a clipping box it does not reveal the hidden scores,
   * it cuts the visible ones. The hover preview stays either way, which is the
   * part that actually shows them.
   */
  expandable?: boolean;
  /**
   * Whether hovering "+N" lists the scores. Off inside tree rows: the row's
   * own hover card already lists them, two cards for one row is noise.
   */
  overflowPreview?: boolean;
  /** Suppress the level tag even on mixed rows — for dense surfaces (tree
      rows) where the level lives in the detail panel instead. */
  hideLevels?: boolean;
}) => {
  const groupedScores = groupScoresByName(scores);

  // Level tags only when this selection MIXES levels (LFE-10596): a row whose
  // scores all share one level (the common case — e.g. a span's own
  // observation-level scores) needs no per-chip disambiguation; a mixed row
  // (e.g. the root carrying trace-level and observation-level scores) tags
  // each group so the levels are tellable apart.
  const showLevels =
    !hideLevels &&
    new Set(scores.map((score) => scoreLevelFromScore(score))).size > 1;

  // "+N" expands IN PLACE on click (hover still previews the hidden chips);
  // the trailing "−" collapses back to the capped view.
  const [expanded, setExpanded] = useState(false);
  const overflows =
    maxVisible !== undefined && Object.keys(groupedScores).length > maxVisible;

  const { visibleScores, hiddenScores } = partitionScores(
    groupedScores,
    expanded && expandable ? undefined : maxVisible,
  );

  // No padding or type overrides: the shell's size variant is what the chips
  // next to it use, so "+N" gets exactly their box.
  const overflowButtonClassName = expandable
    ? "cursor-pointer"
    : "cursor-default";
  // The shell colours its own text; a colour on the asChild element competes
  // with it by stylesheet order, so the number is coloured on an inner span.
  const overflowLabel = (
    <span className="text-muted-foreground">+{hiddenScores.length}</span>
  );

  return (
    <>
      {visibleScores.map(([name, scores]) => (
        <ScoreBadge
          key={name}
          name={name}
          scores={scores}
          compact={compact}
          showLevels={showLevels}
        />
      ))}
      {Boolean(hiddenScores.length) && !overflowPreview && (
        <BadgeShell asChild color="neutral" size={compact ? "sm" : "default"}>
          <span
            className={overflowButtonClassName}
            aria-label={`${hiddenScores.length} more score${hiddenScores.length === 1 ? "" : "s"}`}
          >
            {overflowLabel}
          </span>
        </BadgeShell>
      )}
      {Boolean(hiddenScores.length) && overflowPreview && (
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <BadgeShell
              asChild
              color="neutral"
              size={compact ? "sm" : "default"}
            >
              <button
                type="button"
                className={overflowButtonClassName}
                // aria-label, not title: a native tooltip would stack on top of
                // the hover-card preview.
                aria-label={`Show ${hiddenScores.length} more score${hiddenScores.length === 1 ? "" : "s"}`}
                // Chips render inside clickable rows (tree nodes, table rows) —
                // expanding must not also select/navigate the row. Still swallowed
                // when expansion is off, or the row would react to a click aimed at
                // the preview.
                onClick={(event) => {
                  event.stopPropagation();
                  if (expandable) setExpanded(true);
                }}
              >
                {overflowLabel}
              </button>
            </BadgeShell>
          </HoverCardTrigger>
          {/* Same score list as the tree row hover card, and ALL of the group's
              scores, not just the hidden ones: the reader wants one list. */}
          <HoverCardContent className="w-60 p-2.5 text-xs">
            <ScoreHoverList scores={scores} />
          </HoverCardContent>
        </HoverCard>
      )}
      {expanded && overflows && (
        <BadgeShell asChild color="neutral" size={compact ? "sm" : "default"}>
          <button
            type="button"
            className={overflowButtonClassName}
            title="Show fewer scores"
            aria-label="Show fewer scores"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(false);
            }}
          >
            −
          </button>
        </BadgeShell>
      )}
    </>
  );
};
