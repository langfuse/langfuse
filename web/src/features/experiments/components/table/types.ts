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
  createdAt: Date;
  updatedAt: Date;

  // Core properties
  itemCount: number;
  errorCount: number;

  // Metrics - from separate query
  totalCost?: number | null;
  latencyAvg?: number | null;
  itemScores?: ScoreAggregate; // Item-level scores
  experimentScores?: ScoreAggregate; // Experiment-level scores
};

export type ExperimentsTableProps = {
  projectId: string;
  hideControls?: boolean;
};

/**
 * Row type for the experiment items table.
 * Represents a single item within an experiment (one trace execution).
 */
export type ExperimentItemsTableRow = {
  // Identity fields
  id: string; // experiment_item_id
  experimentId: string;
  traceId: string;
  datasetItemId: string;

  // Time fields
  startTime: Date;

  // I/O data
  input?: string;
  output?: string;
  expectedOutput?: string;

  // Metrics - from separate query
  totalCost?: number | null;
  latencyMs?: number | null;
  scores?: ScoreAggregate;

  // Metadata
  itemMetadata?: Record<string, unknown>;
};

/**
 * Props for the ExperimentItemsTable component.
 */
export type ExperimentItemsTableProps = {
  projectId: string;
  experimentId: string;
  datasetId: string;
  hideControls?: boolean;
};
