import type { ObservationType } from "../../domain";

export type AgentMetrics = {
  agentName: string;
  firstSeen: Date | null;
  lastSeen: Date | null;
  totalTraces: bigint;
  totalObservations: bigint;
  totalRuns: bigint;
  totalPromptTokens: bigint;
  totalCompletionTokens: bigint;
  totalTokens: bigint;
  sumCalculatedTotalCost: number;
  averageCostPerTrace: number;
};

export type AgentListResult = {
  totalAgents: number;
  agents: { agentName: string; totalTraces: bigint }[];
};

export type AgentSkillsResult = {
  skills: {
    skillName: string;
    invocations: number;
    traces: number;
    sampleTraceIds: string[];
    lastUsed: Date;
  }[];
  source: "tool-name-preview";
  limit: number;
  hasMore: boolean;
  inputTruncated: true;
};

export type AgentMapSkeletonRow = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  type: ObservationType;
  agentName: string | null;
  startTime: Date;
};

export type AgentMapSkeletonResult = {
  rows: AgentMapSkeletonRow[];
  traceIds: string[];
  traceCount: number;
  traceLimit: number;
  rowLimit: number;
  rowsTruncated: boolean;
  tracesTruncated: boolean;
  isTruncated: boolean;
  windowBounded: true;
};
