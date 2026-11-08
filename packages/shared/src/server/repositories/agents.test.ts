import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("./clickhouse", () => ({
  queryClickhouse: query,
  parseClickhouseUTCDateTimeFormat: (value: string) =>
    new Date(value.replace(" ", "T") + "Z"),
  clickhouseCompliantRandomCharacters: () => "agentTest",
}));

import {
  getAgentDetail,
  getAgentEnvironments,
  getAgentInfo,
  getAgentRuns,
  getAgentSkills,
  getAgentTraces,
  listAgents,
} from "./agents";
import {
  AgentEnvironmentFilterListSchema,
  AgentListFilterListSchema,
  AgentTraceScopeSchema,
} from "../../features/agents/api";

const scope = {
  projectId: "agents-project",
  from: new Date("2026-11-05T11:00:00Z"),
  to: new Date("2026-11-05T15:00:00Z"),
  environment: "production",
};
const identity = { kind: "id" as const, value: "agent-with-stable-id" };
const list = {
  ...scope,
  page: 0,
  pageSize: 24,
  sort: "runs" as const,
  direction: "desc" as const,
};
const aggregate = {
  identity_kind: "id",
  identity_value: identity.value,
  display_name: "Renamed researcher",
  first_seen: "2026-11-05 11:00:00.000000",
  last_seen: "2026-11-05 14:59:00.000000",
  environments: ["production"],
  runs: "4",
  traces: "2",
  error_runs: "1",
  average_run_duration_ms: null,
  model_calls: "3",
  usage_known_calls: "0",
  priced_model_calls: "0",
  unattributed_model_calls: "1",
  input_tokens: null,
  output_tokens: null,
  total_tokens: null,
  cost: null,
  total_count: "1",
};

describe("Agents production read contract", () => {
  beforeEach(() => query.mockReset().mockResolvedValue([]));

  it("accepts bounded native conditions and rejects unsupported columns or filter types", () => {
    expect(
      AgentTraceScopeSchema.parse({ ...scope, identity, mode: "runs" }).mode,
    ).toBe("runs");
    expect(
      AgentListFilterListSchema.safeParse([
        { column: "cost", type: "string", operator: "contains", value: "1" },
      ]).success,
    ).toBe(false);
    expect(
      AgentEnvironmentFilterListSchema.safeParse([
        { column: "id", type: "string", operator: "=", value: "other" },
      ]).success,
    ).toBe(false);
    expect(
      AgentListFilterListSchema.safeParse([
        { column: "projectId", type: "string", operator: "=", value: "other" },
      ]).success,
    ).toBe(false);
    const filter = {
      column: "environment",
      type: "stringOptions",
      operator: "none of",
      value: ["🤖".repeat(256)],
    };
    expect(AgentEnvironmentFilterListSchema.parse([filter])).toEqual([filter]);
    expect(
      AgentEnvironmentFilterListSchema.safeParse([
        { ...filter, value: ["🤖".repeat(257)] },
      ]).success,
    ).toBe(false);
  });

  it("keeps missing model usage and price unknown while retaining distinct run and trace counts", async () => {
    query.mockResolvedValueOnce([aggregate]);
    const result = await listAgents(list);
    expect(result.items[0]).toMatchObject({
      identity,
      displayName: "Renamed researcher",
      stats: {
        runs: 4,
        traces: 2,
        modelCalls: 3,
        errorRuns: 1,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        cost: null,
        pricedModelCalls: 0,
        usageKnownCalls: 0,
        unattributedModelCalls: 1,
      },
    });
    expect(result.totalCount).toBe(1);
  });

  it("deduplicates revisions before mutable environment and identity eligibility and aggregates only model calls", async () => {
    await getAgentDetail({ ...scope, identity });
    const call = query.mock.calls[0]?.[0];
    expect(call.query).toContain("FROM events_core e");
    expect(call.query).toContain("ORDER BY e.event_ts DESC");
    expect(call.query.indexOf("LIMIT 1 BY e.trace_id, e.span_id")).toBeLessThan(
      call.query.indexOf("environment = {agentEnvironment"),
    );
    expect(call.query.indexOf("LIMIT 1 BY e.trace_id, e.span_id")).toBeLessThan(
      call.query.indexOf("= {agentValue"),
    );
    expect(call.query).toContain("mapContains(cost_details, 'total')");
    expect(call.query).toContain("type = 'GENERATION'");
    expect(call.query).not.toContain("FINAL");
    expect(call.query).not.toContain("e.input");
    expect(call.query).not.toContain("e.metadata_values");
    expect(call.params).toMatchObject({
      projectId: scope.projectId,
      agentEnvironment: "production",
      agentKind: "id",
      agentValue: identity.value,
    });
    expect(call.query).toMatch(/e\.start_time >= \{agentsFrom:/);
    expect(call.query).toMatch(/e\.start_time < \{agentsTo:/);
  });

  it("limits revision sorting to agent candidate span identities before reading model payload columns", async () => {
    await getAgentDetail({ ...scope, identity });
    const sql = query.mock.calls[0]?.[0].query;
    expect(sql).toContain("(e.trace_id, e.span_id) IN (SELECT");
    expect(sql).toContain("candidateAgentValue");
    expect(sql.indexOf("candidateAgentValue")).toBeLessThan(
      sql.indexOf("ORDER BY e.event_ts DESC"),
    );
    expect(sql.lastIndexOf("agentValue: String")).toBeGreaterThan(
      sql.indexOf("LIMIT 1 BY e.trace_id, e.span_id"),
    );
  });
  it("validates historical native identities only after their latest revision and hides an invalid display name", async () => {
    await listAgents(list);
    const sql = query.mock.calls[0]?.[0].query;
    expect(sql).toContain("lengthUTF8(agent_id) <= 256");
    expect(sql).toContain("lengthUTF8(agent_name) <= 200");
    expect(sql.lastIndexOf("lengthUTF8(agent_id) <= 256")).toBeGreaterThan(
      sql.indexOf("LIMIT 1 BY e.trace_id, e.span_id"),
    );
    query.mockResolvedValueOnce([
      {
        agent_id: identity.value,
        agent_name: "😀".repeat(201),
        trace_id: "trace",
        span_id: "run",
        environment: "production",
        start_time: aggregate.last_seen,
      },
    ]);
    const info = await getAgentInfo({ ...scope, identity });
    expect(info?.displayName).toBe(identity.value);
  });

  it("reports unidentified generations as trace-level ambiguity without allocating their calls or cost", async () => {
    query.mockResolvedValueOnce([{ ...aggregate, cost: "0.031" }]);
    query.mockResolvedValueOnce([
      {
        identity_kind: "id",
        identity_value: identity.value,
        trace_unassigned_model_calls: "3",
      },
    ]);
    const result = await getAgentDetail({ ...scope, identity });
    expect(result?.stats).toMatchObject({
      modelCalls: 3,
      cost: 0.031,
      unattributedModelCalls: 1,
      traceUnassignedModelCalls: 3,
    });
    const coverage = query.mock.calls[1]?.[0];
    expect(coverage.params).toMatchObject({
      projectId: scope.projectId,
      agentEnvironment: "production",
    });
    expect(coverage.query).toContain(
      "uniqExact(tuple(unassigned.trace_id, unassigned.span_id))",
    );
    expect(coverage.query).not.toContain("cost_details");
  });
  it("returns non-additive trace-level warnings for repeated runs in the same trace", async () => {
    query.mockResolvedValueOnce(
      [1, 2].map((i) => ({
        ...aggregate,
        id: `run-${i}`,
        trace_id: "shared",
        start_time: aggregate.first_seen,
        end_time: aggregate.last_seen,
        status: "ended",
        model_calls: "1",
      })),
    );
    query.mockResolvedValueOnce([
      { trace_id: "shared", trace_unassigned_model_calls: "2" },
    ]);
    const result = await getAgentRuns({
      ...scope,
      identity,
      page: 0,
      pageSize: 50,
    });
    expect(
      result.items.map((row) => [
        row.modelCalls,
        row.traceUnassignedModelCalls,
      ]),
    ).toEqual([
      [1, 2],
      [1, 2],
    ]);
    const coverage = query.mock.calls[1]?.[0];
    expect(coverage.params.coverageTraceIds).toEqual(["shared"]);
    expect(
      coverage.query.lastIndexOf("agent_id = '' AND agent_name = ''"),
    ).toBeGreaterThan(
      coverage.query.lastIndexOf("LIMIT 1 BY e.trace_id, e.span_id"),
    );
  });

  it("preserves known zero usage and free requests and exact identity without normalizing case", async () => {
    query.mockResolvedValueOnce([
      {
        ...aggregate,
        identity_kind: "name",
        identity_value: "Résumé / v1?",
        input_tokens: "0",
        output_tokens: "0",
        total_tokens: "0",
        cost: "0",
        priced_model_calls: "3",
        usage_known_calls: "3",
      },
    ]);
    const result = await listAgents({ ...list, search: "Résumé / v1?" });
    expect(result.items[0]).toMatchObject({
      identity: { kind: "name", value: "Résumé / v1?" },
      id: null,
      stats: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        pricedModelCalls: 3,
        usageKnownCalls: 3,
      },
    });
    expect(query.mock.calls[0]?.[0].params.agentSearch).toBe("Résumé / v1?");
  });

  it("returns the real total for an empty out-of-range page", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: "9" }]);
    expect(await listAgents({ ...list, page: 2 })).toMatchObject({
      items: [],
      totalCount: 9,
      page: 2,
    });
  });

  it("separates native skill versions and resource paths and deduplicates repeated references per observation", async () => {
    query.mockResolvedValueOnce([
      {
        skill_id: "skill-id",
        skill_version: 2,
        skill_name: "citation",
        file_path: "references/cases.md",
        loads: "3",
        traces: "2",
        first_seen: aggregate.first_seen,
        last_seen: aggregate.last_seen,
        sample_trace_ids: ["trace-1", "trace-2"],
        total_count: "1",
      },
    ]);
    const result = await getAgentSkills({
      ...scope,
      identity,
      page: 0,
      pageSize: 50,
    });
    expect(result.items[0]).toMatchObject({
      skillId: "skill-id",
      skillVersion: 2,
      name: "citation",
      filePath: "references/cases.md",
      loads: 3,
      sampleTraceIds: ["trace-1", "trace-2"],
    });
    expect(query.mock.calls[0]?.[0].query).toContain(
      "arrayDistinct(skills_resource_loaded)",
    );
    expect(query.mock.calls[0]?.[0].query).toContain(
      "GROUP BY skill_id, skill_version, skill_name, file_path",
    );
  });

  it("keys model attribution by trace and owning agent run, preserving repeated runs of the same identity", async () => {
    await getAgentRuns({ ...scope, identity, page: 0, pageSize: 50 });
    const sql = query.mock.calls[0]?.[0].query;
    expect(sql).toContain("GROUP BY trace_id, agent_run_id");
    expect(sql).toContain(
      "r.trace_id = m.trace_id AND r.span_id = m.agent_run_id",
    );
    expect(sql).toContain("agent_run_id = span_id");
  });

  it("qualifies trace aggregate inputs so output timestamp aliases cannot produce nested aggregates", async () => {
    await getAgentTraces({ ...scope, identity, page: 0, pageSize: 50 });
    const sql = query.mock.calls[0]?.[0].query;
    expect(sql).toContain("min(trace_events.start_time)");
    expect(sql).toContain("max(trace_events.end_time)");
    expect(sql).toContain(
      "tuple(trace_events.start_time, trace_events.event_ts, trace_events.span_id)",
    );
  });

  it("keeps attributed trace evidence reachable when its owning agent run starts outside the period", async () => {
    await getAgentTraces({ ...scope, identity, page: 0, pageSize: 50 });
    expect(query.mock.calls[0]?.[0].query).not.toContain("HAVING runs > 0");
    query.mockClear();
    await getAgentDetail({ ...scope, identity });
    expect(query.mock.calls[0]?.[0].query).toContain(
      "uniqExact(trace_id) AS traces",
    );
  });

  it("pins configuration and model evidence to one latest agent run instead of a historical union", async () => {
    query.mockResolvedValueOnce([
      {
        agent_id: identity.value,
        agent_name: "Research",
        trace_id: "latest-trace",
        span_id: "latest-run",
        environment: "production",
        start_time: aggregate.last_seen,
        agent_description: "Observed description",
        description_truncated: 0,
      },
    ]);
    query.mockResolvedValueOnce([
      {
        trace_id: "latest-trace",
        span_id: "model-1",
        provided_model_name: "model",
        model_parameters: "{}",
        prompt_id: "prompt-id",
        prompt_name: "prompt",
        prompt_version: 2,
      },
    ]);
    const result = await getAgentInfo({ ...scope, identity });
    expect(result).toMatchObject({
      source: { traceId: "latest-trace", observationId: "latest-run" },
      model: {
        sourceTraceId: "latest-trace",
        sourceObservationId: "model-1",
        prompt: { id: "prompt-id", version: 2 },
      },
    });
    expect(query.mock.calls[1]?.[0].params).toMatchObject({
      infoTrace: "latest-trace",
      infoRun: "latest-run",
    });
    expect(query.mock.calls[1]?.[0].query).toContain(
      "agent_run_id = {infoRun: String}",
    );
    expect(query.mock.calls[0]?.[0].query).toContain("FROM events_full e");
  });

  it("rejects invalid scopes, oversized identities and unbounded pages before querying", async () => {
    await expect(listAgents({ ...list, pageSize: 101 })).rejects.toThrow();
    await expect(listAgents({ ...list, from: scope.to })).rejects.toThrow();
    await expect(
      listAgents({ ...list, from: new Date("2026-09-01") }),
    ).rejects.toThrow();
    await expect(
      getAgentDetail({
        ...scope,
        identity: { kind: "id", value: "😀".repeat(257) },
      }),
    ).rejects.toThrow();
    await expect(
      getAgentDetail({ ...scope, identity: { kind: "name", value: " " } }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("fails clearly rather than silently dropping an environment facet", async () => {
    query.mockResolvedValueOnce(
      Array.from({ length: 101 }, (_, i) => ({ environment: `env-${i}` })),
    );
    await expect(getAgentEnvironments(scope)).rejects.toThrow(
      "Too many agent environments",
    );
  });
});
