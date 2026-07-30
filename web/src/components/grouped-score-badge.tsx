import { useState } from "react";
import { Badge, badgeVariants } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { cn } from "@/src/utils/tailwind";
import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import {
  BracesIcon,
  MessageCircleMoreIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import Link from "next/link";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { ScoreTag, scoreLevelFromScore } from "@/src/components/score-tag";

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

const hasMetadata = (
  score: WithStringifiedMetadata<ScoreDomain> | LastUserScore,
) => {
  if (!score.metadata) return false;
  try {
    const metadata =
      typeof score.metadata === "string"
        ? JSON.parse(score.metadata)
        : score.metadata;
    return Object.keys(metadata).length > 0;
  } catch {
    return false;
  }
};

const ScoreGroupBadge = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>({
  name,
  scores,
  compact,
  badgeClassName,
  showLevels,
}: {
  name: string;
  scores: T[];
  compact?: boolean;
  badgeClassName?: string;
  /** Render this group's level tag(s). Set by GroupedScoreBadges only when
   *  the whole selection mixes levels (LFE-10596). */
  showLevels?: boolean;
}) => {
  const projectId = useProjectIdFromURL();

  // Score-level color coding (LFE-10596): one full tag per distinct level in
  // the group (a name can exist at both trace and observation level). Full
  // pill, not the compact dot — the level must be readable without hovering.
  const levels = showLevels
    ? Array.from(new Set(scores.map((score) => scoreLevelFromScore(score))))
    : [];

  return (
    <Badge
      variant="tertiary"
      key={name}
      className={`flex max-w-full min-w-0 items-center gap-1 ${compact ? "px-1.5 leading-tight" : "px-2.5"} text-xs font-normal${badgeClassName ? " " + badgeClassName : ""}`}
    >
      {levels.map((level) => (
        <ScoreTag key={level} level={level} />
      ))}
      <div
        className={`w-fit max-w-20 shrink-0 truncate ${compact ? "leading-tight" : ""}`}
        title={name}
      >
        {name}:
      </div>
      <div className="flex min-w-0 items-center gap-1 text-nowrap">
        {scores.map((s, i) => {
          const scoreDisplayValue = s.stringValue ?? s.value?.toFixed(2) ?? "";

          return (
            <span
              key={i}
              className="group/score ml-1 flex min-w-0 items-center gap-1 rounded-sm first:ml-0"
            >
              <span className="truncate" title={scoreDisplayValue}>
                {scoreDisplayValue}
              </span>
              {s.comment && (
                <HoverCard>
                  <HoverCardTrigger className="inline-block shrink-0">
                    <MessageCircleMoreIcon className="mb-0.25 size-3!" />
                  </HoverCardTrigger>
                  <HoverCardContent className="max-h-[50dvh] overflow-y-auto text-xs break-normal whitespace-normal">
                    <p className="whitespace-pre-wrap">{s.comment}</p>
                    {"executionTraceId" in s &&
                      s.executionTraceId &&
                      projectId && (
                        <Link
                          href={`/project/${projectId}/traces/${encodeURIComponent(s.executionTraceId)}`}
                          className="mt-2 flex items-center gap-1 text-blue-600 hover:underline"
                          target="_blank"
                        >
                          <ExternalLinkIcon className="h-3 w-3" />
                          View execution trace
                        </Link>
                      )}
                  </HoverCardContent>
                </HoverCard>
              )}
              {hasMetadata(s) && (
                <HoverCard>
                  <HoverCardTrigger className="inline-block shrink-0">
                    <BracesIcon className="mb-0.25 size-3!" />
                  </HoverCardTrigger>
                  <HoverCardContent className="max-h-[50dvh] overflow-y-auto rounded-md border-none p-0 text-xs break-normal whitespace-normal">
                    <JSONView codeClassName="rounded-md!" json={s.metadata} />
                  </HoverCardContent>
                </HoverCard>
              )}
              <span className="group-last/score:hidden">,</span>
            </span>
          );
        })}
      </div>
    </Badge>
  );
};

export const GroupedScoreBadges = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>({
  scores,
  maxVisible,
  compact,
  badgeClassName,
}: {
  scores: T[];
  maxVisible?: number;
  compact?: boolean;
  badgeClassName?: string;
}) => {
  const groupedScores = scores.reduce<Record<string, T[]>>((acc, score) => {
    if (!acc[score.name] || !Array.isArray(acc[score.name])) {
      acc[score.name] = [score];
    } else {
      acc[score.name].push(score);
    }
    return acc;
  }, {});

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
  const overflows =
    maxVisible !== undefined && Object.keys(groupedScores).length > maxVisible;

  const { visibleScores, hiddenScores } = partitionScores(
    groupedScores,
    expanded ? undefined : maxVisible,
  );

  const overflowButtonClassName = cn(
    badgeVariants({ variant: "tertiary" }),
    "cursor-pointer",
    compact ? "px-0.5 py-0 leading-tight" : "px-1",
    "text-xs font-bold",
    badgeClassName,
  );

  return (
    <>
      {visibleScores.map(([name, scores]) => (
        <ScoreGroupBadge
          key={name}
          name={name}
          scores={scores}
          compact={compact}
          badgeClassName={badgeClassName}
          showLevels={showLevels}
        />
      ))}
      {Boolean(hiddenScores.length) && (
        <HoverCard>
          <HoverCardTrigger asChild>
            <button
              type="button"
              // aria-label, not title: a native tooltip would stack on top of
              // the hover-card preview.
              aria-label={`Show ${hiddenScores.length} more score${hiddenScores.length === 1 ? "" : "s"}`}
              // Chips render inside clickable rows (tree nodes, table rows) —
              // expanding must not also select/navigate the row.
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(true);
              }}
              className={overflowButtonClassName}
            >
              +{hiddenScores.length}
            </button>
          </HoverCardTrigger>
          {/* w-max overrides the fixed w-64 base so the card adapts to its
              chips; the cap makes long selections wrap instead of clipping. */}
          <HoverCardContent className="max-h-[300px] w-max max-w-[min(420px,90vw)] overflow-y-auto p-2">
            <div className="flex flex-wrap gap-1">
              {hiddenScores.map(([name, scores]) => (
                <ScoreGroupBadge
                  key={name}
                  name={name}
                  scores={scores}
                  compact={compact}
                  badgeClassName={badgeClassName}
                  showLevels={showLevels}
                />
              ))}
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
      {expanded && overflows && (
        <button
          type="button"
          title="Show fewer scores"
          aria-label="Show fewer scores"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(false);
          }}
          className={overflowButtonClassName}
        >
          −
        </button>
      )}
    </>
  );
};
