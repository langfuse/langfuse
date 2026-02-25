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

  // Scores - dynamic columns
  scores: ScoreAggregate;
};

export type ExperimentsTableProps = {
  projectId: string;
  hideControls?: boolean;
};
