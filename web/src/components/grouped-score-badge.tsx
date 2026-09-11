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
import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { scoreLevelFromScore } from "@/src/components/score-tag";
import {
  ScoreBadge,
  scoreDotColor,
} from "@/src/components/ScoreBadge/ScoreBadge";
import { MessageCircleMoreIcon } from "lucide-react";

type AnyScore = WithStringifiedMetadata<ScoreDomain> | LastUserScore;

/**
 * Bucket scores by name, the way the badges group them. Exported so a caller that
 * has to RESERVE room for these badges buckets them identically — two copies of
 * the grouping rule are two chances to price a chip that never renders.
 */
const groupScoresByName = <T extends AnyScore>(
  scores: T[],
): Record<string, T[]> =>
  scores.reduce<Record<string, T[]>>((groups, score) => {
    const bucket = groups[score.name];
    if (!bucket || !Array.isArray(bucket)) groups[score.name] = [score];
    else bucket.push(score);
    return groups;
  }, {});

const partitionScores = <T extends AnyScore>(
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

const formatScoreValue = (score: AnyScore) =>
  score.stringValue ?? score.value?.toFixed(2) ?? "";

const SOURCE_LABEL: Record<string, string> = {
  API: "API",
  EVAL: "Eval",
  ANNOTATION: "Annotation",
};

/**
 * The full list behind "+N": one row per score, grouped under its name, with
 * value, source and comment. Where the chips cap out, this is how the rest is
 * read without leaving the row or opening a tab.
 */
const ScoreListPopoverContent = <T extends AnyScore>({
  groups,
}: {
  groups: Array<[string, T[]]>;
}) => {
  const total = groups.reduce((sum, [, scores]) => sum + scores.length, 0);

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="font-bold">
        {total} {total === 1 ? "score" : "scores"}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1">
        {groups.map(([name, scores]) =>
          scores.map((score, index) => (
            <div
              key={`${name}-${index}`}
              className="col-span-full grid grid-cols-subgrid items-center"
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor:
                    index === 0 ? scoreDotColor(name) : "transparent",
                }}
              />
              <span
                className={
                  index === 0
                    ? "min-w-0 truncate"
                    : "min-w-0 truncate opacity-0"
                }
                title={name}
              >
                {name}
              </span>
              <span className="flex items-center gap-1 text-right tabular-nums">
                {formatScoreValue(score)}
                {score.comment ? (
                  <HoverCard openDelay={100}>
                    <HoverCardTrigger
                      aria-label={`View comment for ${name}: ${formatScoreValue(score)}`}
                      className="inline-flex"
                    >
                      <MessageCircleMoreIcon className="size-3" />
                    </HoverCardTrigger>
                    <HoverCardContent className="max-h-[50dvh] overflow-y-auto text-xs break-normal whitespace-normal">
                      <p className="whitespace-pre-wrap">{score.comment}</p>
                    </HoverCardContent>
                  </HoverCard>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                {SOURCE_LABEL[score.source] ?? score.source}
              </span>
            </div>
          )),
        )}
      </div>
    </div>
  );
};

export const GroupedScoreBadges = <T extends AnyScore>({
  scores,
  maxVisible,
  compact,
  hideLevels = false,
}: {
  scores: T[];
  maxVisible?: number;
  compact?: boolean;
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

  const { visibleScores, hiddenScores } = partitionScores(
    groupedScores,
    maxVisible,
  );
  const allScores = [...visibleScores, ...hiddenScores];

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
      {Boolean(hiddenScores.length) && (
        // "+N" opens the FULL list on click, not just the hidden part: the
        // reader wants everything in one place, and a hover would fight the
        // chips' own comment cards and the row hover card around it.
        <Popover>
          <PopoverTrigger asChild>
            <BadgeShell
              asChild
              color="outline"
              size={compact ? "chipSm" : "chip"}
            >
              <button
                type="button"
                className="cursor-pointer font-bold"
                aria-label={`Show all ${scores.length} scores`}
                // Chips render inside clickable rows (tree nodes, table rows):
                // opening the list must not also select the row.
                onClick={(event) => event.stopPropagation()}
              >
                +{hiddenScores.length}
              </button>
            </BadgeShell>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-[60dvh] w-max max-w-[min(480px,90vw)] overflow-y-auto p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <ScoreListPopoverContent groups={allScores} />
          </PopoverContent>
        </Popover>
      )}
    </>
  );
};
