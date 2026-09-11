import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { type LastUserScore, type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { ScoreTag, scoreLevelFromScore } from "@/src/components/score-tag";
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import { ScoreHoverList } from "@/src/components/ScoreBadge/ScoreHoverList";
import {
  groupScoresForChips,
  metricLabel,
  type ScoreChipGroup,
} from "@/src/components/ScoreBadge/groupScoresForChips";
import { cn } from "@/src/utils/tailwind";

type ChipScore = WithStringifiedMetadata<ScoreDomain> | LastUserScore;

/**
 * One chip for one evaluator: the shared prefix and how many metrics it
 * emitted. Hover lists the metrics (suffix only, the prefix is the chip);
 * click goes where "+N" goes, the node's Scores tab, the only place twenty
 * metrics with their comments and metadata fit.
 */
const EvaluatorGroupBadge = <T extends ChipScore>({
  group,
  compact,
  showLevels,
  preview,
  onClick,
}: {
  group: ScoreChipGroup<T>;
  compact?: boolean;
  showLevels: boolean;
  /** Whether hovering the chip lists the metrics. */
  preview: boolean;
  onClick?: () => void;
}) => {
  const metricCount = new Set(group.scores.map((score) => score.name)).size;
  const levels = showLevels
    ? Array.from(
        new Set(group.scores.map((score) => scoreLevelFromScore(score))),
      )
    : [];
  const label = (
    <>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          compact && "text-muted-foreground",
        )}
        title={group.label}
      >
        {group.label}
      </span>
      <span className="text-muted-foreground text-nowrap tabular-nums">
        · {metricCount}
      </span>
    </>
  );
  const ariaLabel = `Open scores, ${group.label}, ${metricCount} metrics`;
  // A button only when a click does something; chips render inside clickable
  // rows, so the click must not also select the row.
  const chip = onClick ? (
    <button
      type="button"
      className="cursor-pointer"
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  ) : (
    <span aria-label={ariaLabel}>{label}</span>
  );

  const badge = (
    <BadgeShell asChild color="neutral" size={compact ? "sm" : "default"}>
      {chip}
    </BadgeShell>
  );

  return (
    <span className="inline-flex max-w-full min-w-0 cursor-default items-center gap-1">
      {levels.map((level) => (
        <ScoreTag key={level} level={level} />
      ))}
      {preview ? (
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
          <HoverCardContent className="w-60 p-2.5 text-xs">
            <ScoreHoverList scores={group.scores} formatName={metricLabel} />
          </HoverCardContent>
        </HoverCard>
      ) : (
        badge
      )}
    </span>
  );
};

export const GroupedScoreBadges = <T extends ChipScore>({
  scores,
  maxVisible,
  compact,
  hideLevels = false,
  overflowPreview = true,
  onOverflowClick,
}: {
  scores: T[];
  maxVisible?: number;
  compact?: boolean;
  /**
   * Whether hovering "+N" or an evaluator group chip lists the scores. Off
   * inside tree rows: the row's own hover card already lists them, and a
   * second card opens underneath it.
   */
  overflowPreview?: boolean;
  /** Click on "+N" or on an evaluator group chip. Callers open the node's
      Scores tab; without it both are inert. */
  onOverflowClick?: () => void;
  /** Suppress the level tag even on mixed rows — for dense surfaces (tree
      rows) where the level lives in the detail panel instead. */
  hideLevels?: boolean;
}) => {
  // One chip per group (see groupScoresForChips): an evaluator's metrics
  // count as ONE chip toward `maxVisible`, so a node scored by two evaluators
  // and a human still fits inline.
  const groups = groupScoresForChips(scores);

  // Level tags only when this selection MIXES levels (LFE-10596): a row whose
  // scores all share one level (the common case — e.g. a span's own
  // observation-level scores) needs no per-chip disambiguation; a mixed row
  // (e.g. the root carrying trace-level and observation-level scores) tags
  // each group so the levels are tellable apart.
  const showLevels =
    !hideLevels &&
    new Set(scores.map((score) => scoreLevelFromScore(score))).size > 1;

  const visibleGroups = maxVisible ? groups.slice(0, maxVisible) : groups;
  const hiddenGroups = maxVisible ? groups.slice(maxVisible) : [];

  // The shell colours its own text; a colour on the asChild element competes
  // with it by stylesheet order, so the number is coloured on an inner span.
  const overflowLabel = (
    <span className="text-muted-foreground">+{hiddenGroups.length}</span>
  );
  const overflowAriaLabel = `${hiddenGroups.length} more score${hiddenGroups.length === 1 ? "" : "s"}`;
  // No padding or type overrides: the shell's size variant is what the chips
  // next to it use. A button only when a click does something; chips render
  // inside clickable rows, so the click must not also select the row.
  const overflowPill = onOverflowClick ? (
    <button
      type="button"
      className="cursor-pointer"
      aria-label={`Open scores, ${overflowAriaLabel}`}
      onClick={(event) => {
        event.stopPropagation();
        onOverflowClick();
      }}
    >
      {overflowLabel}
    </button>
  ) : (
    <span aria-label={overflowAriaLabel}>{overflowLabel}</span>
  );

  return (
    <>
      {visibleGroups.map((group) =>
        group.kind === "evaluator" ? (
          <EvaluatorGroupBadge
            key={`evaluator:${group.label}`}
            group={group}
            compact={compact}
            showLevels={showLevels}
            preview={overflowPreview}
            onClick={onOverflowClick}
          />
        ) : (
          <ScoreBadge
            key={`name:${group.label}`}
            name={group.label}
            scores={group.scores}
            compact={compact}
            showLevels={showLevels}
          />
        ),
      )}
      {Boolean(hiddenGroups.length) && !overflowPreview && (
        <BadgeShell asChild color="neutral" size={compact ? "sm" : "default"}>
          {overflowPill}
        </BadgeShell>
      )}
      {Boolean(hiddenGroups.length) && overflowPreview && (
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <BadgeShell
              asChild
              color="neutral"
              size={compact ? "sm" : "default"}
            >
              {overflowPill}
            </BadgeShell>
          </HoverCardTrigger>
          {/* Same score list as the tree row hover card, and ALL of the group's
              scores, not just the hidden ones: the reader wants one list. */}
          <HoverCardContent className="w-60 p-2.5 text-xs">
            <ScoreHoverList scores={scores} />
          </HoverCardContent>
        </HoverCard>
      )}
    </>
  );
};
