import type { TraceIssue } from "@langfuse/shared";

export type TraceliftFinding = {
  id: TraceIssue;
  title: string;
  description: string | null;
  recommendation: string | null;
  examples: { traceId: string; observationId: string | null; href: string }[];
  /** Stored findings in the last 30 days. */
  issueCount: number;
  observationIds: string[];
  prompt: string | null;
};
