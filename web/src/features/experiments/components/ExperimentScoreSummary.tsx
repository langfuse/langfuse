import { useId } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  type AggregatedScoreData,
  type ScoreAggregate,
} from "@langfuse/shared";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { ScoreTag } from "@/src/components/ScoreTag";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  ExperimentScoreDisplaySettings,
  type RunScoreDisplay,
} from "./ExperimentScoreDisplaySettings";
import {
  getScoreLabelFromKey,
  splitScoreDataTypeIcon,
} from "@/src/features/scores";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { api } from "@/src/utils/api";

type ExperimentScoreRow = {
  id: string;
  label: string;
  scores: Record<string, ScoreAggregate>;
};

function numericValue(score: AggregatedScoreData | undefined) {
  if (score?.type !== "NUMERIC" || !Number.isFinite(score.average)) {
    return undefined;
  }
  return score.average;
}

function formatValue(value: number | undefined) {
  if (value === undefined) return "—";
  return value.toLocaleString("en-US", { maximumSignificantDigits: 4 });
}

function formatDelta(value: number | undefined) {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${formatValue(value)}`;
}

function tableData(
  rows: ExperimentScoreRow[],
  query: { isPending: boolean; error: { message: string } | null },
): AsyncTableData<ExperimentScoreRow[]> {
  if (query.error) return { status: "error", error: query.error.message };
  if (query.isPending) return { status: "loading" };
  return { status: "success", data: rows };
}

export function ExperimentScoreSummary({
  projectId,
  experimentIds,
  baselineId,
}: {
  projectId: string;
  experimentIds: string[];
  baselineId?: string;
}) {
  const panelId = useId();
  const [display, setDisplay] = useLocalStorage<RunScoreDisplay>(
    "experiment-run-scores-display",
    "collapsed",
  );
  const expanded = display !== "collapsed";
  const compact = display === "compact";
  const isComparing = Boolean(baselineId) && experimentIds.length > 1;
  const { experimentNames } = useExperimentNames({ projectId });
  // Run scores describe the whole experiment, independent of the item table's
  // filters, visible page, and layout.
  const metrics = api.experiments.metrics.useQuery(
    { projectId, experimentIds, filter: null },
    { enabled: Boolean(projectId) && experimentIds.length > 0 && expanded },
  );

  const scores = Object.fromEntries(
    (metrics.data ?? [])
      .filter((metric) => experimentIds.includes(metric.id))
      .map((metric) => [metric.id, metric.experimentScores]),
  );
  const keys = Array.from(
    new Set(
      Object.values(scores).flatMap((aggregate) =>
        Object.entries(aggregate).flatMap(([key, score]) =>
          score.type === "NUMERIC" ? [key] : [],
        ),
      ),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const rows = keys.map((key) => ({
    id: key,
    label: splitScoreDataTypeIcon(getScoreLabelFromKey(key)).label,
    scores,
  }));

  const columns: ColumnDef<ExperimentScoreRow>[] = [
    { accessorKey: "label", header: "Score", size: 220 },
    ...experimentIds.flatMap((id): ColumnDef<ExperimentScoreRow>[] => {
      const name =
        experimentNames.find((experiment) => experiment.experimentId === id)
          ?.experimentName ?? id;
      const valueColumn: ColumnDef<ExperimentScoreRow> = {
        id,
        header: isComparing && id === baselineId ? `Baseline: ${name}` : name,
        accessorFn: (row) => numericValue(row.scores[id]?.[row.id]),
        cell: ({ getValue }) => formatValue(getValue<number | undefined>()),
        cellClassName: "tabular-nums",
        size: 160,
      };
      if (!baselineId || id === baselineId) return [valueColumn];
      return [
        valueColumn,
        {
          id: `delta-${id}`,
          header: "Δ vs baseline",
          accessorFn: (row) => {
            const value = numericValue(row.scores[id]?.[row.id]);
            const baseline = numericValue(row.scores[baselineId]?.[row.id]);
            if (value === undefined || baseline === undefined) return undefined;
            return value - baseline;
          },
          cell: ({ getValue }) => formatDelta(getValue<number | undefined>()),
          cellClassName: "text-muted-foreground tabular-nums",
          size: 120,
        },
      ];
    }),
  ];
  return (
    <section
      aria-label="Experiment-level score summary"
      className="flex max-h-64 shrink-0 flex-col gap-2 border-b px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold">
          <ExpandToggle
            expanded={expanded}
            onExpandedChange={(open) =>
              setDisplay(open ? "compact" : "collapsed")
            }
            label="Run-level scores"
            expandedLabel="Run-level scores"
            variant="icon"
            size="sm"
            controls={panelId}
          />
        </h2>
        <ScoreTag level="experiment" />
        <div className="ml-auto">
          <ExperimentScoreDisplaySettings
            display={display}
            onDisplayChange={setDisplay}
          />
        </div>
      </div>
      {expanded && (
        <div
          id={panelId}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
        >
          {!compact && (
            <p className="text-muted-foreground text-xs">
              Whole-experiment numeric scores. Item filters and pagination do
              not change these values.
              {isComparing && " Deltas are comparison minus baseline."}
            </p>
          )}
          <Table
            tableName="Experiment-level scores"
            columns={columns}
            data={tableData(rows, metrics)}
            loadingRowCount={2}
            rowHeight={compact ? "xs" : "s"}
            noResultsMessage="No numeric experiment-level scores recorded."
          />
        </div>
      )}
    </section>
  );
}
