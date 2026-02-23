import { type ScoreAggregate } from "@langfuse/shared";

// Type matches backend ExperimentEventsWithMetricsReturnType
export type ExperimentsTableRow = {
  // Identity fields
  id: string;
  name: string;
  description: string | null;

  // Related entities
  datasetId: string;

  // Time fields
  createdAt: Date;
  updatedAt: Date;

  // Core properties
  itemCount: number;
  errorCount: number;

  // Metrics
  totalCost?: number;
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;

  // Scores - dynamic columns
  scores: ScoreAggregate;
};

export type ExperimentsTableProps = {
  projectId: string;
  hideControls?: boolean;
};
