import { type ScoreAggregate } from "@langfuse/shared";

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
};

/**
 * Data for a single experiment within an item row.
 */
export type ExperimentItemData = {
  experimentId: string;
  level: string;
  startTime: Date;
  observationId: string;
  traceId: string;
  experimentRootId: string;
  scores: ScoreAggregate;
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
  // Identity field - the dataset item ID
  itemId: string;

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
  experimentId: string;
  datasetId: string;
  hideControls?: boolean;
  /** Available experiments for filter targeting (baseline + comparisons) */
  availableExperiments?: ExperimentOption[];
};
