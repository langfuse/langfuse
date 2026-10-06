import { type ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { DiffLabel } from "@/src/features/datasets";
import { splitScoreDataTypeIcon } from "@/src/features/scores";
import {
  type ScoreColumnAggregate,
  type ScoreColumnDataType,
  type ScoreColumnSummary,
} from "@/src/features/experiments/fns/summariseScoreColumn";
import {
  formatScoreColumnAggregate,
  formatScoreValue,
} from "@/src/features/experiments/fns/formatScoreColumnAggregate";

const DIFF_LABEL_TITLES: Record<ScoreColumnDataType, string> = {
  NUMERIC: "AVG",
  BOOLEAN: "true-rate",
  CATEGORICAL: "modal value",
};

const SummaryRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

const movementCountsTitle = (summary: ScoreColumnSummary) => {
  const { movement } = summary;
  if (!movement) return "";
  return [
    movement.improved ? `${movement.improved} improved` : null,
    movement.regressed ? `${movement.regressed} regressed` : null,
    movement.changed ? `${movement.changed} changed` : null,
  ]
    .filter(Boolean)
    .join(", ");
};

const hasMovementCounts = (summary: ScoreColumnSummary) => {
  const { movement } = summary;
  return Boolean(
    movement && (movement.improved || movement.regressed || movement.changed),
  );
};

const ComparisonHoverCard = ({
  dataType,
  summary,
  comparisonName,
  hasBaseline,
  children,
}: {
  dataType: ScoreColumnDataType;
  summary: ScoreColumnSummary;
  comparisonName?: string;
  hasBaseline: boolean;
  children: ReactNode;
}) => {
  const { baseline, comparison, delta, movement } = summary;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="flex min-w-0 cursor-default flex-col">{children}</div>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="flex w-64 flex-col gap-1 p-3 font-normal"
      >
        <SummaryRow
          label={`${
            hasBaseline ? "Baseline experiment" : "This experiment"
          } (${DIFF_LABEL_TITLES[dataType]})`}
          value={baseline ? formatScoreColumnAggregate(baseline) : "no values"}
        />
        <SummaryRow label="Items scored" value={baseline?.count ?? 0} />
        {movement && (
          <>
            <SummaryRow
              label={comparisonName ?? "Comparison"}
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
              <SummaryRow
                label="Changed value"
                value={`↻${movement.changed}`}
              />
            ) : (
              <>
                <SummaryRow
                  label="Improved"
                  value={
                    <span className="text-dark-green font-bold">
                      ↗{movement.improved}
                    </span>
                  }
                />
                <SummaryRow
                  label="Regressed"
                  value={
                    <span className="text-dark-red font-bold">
                      ↘{movement.regressed}
                    </span>
                  }
                />
              </>
            )}
            <SummaryRow label="Unchanged" value={movement.unchanged} />
            <SummaryRow label="Not scored" value={movement.notComparable} />
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
};

const BaselineHeaderLine = ({
  baseline,
  baselineText,
}: {
  baseline: ScoreColumnAggregate | null;
  baselineText: string;
}) => (
  <span className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-[10px] leading-tight font-normal tabular-nums">
    {baseline ? (
      <>
        <span
          className="text-foreground min-w-0 truncate font-bold"
          title={baselineText}
        >
          {baselineText}
        </span>
        {baseline.kind === "average" && (
          <span className="text-muted-foreground">AVG</span>
        )}
      </>
    ) : (
      <span>no values</span>
    )}
  </span>
);

const ComparisonHeaderLine = ({
  summary,
  dataType,
}: {
  summary: ScoreColumnSummary;
  dataType: ScoreColumnDataType;
}) => {
  const { comparison, delta } = summary;
  const deltaToShow = delta !== null && delta !== 0 ? delta : null;
  const comparisonText = comparison
    ? formatScoreColumnAggregate(comparison)
    : "no values";

  return (
    <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1 overflow-hidden text-[10px] leading-tight font-normal tabular-nums">
      <span className="min-w-0 truncate" title={comparisonText}>
        {comparisonText}
      </span>
      {deltaToShow !== null && (
        <DiffLabel
          variant="ghost"
          diff={{
            type: "NUMERIC",
            absoluteDifference: Math.abs(deltaToShow),
            direction: deltaToShow > 0 ? "+" : "-",
          }}
          formatValue={formatScoreValue}
        />
      )}
      {hasMovementCounts(summary) && summary.movement && (
        <span className="min-w-0 truncate" title={movementCountsTitle(summary)}>
          {dataType === "CATEGORICAL" ? (
            summary.movement.changed > 0 && (
              <span className="pr-1">↻{summary.movement.changed}</span>
            )
          ) : (
            <>
              {summary.movement.improved > 0 && (
                <span className="text-dark-green pr-1 font-bold">
                  ↗{summary.movement.improved}
                </span>
              )}
              {summary.movement.regressed > 0 && (
                <span className="text-dark-red pr-1 font-bold">
                  ↘{summary.movement.regressed}
                </span>
              )}
            </>
          )}
        </span>
      )}
    </span>
  );
};

/**
 * A score column's header, carrying the analysis instead of only the column's
 * name: the baseline experiment's aggregate, and — with comparisons selected —
 * one line per comparison with that run's aggregate, the signed delta, and how
 * many items moved which way.
 */
export const ScoreColumnHeaderSummary = ({
  label,
  dataType,
  summaries,
  comparisonNames,
  hasBaseline,
  expanded,
  filterMenu,
}: {
  label: string;
  dataType: ScoreColumnDataType;
  summaries: ScoreColumnSummary[];
  comparisonNames: string[];
  /**
   * Whether the run the aggregate belongs to is the selected baseline. With
   * comparisons but no baseline the first selected run stands in, and calling
   * that a baseline claims a selection the user has not made.
   */
  hasBaseline: boolean;
  expanded: boolean;
  /** The column's way into the score comparison filter, rendered beside the name. */
  filterMenu?: ReactNode;
}) => {
  const { icon, label: nameLabel } = splitScoreDataTypeIcon(label);
  const baseline = summaries[0]?.baseline ?? null;
  const comparisonSummaries = summaries.filter(
    (summary) => summary.movement !== null,
  );
  const baselineText = baseline
    ? formatScoreColumnAggregate(baseline)
    : "no values";

  return (
    // The filter menu sits outside the hover-card trigger so its own popover is
    // not fighting the hover card for the pointer.
    <div className="flex min-w-0 flex-1 items-start gap-1">
      <div className="flex min-w-0 flex-1 cursor-default flex-col gap-0.5 py-0.5">
        <span className="flex min-w-0 items-baseline gap-1">
          {icon && (
            <span className="text-muted-foreground shrink-0">{icon}</span>
          )}
          <span className="truncate" title={label}>
            {nameLabel}
          </span>
        </span>
        {expanded &&
          summaries[0] &&
          (comparisonSummaries.length === 0 ? (
            <ComparisonHoverCard
              dataType={dataType}
              summary={summaries[0]}
              hasBaseline={hasBaseline}
            >
              <BaselineHeaderLine
                baseline={baseline}
                baselineText={baselineText}
              />
            </ComparisonHoverCard>
          ) : (
            <>
              <BaselineHeaderLine
                baseline={baseline}
                baselineText={baselineText}
              />
              {comparisonSummaries.map((summary, index) => (
                <ComparisonHoverCard
                  key={comparisonNames[index] ?? index}
                  dataType={dataType}
                  summary={summary}
                  comparisonName={comparisonNames[index]}
                  hasBaseline={hasBaseline}
                >
                  <ComparisonHeaderLine summary={summary} dataType={dataType} />
                </ComparisonHoverCard>
              ))}
            </>
          ))}
      </div>
      {filterMenu}
    </div>
  );
};
