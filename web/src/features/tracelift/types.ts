export type TraceliftFinding = {
  id: string;
  title: string;
  description: string | null;
  /** Stored findings in the last 30 days. */
  issueCount: number;
  /** Combined Langfuse ingestion cost in USD over the same 30 days, excluding model costs. */
  langfuseIngestionCostUsd: number | null;
  observationIds: string[];
  prompt: string | null;
  observationNames: string[];
};

/** Total stored findings across all categories; cost is null when unavailable. */
export type TraceliftSummary = Pick<
  TraceliftFinding,
  "issueCount" | "langfuseIngestionCostUsd"
>;
