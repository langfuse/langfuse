import { type FilterState, type ScoreAggregate } from "@langfuse/shared";
import { type VisibilityState } from "@tanstack/react-table";
import { type ReactNode } from "react";

// Shared font color palette for experiment rows/columns
export const EXPERIMENT_COLOR_STYLES = [
  {
    textClass: "text-foreground",
    markerClass: "bg-foreground",
    badgeClass: "border-foreground bg-foreground text-background",
  }, // Baseline - index 0
  {
    textClass: "text-blue-700 dark:text-blue-300",
    markerClass: "bg-blue-500/80 dark:bg-blue-400/80",
    badgeClass:
      "border-blue-500/45 bg-blue-500/12 text-blue-700 dark:border-blue-400/45 dark:bg-blue-400/15 dark:text-blue-300",
  }, // Comparison 1
  {
    textClass: "text-violet-700 dark:text-violet-300",
    markerClass: "bg-violet-500/80 dark:bg-violet-400/80",
    badgeClass:
      "border-violet-500/45 bg-violet-500/12 text-violet-700 dark:border-violet-400/45 dark:bg-violet-400/15 dark:text-violet-300",
  }, // Comparison 2
  {
    textClass: "text-teal-700 dark:text-teal-300",
    markerClass: "bg-teal-500/80 dark:bg-teal-400/80",
    badgeClass:
      "border-teal-500/45 bg-teal-500/12 text-teal-700 dark:border-teal-400/45 dark:bg-teal-400/15 dark:text-teal-300",
  }, // Comparison 3
  {
    textClass: "text-amber-700 dark:text-amber-300",
    markerClass: "bg-amber-500/80 dark:bg-amber-400/80",
    badgeClass:
      "border-amber-500/45 bg-amber-500/12 text-amber-700 dark:border-amber-400/45 dark:bg-amber-400/15 dark:text-amber-300",
  }, // Comparison 4
  {
    textClass: "text-rose-700 dark:text-rose-300",
    markerClass: "bg-rose-500/80 dark:bg-rose-400/80",
    badgeClass:
      "border-rose-500/45 bg-rose-500/12 text-rose-700 dark:border-rose-400/45 dark:bg-rose-400/15 dark:text-rose-300",
  }, // Comparison 5
  {
    textClass: "text-cyan-700 dark:text-cyan-300",
    markerClass: "bg-cyan-500/80 dark:bg-cyan-400/80",
    badgeClass:
      "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:border-cyan-400/45 dark:bg-cyan-400/15 dark:text-cyan-300",
  }, // Comparison 6
  {
    textClass: "text-lime-700 dark:text-lime-300",
    markerClass: "bg-lime-500/80 dark:bg-lime-400/80",
    badgeClass:
      "border-lime-500/45 bg-lime-500/12 text-lime-700 dark:border-lime-400/45 dark:bg-lime-400/15 dark:text-lime-300",
  }, // Comparison 7
  {
    textClass: "text-fuchsia-700 dark:text-fuchsia-300",
    markerClass: "bg-fuchsia-500/80 dark:bg-fuchsia-400/80",
    badgeClass:
      "border-fuchsia-500/45 bg-fuchsia-500/12 text-fuchsia-700 dark:border-fuchsia-400/45 dark:bg-fuchsia-400/15 dark:text-fuchsia-300",
  }, // Comparison 8
  {
    textClass: "text-orange-700 dark:text-orange-300",
    markerClass: "bg-orange-500/80 dark:bg-orange-400/80",
    badgeClass:
      "border-orange-500/45 bg-orange-500/12 text-orange-700 dark:border-orange-400/45 dark:bg-orange-400/15 dark:text-orange-300",
  }, // Comparison 9
  {
    textClass: "text-indigo-700 dark:text-indigo-300",
    markerClass: "bg-indigo-500/80 dark:bg-indigo-400/80",
    badgeClass:
      "border-indigo-500/45 bg-indigo-500/12 text-indigo-700 dark:border-indigo-400/45 dark:bg-indigo-400/15 dark:text-indigo-300",
  }, // Comparison 10
] as const;

export type ExperimentColorStyle = (typeof EXPERIMENT_COLOR_STYLES)[number];

/**
 * Get the text color class for an experiment based on its index.
 */
export const getExperimentColor = (
  experimentId: string,
  allExperimentIds: string[],
): string => {
  const styles = getExperimentColorStyles(experimentId, allExperimentIds);
  return styles.textClass;
};

export const getExperimentColorStyles = (
  experimentId: string,
  allExperimentIds: string[],
): ExperimentColorStyle => {
  const index = allExperimentIds.indexOf(experimentId);
  return (
    EXPERIMENT_COLOR_STYLES[index % EXPERIMENT_COLOR_STYLES.length] ??
    EXPERIMENT_COLOR_STYLES[0]
  );
};

export type ExperimentsTableRow = {
  // Identity fields
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prompts: Array<[string, number | null]>;

  // Related entities
  datasetId: string;

  // Time fields
  startTime: Date;

  // Core properties
  itemCount: number;
  errorCount: number;

  // Metrics - from separate query
  totalCost?: number | null;
  latencyAvg?: number | null;
  // Item-level scores split by observation vs trace
  traceItemScores?: ScoreAggregate; // Scores on traces (observation_id IS NULL)
  observationItemScores?: ScoreAggregate; // Scores on observations (observation_id IS NOT NULL)
  experimentScores?: ScoreAggregate; // Experiment-level scores (direct dataset_run match)
};

export type ExperimentsTableProps = {
  projectId: string;
  hideControls?: boolean;
  /** Default filters to apply on mount when no existing filters are set */
  defaultFilter?: FilterState;
  /** Hidden filters that scope the table but should not be user-visible */
  fixedFilter?: FilterState;
  /** Unique context ID to isolate filter state from other ExperimentsTable instances */
  sessionFilterContextId?: string;
  /**
   * When true, render the time-range picker and auto-refresh button in the
   * page header (next to the title) via the header controls slot, instead of
   * inside the table toolbar. Only used when the table is the primary content
   * of a `Page`.
   */
  showControlsInPageHeader?: boolean;
};

/**
 * Data for a single experiment within an item row.
 */
export type ExperimentItemData = {
  experimentId: string;
  level: string;
  startTime: Date;
  totalCost?: number | null;
  latencyMs?: number | null;
  observationId: string;
  traceId: string;
  observationScores: ScoreAggregate;
  traceScores: ScoreAggregate;
};

/**
 * Output data for a single experiment.
 */
export type ExperimentOutputData = {
  experimentId: string;
  output: string | null;
};

/**
 * Row type for the experiment items table.
 * Each row represents one item_id with data from multiple experiments.
 */
export type ExperimentItemsTableRow = {
  // Identity fields
  itemId: string;
  id?: string; // Added for DataTable row identification (peek view)

  // Data from each experiment for this item
  experiments: ExperimentItemData[];

  // IO data (from batchIO query)
  input?: string | null; // From base experiment only
  expectedOutput?: string | null; // From base experiment only
  outputs?: ExperimentOutputData[]; // From ALL experiments
};

/**
 * Available experiment option for filter targeting.
 */
export type ExperimentOption = {
  id: string;
  name: string;
};

/**
 * Props for the ExperimentItemsTable component.
 */
export type ExperimentItemsTableProps = {
  projectId: string;
  hideControls?: boolean;
  /** Available experiments for filter targeting (baseline + comparisons) */
  availableExperiments?: ExperimentOption[];
};

/**
 * Definition for a row within a grid cell - mirrors LangfuseColumnDef pattern.
 * Used by ExperimentGridCell to declaratively define sections with visibility control.
 */
export type CellRowDef<TData> = {
  accessorKey: string; // Maps to columnVisibility key
  header?: string; // Optional display label
  cell?: (props: { data: TData }) => ReactNode; // Render function
  defaultHidden?: boolean; // Default visibility state
  children?: CellRowDef<TData>[]; // Nested rows (for score groups)
};

/**
 * Filters cell rows based on columnVisibility state.
 * Returns only rows where visibility is not explicitly set to false.
 */
export function getVisibleCellRows<TData>(
  rows: CellRowDef<TData>[],
  columnVisibility: VisibilityState,
): CellRowDef<TData>[] {
  return rows.filter((row) => columnVisibility[row.accessorKey] !== false);
}
