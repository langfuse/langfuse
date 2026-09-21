import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
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

const MAX_VISIBLE_SCORE_GROUPS = 2;

/** Scores bucketed per name, code-point order. */
const scoresByName = <T extends ChipScore>(scores: T[]): [string, T[]][] => {
  const byName = new Map<string, T[]>();
  for (const score of scores) {
    const bucket = byName.get(score.name);
    if (bucket) bucket.push(score);
    else byName.set(score.name, [score]);
  }
  return [...byName.entries()].sort(([a], [b]) => compareText(a, b));
};

/** A group's scores bucketed per metric name, metric label alphabetical — one
    `ScoreBadge` each, the way an ungrouped chip list reads. */
const metricBuckets = <T extends ChipScore>(scores: T[]): [string, T[]][] =>
  scoresByName(scores).sort(([a], [b]) =>
    compareText(metricLabel(a), metricLabel(b)),
  );

const formatScoreValue = (score: ChipScore) =>
  score.stringValue ?? score.value?.toFixed(2) ?? "";

const ScoreTable = <T extends ChipScore>({ scores }: { scores: T[] }) => {
  const groups = scoresByName(scores);

  return (
    <div className="p-2 text-xs">
      <div className="text-foreground mb-1 font-bold">Scores</div>
      <ul className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        {groups.map(([name, groupScores]) => (
          <li key={name} className="contents">
            <span className="text-muted-foreground whitespace-nowrap">
              {name}
            </span>
            <span className="text-foreground whitespace-nowrap">
              {groupScores.map(formatScoreValue).join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
  maxVisible = MAX_VISIBLE_SCORE_GROUPS,
  compact,
}: {
  scores: T[];
  maxVisible?: number;
  compact?: boolean;
}) => {
  // One chip per group (see groupScoresForChips): a score group's metrics
  // count as ONE chip toward `maxVisible`, so a node with two groups and a
  // plain human score still fits inline.
  const groups = groupScoresForChips(scores);

  // Level tags only when this selection MIXES levels: a row whose scores all
  // share one level needs no per-chip disambiguation; a mixed row (e.g. the
  // root carrying trace-level and observation-level scores) tags each group.
  const showLevels =
    new Set(scores.map((score) => scoreLevelFromScore(score))).size > 1;

  const visibleGroups = groups.slice(0, maxVisible);
  const hiddenGroups = groups.slice(maxVisible);
  const scoreNameCount = new Set(scores.map((score) => score.name)).size;

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
        <Popover>
          <PopoverTrigger asChild>
            <BadgeShell
              asChild
              color="neutral"
              size={compact ? "sm" : "default"}
            >
              <button
                type="button"
                className={cn(
                  "cursor-pointer self-center text-xs font-bold",
                  compact ? "px-0.5 py-0 leading-tight" : "px-1",
                )}
                aria-label={`Show all ${scoreNameCount} scores`}
                // Chips render inside clickable rows; opening must not select the row.
                onClick={(event) => event.stopPropagation()}
              >
                +{hiddenGroups.length}
              </button>
            </BadgeShell>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-[320px] w-max max-w-[min(560px,90vw)] overflow-y-auto p-0"
            onClick={(event) => event.stopPropagation()}
          >
            <ScoreTable scores={scores} />
          </PopoverContent>
        </Popover>
      )}
    </>
  );
};
