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
  ScoreDetail,
  hasScoreDetail,
} from "@/src/components/ScoreBadge/ScoreDetail";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import {
  groupScoresForChips,
  groupSummary,
  metricLabel,
  type ScoreChipGroup,
} from "@/src/components/ScoreBadge/groupScoresForChips";
import { cn } from "@/src/utils/tailwind";

type ChipScore = WithStringifiedMetadata<ScoreDomain> | LastUserScore;

/** What the "+N" hover lists: one line per chip, so a score group shows
 * as `Prefix(N)` with its summary, exactly like its chip, not as N metrics.
 * No summary (mixed types): the value slot stays empty, the label has the
 * count. */
type OverflowHoverRow = {
  name: string;
  dataType: string;
  value?: number | null;
  stringValue?: string | null;
  comment?: string | null;
  hasComment?: boolean;
};

const overflowHoverRows = <T extends ChipScore>(
  groups: ReadonlyArray<ScoreChipGroup<T>>,
): OverflowHoverRow[] =>
  groups.flatMap((group): OverflowHoverRow[] => {
    if (group.kind !== "group") return [...group.scores];
    const { count, text: summary } = groupSummary(group);
    return [
      {
        name: `${group.label}(${count})`,
        dataType: "CATEGORICAL",
        value: null,
        stringValue: summary ?? "",
        hasComment: group.scores.some((score) => Boolean(score.comment)),
      },
    ];
  });

/** What any score hover lists for a node's scores: one line per chip, so
 * the tree row card and the "+N" hover read exactly like the chips. */
export const scoreHoverRows = <T extends ChipScore>(
  scores: ReadonlyArray<T>,
): OverflowHoverRow[] => overflowHoverRows(groupScoresForChips(scores));

/**
 * One chip for one score group: the shared prefix, how many metrics it holds
 * and their summary (see groupSummary). Hover lists the metrics (suffix only,
 * the prefix is the chip); click goes to the node's Scores tab, the only
 * place twenty metrics with their comments and metadata fit.
 */
const ScoreGroupBadge = <T extends ChipScore>({
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
  const projectId = useProjectIdFromURL();
  const { count: metricCount, text: summary } = groupSummary(group);
  // Metrics with a comment, metadata or execution trace get the full block
  // the per-name chip card shows; the rest stay one name/value line.
  const detailed = group.scores.filter(hasScoreDetail);
  const plain = group.scores.filter((score) => !hasScoreDetail(score));
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
        {group.label}({metricCount}){summary ? ":" : ""}
      </span>
      {summary ? (
        <span className="text-muted-foreground text-nowrap tabular-nums">
          {summary}
        </span>
      ) : null}
    </>
  );
  const ariaLabel = `Open scores, ${group.label}, ${metricCount} metrics${summary ? `, ${summary}` : ""}`;
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
          <HoverCardContent className="flex max-h-[50dvh] w-max max-w-xs flex-col gap-3 overflow-y-auto p-2.5 text-xs break-normal whitespace-normal">
            {plain.length > 0 ? (
              <ScoreHoverList scores={plain} formatName={metricLabel} />
            ) : null}
            {detailed.map((score) => (
              <div key={score.id} className="flex flex-col gap-1">
                <p className="font-bold" title={score.name}>
                  {metricLabel(score.name)}
                </p>
                <ScoreDetail score={score} showValue projectId={projectId} />
              </div>
            ))}
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
   * Whether hovering "+N" or a score group chip lists the scores. Off
   * inside tree rows: the row's own hover card already lists them, and a
   * second card opens underneath it.
   */
  overflowPreview?: boolean;
  /** Click on "+N" or on a score group chip. Callers open the node's
      Scores tab; without it both are inert. */
  onOverflowClick?: () => void;
  /** Suppress the level tag even on mixed rows — for dense surfaces (tree
      rows) where the level lives in the detail panel instead. */
  hideLevels?: boolean;
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
        group.kind === "group" ? (
          <ScoreGroupBadge
            key={`group:${group.label}`}
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
          {/* One line per chip, ALL of them, not just the hidden ones: the
              reader wants one list, and a group reads as its chip does. */}
          <HoverCardContent className="w-max max-w-xs p-2.5 text-xs">
            <ScoreHoverList scores={overflowHoverRows(groups)} />
          </HoverCardContent>
        </HoverCard>
      )}
    </>
  );
};
