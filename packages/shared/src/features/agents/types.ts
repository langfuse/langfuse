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

export type AgentProjectionWindow = { from: Date; to: Date };

export type AgentProjectionStats = {
  sessions: number;
  invocations: number;
  traces: number;
  observations: number;
  toolInvocations: number;
  cost: number;
  tokens: number;
  averageCostPerSession: number | null;
  averageToolsPerSession: number | null;
  averageSessionDurationMs: number | null;
  completeSessions: number;
  zeroToolSessions: number;
};

export type AgentProjectionSignal = {
  kind:
    | "tool-change"
    | "missing-tools"
    | "cost-outlier"
    | "runtime-outlier"
    | "steps-outlier";
  message: string;
  sessionIds: string[];
};

export type AgentProjectionSummary = {
  agentName: string;
  firstSeen: Date | null;
  lastSeen: Date | null;
  state: "active" | "dormant";
  current: AgentProjectionStats;
  baseline: AgentProjectionStats;
  recent: AgentProjectionStats;
  comparisonStatus: "ready" | "insufficient-data" | "incomplete-cohort";
  excludedSessions: number;
  signals: AgentProjectionSignal[];
  tasks: string[];
  areas: string[];
  topics: string[];
  availableSkillNames: string[];
};

export type AgentProjectionSession = {
  id: string;
  kind: "session" | "trace";
  agentName: string;
  sessionId: string | null;
  traceId: string | null;
  traceCount: number;
  sampleTraceIds: string[];
  participatingAgentNames: string[];
  firstSeen: Date;
  lastSeen: Date;
  sessionFirstSeen: Date;
  sessionLastSeen: Date;
  agentObservedDurationMs: number;
  sessionElapsedMs: number;
  invocations: number;
  toolInvocations: number;
  observationCount: number;
  toolNames: string[];
  skillNames: string[];
  cost: number;
  tokens: number;
  completePerSession: boolean;
  windowCost: number;
  windowTokens: number;
  windowToolInvocations: number;
  windowInvocations: number;
  windowObservationCount: number;
  completenessReason:
    | "complete"
    | "open-span"
    | "window-clipped"
    | "row-limit"
    | "missing-session-id";
  inWindow: boolean;
  comparisonPeriod: "baseline" | "recent" | null;
};

export type AgentProjectionTool = {
  agentName: string;
  name: string;
  invocations: number;
  sessions: number;
  traces: number;
  lastUsed: Date | null;
  available: boolean;
};

export type AgentProjectionSkill = AgentProjectionTool & {
  source: "native" | "tool-name-preview" | "mixed";
  sampleTraceIds: string[];
};

export type AgentProjectionActivity = {
  agentName: string;
  timestamp: Date;
  sessions: number;
  invocations: number;
  toolInvocations: number;
  observations: number;
  skillInvocations: number;
  cost: number;
  tokens: number;
};

export type AgentProjectionRelationship = {
  source: string;
  target: string;
  kind: "calls" | "tools" | "tasks" | "areas" | "topics";
  weight: number;
  evidence: string[];
  provenance:
    | "trace-ancestry"
    | "declared-session-link"
    | "observed-tools"
    | "declared-label";
};

export type AgentSessionProjection = {
  activityBucketMs: number;
  window: AgentProjectionWindow;
  recentWindow: AgentProjectionWindow;
  baselineWindow: AgentProjectionWindow;
  discoveryWindow: AgentProjectionWindow;
  agents: AgentProjectionSummary[];
  sessions: AgentProjectionSession[];
  tools: AgentProjectionTool[];
  skills: AgentProjectionSkill[];
  activity: AgentProjectionActivity[];
  relationships: AgentProjectionRelationship[];
  map: AgentMapSkeletonResult;
  coverage: {
    source: "metadata-preview";
    agentLimit: number;
    sessionLimit: number;
    rowLimit: number;
    groupsLimit: number;
    agentsTruncated: boolean;
    sessionsTruncated: boolean;
    rowsTruncated: boolean;
    groupsTruncated: boolean;
    historyComplete: boolean;
    missingSessionTraces: number;
    unlinkedObservations: number;
    incompleteSessions: number;
    inputTruncated: true;
    settledMinutes: number;
  };
};
