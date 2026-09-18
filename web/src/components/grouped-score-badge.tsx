import { useState } from "react";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { cn } from "@/src/utils/tailwind";
import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { ScoreTag, scoreLevelFromScore } from "@/src/components/score-tag";
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import {
  compareText,
  groupScoresForChips,
  groupSummary,
  metricLabel,
  type ScoreChipGroup,
} from "@/src/components/ScoreBadge/groupScoresForChips";

type ChipScore = WithStringifiedMetadata<ScoreDomain> | LastUserScore;

/** A group's scores bucketed per metric name, metric label alphabetical — one
    `ScoreBadge` each, the way an ungrouped chip list reads. */
const metricBuckets = <T extends ChipScore>(scores: T[]): [string, T[]][] => {
  const byName = new Map<string, T[]>();
  for (const score of scores) {
    const bucket = byName.get(score.name);
    if (bucket) bucket.push(score);
    else byName.set(score.name, [score]);
  }
  return [...byName.entries()].sort(([a], [b]) =>
    compareText(metricLabel(a), metricLabel(b)),
  );
};

/**
 * One chip for one score group: the shared prefix, how many metrics it holds
 * and their summary (see groupSummary). Hover lists the metrics as their own
 * chips, labelled by suffix — the prefix is already on this chip — so a
 * metric's comment and metadata stay one hover away.
 */
const ScoreGroupBadge = <T extends ChipScore>({
  group,
  compact,
  showLevels,
}: {
  group: ScoreChipGroup<T>;
  compact?: boolean;
  /** Render this group's level tags when the selection mixes score levels. */
  showLevels?: boolean;
}) => {
  const { count: metricCount, text: summary } = groupSummary(group);
  const levels = showLevels
    ? Array.from(
        new Set(group.scores.map((score) => scoreLevelFromScore(score))),
      )
    : [];

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1">
      {levels.map((level) => (
        <ScoreTag key={level} level={level} />
      ))}
      <HoverCard>
        <HoverCardTrigger asChild>
          <BadgeShell asChild color="neutral" size={compact ? "sm" : "default"}>
            <span>
              <span className="min-w-0 flex-1 truncate" title={group.label}>
                {group.label}({metricCount}){summary ? ":" : ""}
              </span>
              {summary ? (
                <span className="text-muted-foreground text-nowrap tabular-nums">
                  {summary}
                </span>
              ) : null}
            </span>
          </BadgeShell>
        </HoverCardTrigger>
        {/* Same card the "+N" pill opens: chips, wrapping instead of
            clipping. */}
        <HoverCardContent className="max-h-[300px] w-max max-w-[min(420px,90vw)] overflow-y-auto p-2">
          <div className="flex flex-wrap gap-1">
            {metricBuckets(group.scores).map(([name, scores]) => (
              <ScoreBadge
                key={name}
                name={metricLabel(name)}
                scores={scores}
                compact={compact}
                showLevels={showLevels}
              />
            ))}
          </div>
        </HoverCardContent>
      </HoverCard>
    </span>
  );
};

const ScoreChip = <T extends ChipScore>({
  group,
  compact,
  showLevels,
}: {
  group: ScoreChipGroup<T>;
  compact?: boolean;
  showLevels?: boolean;
}) =>
  group.kind === "group" ? (
    <ScoreGroupBadge group={group} compact={compact} showLevels={showLevels} />
  ) : (
    <ScoreBadge
      name={group.label}
      scores={group.scores}
      compact={compact}
      showLevels={showLevels}
    />
  );

export const GroupedScoreBadges = <T extends ChipScore>({
  scores,
  maxVisible,
  compact,
  expandable = true,
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
}) => {
  // One chip per group (see groupScoresForChips): a score group's metrics
  // count as ONE chip toward `maxVisible`, so a node with two groups and a
  // plain human score still fits inline.
  const groups = groupScoresForChips(scores);

  // Level tags only when this selection MIXES levels (LFE-10596): a row whose
  // scores all share one level (the common case — e.g. a span's own
  // observation-level scores) needs no per-chip disambiguation; a mixed row
  // (e.g. the root carrying trace-level and observation-level scores) tags
  // each group so the levels are tellable apart.
  const showLevels =
    new Set(scores.map((score) => scoreLevelFromScore(score))).size > 1;

  // "+N" expands IN PLACE on click (hover still previews the hidden chips);
  // the trailing "−" collapses back to the capped view.
  const [expanded, setExpanded] = useState(false);
  const overflows = maxVisible !== undefined && groups.length > maxVisible;

  const cap = expanded && expandable ? undefined : maxVisible;
  const visibleGroups = cap === undefined ? groups : groups.slice(0, cap);
  const hiddenGroups = cap === undefined ? [] : groups.slice(cap);

  const overflowButtonClassName = cn(
    expandable ? "cursor-pointer" : "cursor-default",
    compact ? "px-0.5 py-0 leading-tight" : "px-1",
    "text-xs font-bold",
  );

  return (
    <>
      {visibleGroups.map((group) => (
        <ScoreChip
          key={`${group.kind}:${group.label}`}
          group={group}
          compact={compact}
          showLevels={showLevels}
        />
      ))}
      {Boolean(hiddenGroups.length) && (
        <HoverCard>
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
                aria-label={`Show ${hiddenGroups.length} more score${hiddenGroups.length === 1 ? "" : "s"}`}
                // Chips render inside clickable rows (tree nodes, table rows) —
                // expanding must not also select/navigate the row. Still swallowed
                // when expansion is off, or the row would react to a click aimed at
                // the preview.
                onClick={(event) => {
                  event.stopPropagation();
                  if (expandable) setExpanded(true);
                }}
              >
                +{hiddenGroups.length}
              </button>
            </BadgeShell>
          </HoverCardTrigger>
          {/* w-max overrides the fixed w-64 base so the card adapts to its
              chips; the cap makes long selections wrap instead of clipping. */}
          <HoverCardContent className="max-h-[300px] w-max max-w-[min(420px,90vw)] overflow-y-auto p-2">
            <div className="flex flex-wrap gap-1">
              {hiddenGroups.map((group) => (
                <ScoreChip
                  key={`${group.kind}:${group.label}`}
                  group={group}
                  compact={compact}
                  showLevels={showLevels}
                />
              ))}
            </div>
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
