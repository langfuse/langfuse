import { z } from "zod/v4";
import type { AgentDetailInput, AgentIdentity } from "./api";

export const AgentQualityScoreSchema = z.object({
  name: z.string(),
  dataType: z.enum(["NUMERIC", "BOOLEAN"]),
  source: z.enum(["API", "EVAL", "ANNOTATION"]),
  configId: z.string().nullable(),
});
export type AgentQualityScore = z.infer<typeof AgentQualityScoreSchema>;
export type AgentQualityInput = AgentDetailInput & {
  score: AgentQualityScore;
  bucketCount?: number;
};
export type AgentQualityStats = {
  average: number | null;
  scoredRuns: number;
  totalRuns: number;
};
export type AgentQualityOptions = {
  items: (AgentQualityScore & { scoredRuns: number })[];
  hasMore: boolean;
};
export type AgentQualityResult = {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  bucketMs: number;
  score: AgentQualityScore;
  current: AgentQualityStats;
  previous: AgentQualityStats;
  buckets: ({ timestamp: Date } & AgentQualityStats)[];
  models: {
    kind: "single" | "multiple" | "unknown";
    name: string | null;
    current: AgentQualityStats;
    previous: AgentQualityStats;
  }[];
  hasMoreModels: boolean;
};
export type AgentRelationshipNode = {
  identity: AgentIdentity;
  displayName: string;
};
export type AgentRelationship = {
  parent: AgentRelationshipNode;
  child: AgentRelationshipNode;
  runs: number;
  traces: number;
  childOwnModelCost: number | null;
  pricedModelCalls: number;
  modelCalls: number;
  example: { traceId: string; observationId: string; startTime: Date };
};
export type AgentRelationshipsResult = {
  items: AgentRelationship[];
  coverage: {
    traces: number;
    spans: number;
    unresolvedRuns: number;
    truncated: boolean;
    maxTraces: number;
    maxSpans: number;
  };
};
