import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { ScoreTag, scoreLevelFromScore } from "@/src/components/score-tag";
import { ScoreValue } from "@/src/components/ScoreValue";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export const ScoreBadge = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>({
  name,
  scores,
  showLevels,
  compact,
}: {
  name: string;
  scores: T[];
  /** Render this group's level tags when the selection mixes score levels. */
  showLevels?: boolean;
  /** Tree rows use the small badge size. */
  compact?: boolean;
}) => {
  const levels = showLevels
    ? Array.from(new Set(scores.map((score) => scoreLevelFromScore(score))))
    : [];

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1">
      {levels.map((level) => (
        <ScoreTag key={level} level={level} />
      ))}
      <BadgeShell size={compact ? "sm" : undefined}>
        <span
          aria-hidden
          className="bg-dark-yellow size-1.25 shrink-0 rounded-[1px]"
        />
        <span className="min-w-0 flex-1 truncate" title={name}>
          {name}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-nowrap">
          {scores.map((score, index) => {
            return (
              <span
                key={index}
                className="inline-flex min-w-0 items-center gap-1"
              >
                <ScoreValue name={name} score={score} />
                {index < scores.length - 1 && <span>,</span>}
              </span>
            );
          })}
        </span>
      </BadgeShell>
    </span>
  );
};
