import { useMemo } from "react";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import { Badge } from "@/src/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DataTablePagination } from "@/src/components/table/data-table-pagination";
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
  formatScoreColumnAggregate,
  formatScoreValue,
} from "@/src/features/experiments/fns/formatScoreColumnAggregate";
import {
  summariseScoreColumn,
  type ScoreColumnDataType,
  type ScoreColumnSummary,
} from "@/src/features/experiments/fns/summariseScoreColumn";
import {
  scoreFieldForLevel,
  type ScoreLevel,
} from "@/src/features/experiments/fns/scoreComparisonFilter";
import {
  getExperimentColorStyles,
  type ExperimentItemsTableRow,
} from "./types";
import { cn } from "@/src/utils/tailwind";

/**
 * The pagination instance never renders cells, only counts rows, so it needs
 * no column defs. Module-level so the reference stays stable across renders.
 */
const NO_COLUMNS: ColumnDef<ExperimentItemsTableRow>[] = [];

/** One row of the matrix: a score column, read at its own level. */
export type ScoreMatrixRow = {
  scoreKey: string;
  level: ScoreLevel;
  dataType: ScoreColumnDataType;
  /** The column header, e.g. `Trace: # groundedness (eval)`. */
  label: string;
};

/** One column of the matrix: a selected experiment, the baseline first. */
export type ScoreMatrixColumn = {
  experimentId: string;
  experimentName: string;
  isBaseline: boolean;
};

const MatrixCell = ({
  summary,
  hasBaselineColumn,
}: {
  summary: ScoreColumnSummary;
  /** False for the baseline's own column, which has nothing to move against. */
  hasBaselineColumn: boolean;
}) => {
  const { baseline, delta, movement } = summary;
  const notComparable = movement?.notComparable ?? 0;

  if (!baseline)
    return <span className="text-muted-foreground">not scored</span>;

  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 tabular-nums">
      <span className="font-bold">{formatScoreColumnAggregate(baseline)}</span>
      {hasBaselineColumn && delta !== null && delta !== 0 && (
        <DiffLabel
          diff={{
            type: "NUMERIC",
            absoluteDifference: Math.abs(delta),
            direction: delta > 0 ? "+" : "-",
          }}
          formatValue={formatScoreValue}
        />
      )}
      {hasBaselineColumn && movement && movement.changed > 0 && (
        <span className="text-muted-foreground">↻{movement.changed}</span>
      )}
      {/* Items only one of the two runs scored: never folded into the delta. */}
      {hasBaselineColumn && notComparable > 0 && (
        <span className="text-muted-foreground opacity-70">
          {notComparable} n/a
        </span>
      )}
    </span>
  );
};

/**
 * The transpose of the grid: **scores as rows, experiments as columns**, every
 * cell the run's aggregate plus its move against the baseline column. Answers
 * "how did all my runs move on all my metrics" in one screen — what the deleted
 * Analytics tab was going to be.
 *
 * It needs no query of its own: the aggregates are the same ones the score
 * column headers compute, over the items already loaded for this page. Which
 * page that is stays the user's choice — see `paginationTable`.
 */
export const ExperimentScoreMatrix = ({
  rows,
  scoreRows,
  experiments,
  isLoading,
  pagination,
}: {
  rows: ExperimentItemsTableRow[];
  scoreRows: ScoreMatrixRow[];
  experiments: ScoreMatrixColumn[];
  isLoading: boolean;
  pagination: {
    totalCount: number | null;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
    options?: number[];
  };
}) => {
  const baselineExperimentId = experiments.find(
    (exp) => exp.isBaseline,
  )?.experimentId;

  const summaries = useMemo(() => {
    const scoresOf = (
      row: ExperimentItemsTableRow,
      experimentId: string,
      level: ScoreLevel,
    ) =>
      row.experiments.find((exp) => exp.experimentId === experimentId)?.[
        scoreFieldForLevel(level)
      ];

    // Cell (score, experiment) reads the experiment as the thing the delta
    // describes and the baseline column as what it moved against — the same
    // frame as a score column header.
    const byScore = new Map<string, Map<string, ScoreColumnSummary>>();
    for (const scoreRow of scoreRows) {
      const byExperiment = new Map<string, ScoreColumnSummary>();
      for (const experiment of experiments) {
        byExperiment.set(
          experiment.experimentId,
          summariseScoreColumn({
            pairs: rows.map((row) => ({
              baseline:
                scoresOf(row, experiment.experimentId, scoreRow.level)?.[
                  scoreRow.scoreKey
                ] ?? null,
              comparison:
                baselineExperimentId === undefined
                  ? null
                  : (scoresOf(row, baselineExperimentId, scoreRow.level)?.[
                      scoreRow.scoreKey
                    ] ?? null),
            })),
            dataType: scoreRow.dataType,
            hasComparison:
              baselineExperimentId !== undefined &&
              experiment.experimentId !== baselineExperimentId,
          }),
        );
      }
      byScore.set(`${scoreRow.level}-${scoreRow.scoreKey}`, byExperiment);
    }
    return byScore;
  }, [rows, scoreRows, experiments, baselineExperimentId]);

  // The matrix aggregates the items on the page instead of listing them, so it
  // has no table of its own to drive the pagination bar. A headless instance
  // over the same rows and the same URL-held state does, which keeps the
  // aggregate's window under the user's control rather than pinning it to
  // whichever page was open first.
  const paginationTable = useReactTable({
    data: rows,
    columns: NO_COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount:
      pagination.totalCount === null
        ? -1
        : Math.ceil(Number(pagination.totalCount) / pagination.state.pageSize),
    onPaginationChange: pagination.onChange,
    state: { pagination: pagination.state },
  });

  if (isLoading)
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    );

  const allExperimentIds = experiments.map((exp) => exp.experimentId);

  // The empty state shares the footer, so the page controls stay reachable
  // when the items on this page happen to carry none of the visible scores.
  if (scoreRows.length === 0)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center p-4">
          <span className="text-muted-foreground text-sm">
            No score columns are visible for the items in view.
          </span>
        </div>
        <MatrixFooter
          scoreCount={0}
          experimentCount={experiments.length}
          itemCount={rows.length}
          paginationTable={paginationTable}
          paginationOptions={pagination.options}
          isLoading={isLoading}
        />
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-max border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="bg-background text-muted-foreground sticky top-0 left-0 z-20 min-w-[220px] border-b p-2 text-left font-normal">
                Score
              </th>
              {experiments.map((experiment) => {
                const colorStyles = getExperimentColorStyles(
                  experiment.experimentId,
                  allExperimentIds,
                );
                return (
                  <th
                    key={experiment.experimentId}
                    className="bg-background sticky top-0 z-10 min-w-[150px] border-b p-2 text-left font-normal"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span
                        className={cn(
                          "block h-3 w-0.5 shrink-0 rounded-full",
                          colorStyles.markerClass,
                        )}
                      />
                      <span
                        className="truncate font-bold"
                        title={experiment.experimentName}
                      >
                        {experiment.experimentName}
                      </span>
                      {experiment.isBaseline && (
                        <Badge
                          size="sm"
                          variant="secondary"
                          className="shrink-0"
                        >
                          baseline
                        </Badge>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {scoreRows.map((scoreRow) => {
              const { icon, label } = splitScoreDataTypeIcon(scoreRow.label);
              const byExperiment = summaries.get(
                `${scoreRow.level}-${scoreRow.scoreKey}`,
              );
              return (
                <tr key={`${scoreRow.level}-${scoreRow.scoreKey}`}>
                  <th
                    scope="row"
                    className="bg-background sticky left-0 z-10 min-w-[220px] border-b p-2 text-left font-normal"
                  >
                    <span className="flex min-w-0 items-baseline gap-1">
                      {icon && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground shrink-0 cursor-default">
                              {icon}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[280px]">
                            {getScoreDataTypeExplanation(scoreRow.dataType)}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <span className="truncate" title={scoreRow.label}>
                        {label}
                      </span>
                    </span>
                  </th>
                  {experiments.map((experiment) => {
                    const summary = byExperiment?.get(experiment.experimentId);
                    return (
                      <td
                        key={experiment.experimentId}
                        className="min-w-[150px] border-b p-2 align-top"
                      >
                        {summary ? (
                          <MatrixCell
                            summary={summary}
                            hasBaselineColumn={!experiment.isBaseline}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MatrixFooter
        scoreCount={scoreRows.length}
        experimentCount={experiments.length}
        itemCount={rows.length}
        paginationTable={paginationTable}
        paginationOptions={pagination.options}
        isLoading={isLoading}
      />
    </div>
  );
};

/**
 * What the numbers above cover, and the control that changes it. The scope
 * sentence and the page controls sit on one line deliberately: the aggregate
 * is a window over the run, so reading it without seeing which window is
 * selected invites the wrong conclusion.
 */
const MatrixFooter = ({
  scoreCount,
  experimentCount,
  itemCount,
  paginationTable,
  paginationOptions,
  isLoading,
}: {
  scoreCount: number;
  experimentCount: number;
  itemCount: number;
  paginationTable: TanStackTable<ExperimentItemsTableRow>;
  paginationOptions?: number[];
  isLoading: boolean;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-2 py-1.5">
    <span className="text-muted-foreground text-[10px]">
      {scoreCount} score{scoreCount === 1 ? "" : "s"} × {experimentCount} run
      {experimentCount === 1 ? "" : "s"}, aggregated over the {itemCount} item
      {itemCount === 1 ? "" : "s"} on this page. Deltas are measured against the
      baseline column.
    </span>
    <DataTablePagination
      table={paginationTable}
      isLoading={isLoading}
      paginationOptions={paginationOptions}
    />
  </div>
);
