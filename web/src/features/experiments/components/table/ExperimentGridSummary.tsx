import { ChevronDown, ChevronRight } from "lucide-react";
import { decomposeAggregateScoreKey } from "@/src/features/scores";
import { summariseScoreColumn } from "../../fns/summariseScoreColumn";
import {
  formatScoreColumnAggregate,
  formatScoreValue,
} from "../../fns/formatScoreColumnAggregate";
import { DiffLabel } from "@/src/features/datasets";
import { type ExperimentItemsTableRow } from "./types";
import { type VisibilityState } from "@tanstack/react-table";

export function ExperimentGridSummaryValues({
  rows,
  experimentId,
  baselineExperimentId,
  observationScoreOrder,
  traceScoreOrder,
  columnVisibility,
  showScoreLevelLabels,
  isLoading,
  expanded,
  showScoreNames,
  onToggle,
}: {
  rows: ExperimentItemsTableRow[];
  experimentId: string;
  baselineExperimentId?: string;
  observationScoreOrder: string[];
  traceScoreOrder: string[];
  columnVisibility: VisibilityState;
  showScoreLevelLabels: boolean;
  isLoading: boolean;
  expanded: boolean;
  showScoreNames: boolean;
  onToggle: () => void;
}) {
  const hasComparison =
    !!baselineExperimentId && experimentId !== baselineExperimentId;
  const scores = [
    ...observationScoreOrder.map((key) => ({
      key,
      field: "observationScores" as const,
      level: "Observation",
      columnId: key,
    })),
    ...traceScoreOrder.map((key) => ({
      key,
      field: "traceScores" as const,
      level: "Trace",
      columnId: `Trace-${key}`,
    })),
  ].filter((score) => columnVisibility[score.columnId] !== false);
  return (
    <div className="border-t py-1">
      <div className="h-6">
        {showScoreNames && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex h-6 items-center gap-1 rounded text-left text-[10px] font-normal focus-visible:ring-2 focus-visible:outline-none"
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            SUMMARY · this page ({rows.length} items)
          </button>
        )}
      </div>
      {expanded &&
        scores.map((score) => {
          const { name, dataType, source } = decomposeAggregateScoreKey(
            score.key,
          );
          const summary = summariseScoreColumn({
            pairs: rows.map((row) => ({
              baseline:
                row.experiments.find(
                  (exp) => exp.experimentId === experimentId,
                )?.[score.field]?.[score.key] ?? null,
              comparison:
                row.experiments.find(
                  (exp) => exp.experimentId === baselineExperimentId,
                )?.[score.field]?.[score.key] ?? null,
            })),
            dataType,
            hasComparison,
          });
          const { baseline: aggregate, delta, movement } = summary;
          let aggregateLabel = "not scored";
          if (aggregate) {
            aggregateLabel =
              aggregate.kind === "average"
                ? formatScoreValue(aggregate.value)
                : formatScoreColumnAggregate(aggregate);
          }
          const value = isLoading ? "Loading…" : aggregateLabel;
          const label = showScoreLevelLabels ? `${score.level}: ${name}` : name;
          return (
            <div
              key={score.columnId}
              className="flex h-7 min-w-0 items-center gap-4 px-1 font-normal tabular-nums"
              aria-label={`${label}: ${value}`}
            >
              {showScoreNames && (
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  title={`${label} (${source.toLowerCase()}, ${dataType.toLowerCase()})`}
                >
                  {label}
                </span>
              )}
              <div className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
                <span
                  className="text-foreground min-w-0 truncate text-xs font-bold"
                  title={value}
                >
                  {value}
                </span>
                {!isLoading &&
                  !hasComparison &&
                  aggregate?.kind === "average" && (
                    <span className="text-muted-foreground text-xs">AVG</span>
                  )}
                {!isLoading && delta !== null && (
                  <DiffLabel
                    variant="ghost"
                    diff={{
                      type: "NUMERIC",
                      absoluteDifference: Math.abs(delta),
                      direction: delta < 0 ? "-" : "+",
                    }}
                    formatValue={formatScoreValue}
                    title="Difference from baseline"
                  />
                )}
              </div>
              {!isLoading && movement && (
                <div
                  className="flex shrink-0 items-center gap-2 text-xs font-normal"
                  title={`${movement.unchanged} unchanged; ${movement.notComparable} not comparable`}
                >
                  {dataType === "CATEGORICAL" ? (
                    <span aria-label={`${movement.changed} changed items`}>
                      ↻ {movement.changed}
                    </span>
                  ) : (
                    <>
                      <span
                        className="text-dark-green"
                        title="Improved items"
                        aria-label={`${movement.improved} improved items`}
                      >
                        ↗ {movement.improved}
                      </span>
                      <span
                        className="text-dark-red"
                        title="Regressed items"
                        aria-label={`${movement.regressed} regressed items`}
                      >
                        ↘ {movement.regressed}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      {expanded && scores.length === 0 && showScoreNames && (
        <span className="text-muted-foreground text-xs">
          {isLoading ? "Loading scores…" : "No scores selected"}
        </span>
      )}
    </div>
  );
}
