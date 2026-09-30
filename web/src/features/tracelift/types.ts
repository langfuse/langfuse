export type TraceliftFinding = {
  id: string;
  title: string;
  description: string;
  /** Affected observations in the last 30 days. */
  observationCount: number;
  /** Combined Langfuse ingestion cost in USD over the same 30 days, excluding model costs. */
  langfuseIngestionCostUsd: number;
  observationIds: string[];
  prompt: string;
  observationNames: string[];
};

/** Distinct affected observations across all conditions, counted and billed once. */
export type TraceliftSummary = Pick<
  TraceliftFinding,
  "observationCount" | "langfuseIngestionCostUsd"
>;
