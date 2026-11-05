export const AGENT_METADATA_KEYS = {
  id: "langfuse_agent_id",
  name: "langfuse_agent_name",
  runId: "langfuse_agent_run_id",
  source: "langfuse_agent_identity_source",
} as const;

export const AGENT_LIMITS = {
  idLength: 256,
  nameLength: 200,
  pageSize: 100,
  maxPage: 1_000,
  maxWindowDays: 30,
} as const;

export type AgentIdentity = { kind: "id" | "name"; value: string };
export type AgentScope = {
  projectId: string;
  from: Date;
  to: Date;
  environment: string | null;
};
export type AgentDetailInput = AgentScope & { identity: AgentIdentity };
export type AgentPageInput = { page: number; pageSize: number };
export type AgentSort = "lastSeen" | "runs" | "cost" | "name";
export type AgentListInput = AgentScope &
  AgentPageInput & {
    search?: string;
    sort: AgentSort;
    direction: "asc" | "desc";
  };
export type AgentModelStats = {
  modelCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  usageKnownCalls: number;
  pricedModelCalls: number;
  unattributedModelCalls: number;
};
export type AgentStats = AgentModelStats & {
  runs: number;
  traces: number;
  errorRuns: number;
  averageRunDurationMs: number | null;
};
export type AgentSummary = {
  identity: AgentIdentity;
  id: string | null;
  displayName: string;
  firstSeen: Date;
  lastSeen: Date;
  environments: string[];
  stats: AgentStats;
};
export type AgentPage<T> = {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};
export type AgentRunRow = AgentModelStats & {
  id: string;
  traceId: string;
  sessionId: string | null;
  name: string;
  environment: string;
  startTime: Date;
  endTime: Date | null;
  durationMs: number | null;
  status: "error" | "ended" | "open";
};
export type AgentTraceRow = AgentModelStats & {
  id: string;
  name: string;
  sessionId: string | null;
  startTime: Date;
  endTime: Date | null;
  runs: number;
};
export type AgentSkillRow = {
  skillId: string | null;
  skillVersion: number | null;
  name: string;
  filePath: string;
  loads: number;
  traces: number;
  firstSeen: Date;
  lastSeen: Date;
  sampleTraceIds: string[];
};
export type AgentInfo = {
  identity: AgentIdentity;
  id: string | null;
  displayName: string;
  environment: string;
  source: { traceId: string; observationId: string; startTime: Date };
  agentVersion: string | null;
  description: string | null;
  descriptionTruncated: boolean;
  scopeName: string | null;
  scopeVersion: string | null;
  serviceName: string | null;
  serviceVersion: string | null;
  model: {
    name: string;
    parameters: string | null;
    parametersTruncated: boolean;
    sourceObservationId: string;
    sourceTraceId: string;
    prompt: { id: string; name: string; version: number | null } | null;
  } | null;
};
