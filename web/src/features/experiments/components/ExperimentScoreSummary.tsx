import { useId } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { type AggregatedScoreData } from "@langfuse/shared";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { ScoreTag } from "@/src/components/ScoreTag";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  getScoreLabelFromKey,
  splitScoreDataTypeIcon,
} from "@/src/features/scores";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { api } from "@/src/utils/api";
import {
  ExperimentScoreDisplaySettings,
  type RunScoreDisplay,
} from "./ExperimentScoreDisplaySettings";

/** One numeric score, with its value per selected experiment. */
type ScoreRow = {
  id: string;
  label: string;
  values: Record<string, number | undefined>;
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
  rows: ScoreRow[],
  query: { isPending: boolean; error: { message: string } | null },
): AsyncTableData<ScoreRow[]> {
  if (query.error) return { status: "error", error: query.error.message };
  if (query.isPending) return { status: "loading" };
  return { status: "success", data: rows };
}

/**
 * Experiment-level (run-level) scores of the selected experiments, above the
 * item table. These describe each whole experiment, so the item table's
 * filters, page, and layout never change them.
 */
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
  // Deltas and the "Baseline" label only mean something against another run.
  const comparedBaselineId =
    baselineId && experimentIds.length > 1 ? baselineId : undefined;
  const { experimentNames } = useExperimentNames({ projectId });
  const metrics = api.experiments.metrics.useQuery(
    { projectId, experimentIds, filter: null },
    { enabled: Boolean(projectId) && experimentIds.length > 0 && expanded },
  );

  const scoresByExperiment = new Map(
    (metrics.data ?? []).map((metric) => [metric.id, metric.experimentScores]),
  );
  const scoreKeys = new Set(
    experimentIds.flatMap((id) =>
      Object.entries(scoresByExperiment.get(id) ?? {}).flatMap(
        ([key, score]) => (score.type === "NUMERIC" ? [key] : []),
      ),
    ),
  );
  const rows: ScoreRow[] = [...scoreKeys]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      id: key,
      label: splitScoreDataTypeIcon(getScoreLabelFromKey(key)).label,
      values: Object.fromEntries(
        experimentIds.map((id) => [
          id,
          numericValue(scoresByExperiment.get(id)?.[key]),
        ]),
      ),
    }));

  const columns: ColumnDef<ScoreRow>[] = [
    { accessorKey: "label", header: "Score", size: 220 },
    ...experimentIds.flatMap((id): ColumnDef<ScoreRow>[] => {
      const name =
        experimentNames.find((experiment) => experiment.experimentId === id)
          ?.experimentName ?? id;
      const valueColumn: ColumnDef<ScoreRow> = {
        id,
        header: id === comparedBaselineId ? `Baseline: ${name}` : name,
        accessorFn: (row) => row.values[id],
        cell: ({ getValue }) => formatValue(getValue<number | undefined>()),
        cellClassName: "tabular-nums",
        size: 160,
      };
      if (!comparedBaselineId || id === comparedBaselineId) {
        return [valueColumn];
      }
      return [
        valueColumn,
        {
          id: `delta-${id}`,
          header: "Δ vs baseline",
          accessorFn: (row) => {
            const value = row.values[id];
            const baseline = row.values[comparedBaselineId];
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
              {comparedBaselineId && " Deltas are comparison minus baseline."}
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
