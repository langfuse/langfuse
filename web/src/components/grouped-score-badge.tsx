import { useState } from "react";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
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

const ExecutionTraceLink = ({
  executionTraceId,
}: {
  executionTraceId: string;
}) => {
  const projectId = useProjectIdFromURL();
  if (!projectId) return null;

  return (
    <Link
      href={`/project/${projectId}/traces/${encodeURIComponent(executionTraceId)}`}
      className="mt-2 flex items-center gap-1 text-blue-600 hover:underline"
      target="_blank"
    >
      <ExternalLinkIcon className="h-3 w-3" />
      View execution trace
    </Link>
  );
};

const ScoreGroupBadge = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>({
  name,
  scores,
  compact,
  showLevels,
}: {
  name: string;
  scores: T[];
  compact?: boolean;
  /** Render this group's level tag(s). Set by GroupedScoreBadges only when
   *  the whole selection mixes levels (LFE-10596). */
  showLevels?: boolean;
}) => {
  // Score-level color coding (LFE-10596): one full tag per distinct level in
  // the group (a name can exist at both trace and observation level). Full
  // pill, not the compact dot — the level must be readable without hovering.
  const levels = showLevels
    ? Array.from(new Set(scores.map((score) => scoreLevelFromScore(score))))
    : [];
  const text = `${name}: ${scores
    .map((score) => score.stringValue ?? score.value?.toFixed(2) ?? "")
    .join(", ")}`;

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1">
      {levels.map((level) => (
        <ScoreTag key={level} level={level} />
      ))}
      <BadgeShell color="neutral" size={compact ? "sm" : "default"}>
        <span className="truncate" title={text}>
          {text}
        </span>
        {scores.map((score, index) => (
          <span key={index} className="inline-flex shrink-0 items-center gap-1">
            {score.comment && (
              <HoverCard>
                <HoverCardTrigger className="inline-block shrink-0">
                  <MessageCircleMoreIcon className="mb-0.25 size-3!" />
                </HoverCardTrigger>
                <HoverCardContent className="max-h-[50dvh] overflow-y-auto text-xs break-normal whitespace-normal">
                  <p className="whitespace-pre-wrap">{score.comment}</p>
                  {"executionTraceId" in score && score.executionTraceId && (
                    <ExecutionTraceLink
                      executionTraceId={score.executionTraceId}
                    />
                  )}
                </HoverCardContent>
              </HoverCard>
            )}
            {hasMetadata(score) && (
              <HoverCard>
                <HoverCardTrigger className="inline-block shrink-0">
                  <BracesIcon className="mb-0.25 size-3!" />
                </HoverCardTrigger>
                <HoverCardContent className="max-h-[50dvh] overflow-y-auto rounded-md border-none p-0 text-xs break-normal whitespace-normal">
                  <JSONView codeClassName="rounded-md!" json={score.metadata} />
                </HoverCardContent>
              </HoverCard>
            )}
          </span>
        ))}
      </BadgeShell>
    </span>
  );
};

export const GroupedScoreBadges = <
  T extends WithStringifiedMetadata<ScoreDomain> | LastUserScore,
>({
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
  const groupedScores = groupScoresByName(scores);

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
    expanded && expandable ? undefined : maxVisible,
  );

  const overflowButtonClassName = cn(
    expandable ? "cursor-pointer" : "cursor-default",
    compact ? "px-0.5 py-0 leading-tight" : "px-1",
    "text-xs font-bold",
  );

  return (
    <>
      {visibleScores.map(([name, scores]) => (
        <ScoreGroupBadge
          key={name}
          name={name}
          scores={scores}
          compact={compact}
          showLevels={showLevels}
        />
      ))}
      {Boolean(hiddenScores.length) && (
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
                +{hiddenScores.length}
              </button>
            </BadgeShell>
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
