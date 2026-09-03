import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { DiffLabel } from "@/src/features/datasets/components/DiffLabel";
import {
  getScoreDataTypeExplanation,
  splitScoreDataTypeIcon,
} from "@/src/features/scores/lib/scoreColumns";
import {
  type ScoreColumnDataType,
  type ScoreColumnSummary,
} from "@/src/features/experiments/fns/summariseScoreColumn";
import {
  formatScoreColumnAggregate,
  formatScoreValue,
} from "@/src/features/experiments/fns/formatScoreColumnAggregate";

const DIFF_LABEL_TITLES: Record<ScoreColumnDataType, string> = {
  NUMERIC: "average",
  BOOLEAN: "true-rate",
  CATEGORICAL: "modal value",
};

/** The type, quietly: the marker the column already had, now explained. */
const ScoreDataTypeMarker = ({
  icon,
  dataType,
}: {
  icon: string;
  dataType: ScoreColumnDataType;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="text-muted-foreground shrink-0 cursor-default">
        {icon}
      </span>
    </TooltipTrigger>
    <TooltipContent className="max-w-[280px]">
      {getScoreDataTypeExplanation(dataType)}
    </TooltipContent>
  </Tooltip>
);

const SummaryRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-baseline justify-between gap-4 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

/**
 * A score column's header, carrying the analysis instead of only the column's
 * name: the baseline experiment's aggregate and the item count behind it, and —
 * with a comparison selected — the comparison's aggregate, the signed delta and
 * how many items moved which way. This is what the deleted Analytics tab was
 * going to be, put where the eye already is.
 */
export const ScoreColumnHeaderSummary = ({
  label,
  dataType,
  summary,
  comparisonName,
  hasBaseline,
  filterMenu,
}: {
  label: string;
  dataType: ScoreColumnDataType;
  summary: ScoreColumnSummary;
  comparisonName?: string;
  /**
   * Whether the run the aggregate belongs to is the selected baseline. With
   * comparisons but no baseline the first selected run stands in, and calling
   * that a baseline claims a selection the user has not made.
   */
  hasBaseline: boolean;
  /** The column's way into the score comparison filter, rendered beside the name. */
  filterMenu?: React.ReactNode;
}) => {
  const { baseline, comparison, delta, movement } = summary;
  const { icon, label: nameLabel } = splitScoreDataTypeIcon(label);
  // A zero delta says nothing a reader cannot see from the two aggregates, so
  // it does not earn a line; the movement counts still might.
  const deltaToShow = delta !== null && delta !== 0 ? delta : null;
  const hasMovementCounts = Boolean(
    movement && (movement.improved || movement.regressed || movement.changed),
  );
  // The counts are the part a narrow column clips, so they say the same thing
  // in words on hover.
  const movementCountsTitle = [
    movement?.improved ? `${movement.improved} improved` : null,
    movement?.regressed ? `${movement.regressed} regressed` : null,
    movement?.changed ? `${movement.changed} changed` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    // The filter menu sits outside the hover-card trigger so its own popover is
    // not fighting the hover card for the pointer.
    <div className="flex min-w-0 flex-1 items-start gap-1">
      <HoverCard>
        <HoverCardTrigger asChild>
          <div className="flex min-w-0 flex-1 cursor-default flex-col gap-0.5 py-0.5">
            <span className="flex min-w-0 items-baseline gap-1">
              {icon && <ScoreDataTypeMarker icon={icon} dataType={dataType} />}
              <span className="truncate" title={label}>
                {nameLabel}
              </span>
            </span>
            {/* The values: this column's aggregate, and the one it moved from.
              The item count is deliberately NOT here — of the numbers competing
              for these two lines it is the least valuable, it already has a
              labelled row in the hover, and giving it up is what leaves the
              movement counts room to stay beside their delta. */}
            <span className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-[10px] leading-tight font-normal tabular-nums">
              {/* `truncate`: each aggregate is one value, so it moves to the
                next line whole rather than breaking in the middle of itself —
                a categorical's `mostly-grounded 9/11` is long enough to do
                that. And if one value alone is wider than the column, it ends
                in an ellipsis: a value that stops with no mark reads as the
                whole value. */}
              {baseline ? (
                <span
                  className="text-foreground min-w-0 truncate font-bold"
                  title={formatScoreColumnAggregate(baseline)}
                >
                  {formatScoreColumnAggregate(baseline)}
                </span>
              ) : (
                <span>no values</span>
              )}
              {/* Independent of the baseline's own aggregate: a score the
                comparison recorded and this run has not yet is exactly the
                case worth seeing. */}
              {comparison && (
                <span
                  className="min-w-0 truncate"
                  title={`vs ${formatScoreColumnAggregate(comparison)}`}
                >
                  vs {formatScoreColumnAggregate(comparison)}
                </span>
              )}
            </span>
            {/* The movement: how far, and how many items moved which way.
              One line that does not wrap — a count is only readable as a
              movement next to the delta it belongs to. The delta keeps its
              full width; the counts are what give way, whole and marked with
              an ellipsis, so a narrow column drops them here instead of
              bleeding over the header beside it — the hover card carries every
              count in full.

              The not-scored count is deliberately not here either — it is
              accounted for in the hover card. */}
            {(deltaToShow !== null || hasMovementCounts) && (
              <span className="text-muted-foreground flex min-w-0 items-center gap-x-1 overflow-hidden text-[10px] leading-tight font-normal tabular-nums">
                {deltaToShow !== null && (
                  <DiffLabel
                    diff={{
                      type: "NUMERIC",
                      absoluteDifference: Math.abs(deltaToShow),
                      direction: deltaToShow > 0 ? "+" : "-",
                    }}
                    formatValue={formatScoreValue}
                  />
                )}
                {hasMovementCounts && (
                  // Not a flex row: `text-overflow` only applies to a block
                  // box's inline content, and it is what drops a count whole
                  // and marks it, instead of clipping `↘141` into `↘1`.
                  <span
                    className="min-w-0 truncate"
                    title={movementCountsTitle}
                  >
                    {movement && movement.improved > 0 && (
                      <span className="text-dark-green pr-1 font-bold">
                        ↗{movement.improved}
                      </span>
                    )}
                    {movement && movement.regressed > 0 && (
                      <span className="text-dark-red pr-1 font-bold">
                        ↘{movement.regressed}
                      </span>
                    )}
                    {movement && movement.changed > 0 && (
                      <span className="pr-1">↻{movement.changed}</span>
                    )}
                  </span>
                )}
              </span>
            )}
          </div>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="flex w-64 flex-col gap-1 p-3 font-normal"
        >
          <span className="text-xs font-bold break-all">{label}</span>
          <span className="text-muted-foreground text-[10px]">
            {getScoreDataTypeExplanation(dataType)}
          </span>
          <SummaryRow
            label={`${
              hasBaseline ? "Baseline experiment" : "This experiment"
            } (${DIFF_LABEL_TITLES[dataType]})`}
            value={
              baseline ? formatScoreColumnAggregate(baseline) : "no values"
            }
          />
          <SummaryRow label="Items scored" value={baseline?.count ?? 0} />
          {movement && (
            <>
              <SummaryRow
                label={comparisonName ? `vs ${comparisonName}` : "Comparison"}
                value={
                  comparison
                    ? formatScoreColumnAggregate(comparison)
                    : "no values"
                }
              />
              {delta !== null && (
                <SummaryRow
                  label="Change"
                  value={`${delta > 0 ? "+" : ""}${formatScoreValue(delta)}`}
                />
              )}
              {dataType === "CATEGORICAL" ? (
                <SummaryRow label="Changed value" value={movement.changed} />
              ) : (
                <>
                  <SummaryRow label="Improved" value={movement.improved} />
                  <SummaryRow label="Regressed" value={movement.regressed} />
                </>
              )}
              <SummaryRow label="Unchanged" value={movement.unchanged} />
              <SummaryRow label="Not scored" value={movement.notComparable} />
              <span className="text-muted-foreground text-[10px]">
                Not scored: only one of the two experiments has a score for the
                item — or, for a categorical score, the item has no single value
                to compare — so it counts as neither an improvement nor a
                regression.
              </span>
            </>
          )}
        </HoverCardContent>
      </HoverCard>
      {filterMenu}
    </div>
  );
};
