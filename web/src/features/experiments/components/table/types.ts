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
