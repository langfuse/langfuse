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
  observationId: string;
  traceId: string;
  level: string;

  // Time fields
  startTime: Date;

  // I/O data
  input?: string | null;
  output?: string | null;
  expectedOutput?: string | null;

  // Metrics - from separate query
  totalCost?: number | null;
  latencyMs?: number | null;

  // Metadata
  experimentId: string;
  experimentName: string;
  datasetId: string;
  rootSpanId: string;
  datasetItemVersion: string | null;
  metadata: Record<string, string>;
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
