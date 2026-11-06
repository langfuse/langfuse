import { z } from "zod/v4";
import {
  numberFilter,
  stringFilter,
  stringOptionsFilter,
} from "../../interfaces/filters";

export const AGENT_METADATA_KEYS = {
  id: "langfuse_agent_id",
  name: "langfuse_agent_name",
  runId: "langfuse_agent_run_id",
  source: "langfuse_agent_identity_source",
} as const;

export const AGENT_LIMITS = {
  idLength: 256,
  runIdLength: 800,
  nameLength: 200,
  pageSize: 100,
  maxPage: 1_000,
  maxWindowDays: 30,
  filterConditions: 20,
  filterOptions: 100,
  filterValueLength: 256,
  activityBuckets: 48,
  maxActivityBuckets: 100,
} as const;

const filterText = z.string().max(AGENT_LIMITS.filterValueLength);
const agentStringFilter = stringFilter.extend({ value: filterText }).strict();
const agentStringOptionsFilter = stringOptionsFilter
  .extend({
    value: z.array(filterText).min(1).max(AGENT_LIMITS.filterOptions),
  })
  .strict();
export const AgentEnvironmentFilterSchema = z.union([
  agentStringFilter.extend({ column: z.literal("environment") }),
  agentStringOptionsFilter.extend({ column: z.literal("environment") }),
]);
export const AgentEnvironmentFilterListSchema = z
  .array(AgentEnvironmentFilterSchema)
  .max(AGENT_LIMITS.filterConditions);
export type AgentEnvironmentFilter = z.infer<
  typeof AgentEnvironmentFilterSchema
>;
export const AgentListFilterSchema = z.union([
  AgentEnvironmentFilterSchema,
  agentStringFilter.extend({ column: z.enum(["displayName", "id"]) }),
  agentStringOptionsFilter.extend({ column: z.enum(["displayName", "id"]) }),
  numberFilter
    .extend({
      column: z.enum([
        "runs",
        "traces",
        "modelCalls",
        "totalTokens",
        "cost",
        "errorRuns",
        "averageRunDurationMs",
      ]),
    })
    .strict(),
]);
export const AgentListFilterListSchema = z
  .array(AgentListFilterSchema)
  .max(AGENT_LIMITS.filterConditions);
export type AgentListFilter = z.infer<typeof AgentListFilterSchema>;

export type AgentIdentity = { kind: "id" | "name"; value: string };
export type AgentScope = {
  projectId: string;
  from: Date;
  to: Date;
  environment: string | null;
  environmentFilter?: AgentEnvironmentFilter[];
};
export type AgentDetailInput = AgentScope & { identity: AgentIdentity };
export type AgentActivityBucket = { timestamp: Date; count: number };
export type AgentActivitySeries = {
  identity: AgentIdentity;
  buckets: AgentActivityBucket[];
};
export type AgentActivityResult = {
  from: Date;
  to: Date;
  bucketMs: number;
  series: AgentActivitySeries[];
};
export type AgentCountActivityResult = {
  from: Date;
  to: Date;
  bucketMs: number;
  buckets: AgentActivityBucket[];
};
export type AgentActivityInput = AgentScope & {
  identities: AgentIdentity[];
  bucketCount?: number;
};
/** Immutable trace membership; normal table filters continue to select rows inside these traces. */
export const AgentTraceScopeSchema = z
  .object({
    mode: z.enum(["traces", "tools", "runs"]).optional(),
    identity: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("id"),
        value: z
          .string()
          .min(1)
          .max(AGENT_LIMITS.idLength)
          .refine((value) => value.trim().length > 0),
      }),
      z.object({
        kind: z.literal("name"),
        value: z
          .string()
          .min(1)
          .max(AGENT_LIMITS.nameLength)
          .refine((value) => value.trim().length > 0),
      }),
    ]),
    from: z.coerce.date(),
    to: z.coerce.date(),
    environment: z
      .string()
      .max(256)
      .refine((value) => value.trim().length > 0)
      .nullable(),
    environmentFilter: AgentEnvironmentFilterListSchema.optional(),
  })
  .refine(
    ({ from, to }) =>
      to.getTime() > from.getTime() &&
      to.getTime() - from.getTime() <= AGENT_LIMITS.maxWindowDays * 86400000,
    "Select a nonempty agent period of at most 30 days.",
  );
export type AgentTraceScope = z.infer<typeof AgentTraceScopeSchema>;
export type AgentPageInput = { page: number; pageSize: number };
export type AgentSort = "lastSeen" | "runs" | "cost" | "name";
export type AgentListInput = AgentScope &
  AgentPageInput & {
    search?: string;
    filter?: AgentListFilter[];
    sort: AgentSort;
    direction: "asc" | "desc";
  };
export type AgentListActivityInput = Omit<
  AgentListInput,
  "page" | "pageSize" | "sort" | "direction"
> & { bucketCount?: number };
export type AgentModelStats = {
  modelCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
  usageKnownCalls: number;
  pricedModelCalls: number;
  unattributedModelCalls: number;
  /** Unidentified model spans in participating traces; these are not allocated to this agent. */
  traceUnassignedModelCalls: number;
};
export type AgentStats = AgentModelStats & {
  runs: number;
  traces: number;
  errorRuns: number;
  averageRunDurationMs: number | null;
  observations?: number;
  toolCalls?: number;
  skillLoads?: number;
  completedRuns?: number;
  unfinishedRuns?: number;
  averageRunCost?: number | null;
  runCostKnownRuns?: number;
};
export type AgentOverviewStats = AgentStats & {
  observations: number;
  toolCalls: number;
  skillLoads: number;
  completedRuns: number;
  unfinishedRuns: number;
  averageRunCost: number | null;
  runCostKnownRuns: number;
  cacheHitRate: number | null;
  cacheReadInputTokens: number | null;
  cacheEligibleInputTokens: number | null;
  knownCacheModelCalls: number;
};
export type AgentOverviewBucket = {
  timestamp: Date;
  observations: number;
  runs: number;
  modelCalls: number;
  toolCalls: number;
  skillLoads: number;
  errorRuns: number;
  modelCost: number | null;
  averageRunDurationMs: number | null;
  averageRunCost: number | null;
  completedRuns: number;
  runCostKnownRuns: number;
  cacheHitRate: number | null;
  cacheReadInputTokens: number | null;
  cacheEligibleInputTokens: number | null;
  knownCacheModelCalls: number;
};
export type AgentOverviewPeriod = {
  from: Date;
  to: Date;
  stats: AgentOverviewStats;
  bucketMs: number;
  buckets: AgentOverviewBucket[];
};
export type AgentToolTrend = {
  name: string;
  currentCount: number;
  previousCount: number;
  buckets?: AgentActivityBucket[];
};
export type AgentSkillTrend = AgentToolTrend & {
  skillId: string | null;
  skillVersion: number | null;
  filePath: string;
};
export type AgentOverviewResult = {
  current: AgentOverviewPeriod;
  previous: AgentOverviewPeriod;
  tools: AgentToolTrend[];
  skills: AgentSkillTrend[];
  toolsTotalCount: number;
  skillsTotalCount: number;
  groupLimit: number;
};
export type AgentSummary = {
  identity: AgentIdentity;
  id: string | null;
  displayName: string;
  firstSeen: Date;
  lastSeen: Date;
  environments: string[];
  stats: AgentStats;
  comparison?: { from: Date; to: Date; stats: AgentOverviewStats };
};

export type {
  AgentQualityScore,
  AgentQualityInput,
  AgentQualityStats,
  AgentQualityOptions,
  AgentQualityResult,
  AgentRelationshipNode,
  AgentRelationship,
  AgentRelationshipsResult,
} from "./insights-api";
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
