import { type FilterState, type ScoreAggregate } from "@langfuse/shared";
import { type VisibilityState } from "@tanstack/react-table";
import { type ReactNode } from "react";

// Shared font color palette for experiment rows/columns
export const EXPERIMENT_COLORS = [
  "text-dark-gray", // Baseline - index 0
  "text-blue-700", // Comparison 1
  "text-pink-700", // Comparison 2
  "text-purple-700", // Comparison 3
  "text-orange-700", // Comparison 4
] as const;

/**
 * Get the text color class for an experiment based on its index.
 */
export const getExperimentColor = (
  experimentId: string,
  allExperimentIds: string[],
): string => {
  const index = allExperimentIds.indexOf(experimentId);
  return EXPERIMENT_COLORS[index % EXPERIMENT_COLORS.length];
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
  /** Unique context ID to isolate filter state from other ExperimentsTable instances */
  sessionFilterContextId?: string;
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
