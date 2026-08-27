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
  type ScoreColumnAggregate,
  type ScoreColumnDataType,
  type ScoreColumnSummary,
} from "@/src/features/experiments/fns/summariseScoreColumn";

const formatScoreValue = (value: number) => value.toFixed(2);

/** How the column's aggregate reads, which depends on the score's type. */
const formatAggregate = (aggregate: ScoreColumnAggregate) => {
  if (aggregate.kind === "average")
    return `Ø ${formatScoreValue(aggregate.value)}`;
  if (aggregate.kind === "trueRate")
    return `${Math.round(aggregate.value * 100)}% true`;
  const modalCount =
    aggregate.distribution.find((entry) => entry.value === aggregate.modalValue)
      ?.count ?? 0;
  return `${aggregate.modalValue} ${modalCount}/${aggregate.count}`;
};

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
 * name: this experiment's aggregate and the item count behind it, and — with a
 * comparison selected — the comparison's aggregate, the signed delta and how
 * many items moved which way. This is what the deleted Analytics tab was going
 * to be, put where the eye already is. (LFE-15711)
 */
export const ScoreColumnHeaderSummary = ({
  label,
  dataType,
  summary,
  comparisonName,
  filterMenu,
}: {
  label: string;
  dataType: ScoreColumnDataType;
  summary: ScoreColumnSummary;
  comparisonName?: string;
  /** The column's way into the score comparison filter, rendered beside the name. */
  filterMenu?: React.ReactNode;
}) => {
  const { baseline, comparison, delta, movement } = summary;
  const notComparable = movement?.notComparable ?? 0;
  const { icon, label: nameLabel } = splitScoreDataTypeIcon(label);

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
            <span className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-[10px] leading-tight font-normal tabular-nums">
              {baseline ? (
                <>
                  <span className="text-foreground font-bold">
                    {formatAggregate(baseline)}
                  </span>
                  {baseline.kind !== "distribution" && (
                    <span>· {baseline.count}</span>
                  )}
                </>
              ) : (
                <span>no values</span>
              )}
            </span>
            {movement && (
              <span className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-[10px] leading-tight font-normal tabular-nums">
                {comparison && <span>vs {formatAggregate(comparison)}</span>}
                {delta !== null && delta !== 0 && (
                  <DiffLabel
                    diff={{
                      type: "NUMERIC",
                      absoluteDifference: Math.abs(delta),
                      direction: delta > 0 ? "+" : "-",
                    }}
                    formatValue={formatScoreValue}
                  />
                )}
                {movement.improved > 0 && (
                  <span className="text-dark-green font-bold">
                    ↗{movement.improved}
                  </span>
                )}
                {movement.regressed > 0 && (
                  <span className="text-dark-red font-bold">
                    ↘{movement.regressed}
                  </span>
                )}
                {movement.changed > 0 && <span>↻{movement.changed}</span>}
                {/* Items only one of the two runs scored: visible, and never
                  folded into the regression count. */}
                {notComparable > 0 && (
                  <span className="opacity-70">{notComparable} n/a</span>
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
            label={`This experiment (${DIFF_LABEL_TITLES[dataType]})`}
            value={baseline ? formatAggregate(baseline) : "no values"}
          />
          <SummaryRow label="Items scored" value={baseline?.count ?? 0} />
          {movement && (
            <>
              <SummaryRow
                label={comparisonName ? `vs ${comparisonName}` : "Comparison"}
                value={comparison ? formatAggregate(comparison) : "no values"}
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
              <SummaryRow
                label="Not comparable"
                value={movement.notComparable}
              />
              <span className="text-muted-foreground text-[10px]">
                Not comparable: only one of the two experiments has a score for
                the item, so it counts as neither an improvement nor a
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
