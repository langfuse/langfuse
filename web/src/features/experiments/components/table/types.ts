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
