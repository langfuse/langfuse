import { OverflowCountBadge } from "@/src/components/OverflowCountBadge";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { scoreLevelFromScore } from "@/src/components/score-tag";
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import { ScoreValue } from "@/src/components/ScoreValue";

type ChipScore = WithStringifiedMetadata<ScoreDomain> | LastUserScore;

const MAX_VISIBLE_SCORE_GROUPS = 2;

/**
 * Bucket scores by name, the way the badges group them. Exported so a caller that
 * has to RESERVE room for these badges buckets them identically — two copies of
 * the grouping rule are two chances to price a chip that never renders.
 */
export const groupScoresByName = <T extends ChipScore>(
  scores: T[],
): Record<string, T[]> =>
  scores.reduce<Record<string, T[]>>((groups, score) => {
    const bucket = groups[score.name];
    if (!bucket || !Array.isArray(bucket)) groups[score.name] = [score];
    else bucket.push(score);
    return groups;
  }, {});

const partitionScores = <T extends ChipScore>(
  scores: Record<string, T[]>,
  maxVisible: number,
) => {
  const sortedScores = Object.entries(scores).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  return {
    visibleScores: sortedScores.slice(0, maxVisible),
    hiddenScores: sortedScores.slice(maxVisible),
  };
};

const ScoreTable = <T extends ChipScore>({ scores }: { scores: T[] }) => {
  const groups = Object.entries(groupScoresByName(scores)).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="p-2 text-xs">
      <div className="text-foreground mb-1 font-bold">Scores</div>
      <ul className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 font-mono">
        {groups.map(([name, groupScores]) => (
          <li key={name} className="contents">
            <span className="text-muted-foreground whitespace-nowrap">
              {name}
            </span>
            <span className="text-foreground inline-flex items-center gap-1 whitespace-nowrap">
              {groupScores.map((score, index) => (
                <span
                  key={index}
                  className="inline-flex min-w-0 items-center gap-1"
                >
                  <ScoreValue name={name} score={score} />
                  {index < groupScores.length - 1 && <span>,</span>}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const GroupedScoreBadges = <T extends ChipScore>({
  scores,
  maxVisible = MAX_VISIBLE_SCORE_GROUPS,
}: {
  scores: T[];
  maxVisible?: number;
}) => {
  const groupedScores = groupScoresByName(scores);

  // Level tags only when this selection MIXES levels: a row whose scores all
  // share one level needs no per-chip disambiguation; a mixed row (e.g. the
  // root carrying trace-level and observation-level scores) tags each group.
  const showLevels =
    new Set(scores.map((score) => scoreLevelFromScore(score))).size > 1;

  const { visibleScores, hiddenScores } = partitionScores(
    groupedScores,
    maxVisible,
  );

  const overflow = (
    <Popover>
      <PopoverTrigger asChild>
        <OverflowCountBadge
          count={hiddenScores.length}
          aria-label={`Show all ${Object.keys(groupedScores).length} scores`}
          // Chips render inside clickable rows; opening must not select the row.
          onClick={(event) => event.stopPropagation()}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[320px] w-max max-w-[min(560px,90vw)] overflow-y-auto p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <ScoreTable scores={scores} />
      </PopoverContent>
    </Popover>
  );

  return (
    <>
      {visibleScores.map(([name, scores]) => (
        <ScoreBadge
          key={name}
          name={name}
          scores={scores}
          showLevels={showLevels}
        />
      ))}
      {Boolean(hiddenScores.length) && overflow}
    </>
  );
};
