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
}: {
  name: string;
  scores: T[];
  /** Render this group's level tags when the selection mixes score levels. */
  showLevels?: boolean;
}) => {
  const levels = showLevels
    ? Array.from(new Set(scores.map((score) => scoreLevelFromScore(score))))
    : [];

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1">
      {levels.map((level) => (
        <ScoreTag key={level} level={level} />
      ))}
      <BadgeShell color="filled" size="md">
        <span className="text-muted-foreground flex min-w-0 flex-1 font-mono">
          <span className="truncate py-0.5" title={name}>
            {name}
          </span>
          <span className="py-0.5">:</span>
        </span>
        <span className="text-foreground flex min-w-0 items-center gap-1 font-mono text-nowrap">
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
