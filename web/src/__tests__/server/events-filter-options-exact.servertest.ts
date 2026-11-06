/**
 * Execution coverage for getEventsExactFilterOptionsForColumns.
 *
 * The golden SQL test (packages/shared/.../event-filter-options.golden.test.ts)
 * pins the generated string; this test runs the query against real ClickHouse to
 * prove the array machinery (sumMap -> arrayZip -> arraySort -> arraySlice, plus
 * the boolean countIf branch and labeledScalar nested key) actually executes and
 * returns exact values/counts for one column of every kind.
 */
import { vi } from "vitest";

// The events tables are created only by the ClickHouse dev-tables setup, which
// runs where the v4 preview opt-in is enabled. -azure / -redis-cluster CI legs
// skip it, so gate on the ORIGINAL opt-in flag captured before any override.
const eventsTableAvailable = vi.hoisted(
  () => process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
);

import {
  createEvent,
  createEventsCh,
  getEventsExactFilterOptionsForColumns,
  getObservationsCountsFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  buildEventsBlobExportStreamQuery,
  queryClickhouse,
  createTraceScore,
  createScoresCh,
  type EventFilterOptionRow,
} from "@langfuse/shared/src/server";
import {
  buildAgentSessionMembershipQuery,
  buildAgentTraceMembershipQuery,
  getAgentDetail,
  getAgentInfo,
  getAgentRuns,
  getAgentSkills,
  listAgents,
  getAgentActivity,
  getAgentListActivity,
  getAgentSkillsActivity,
  getAgentEventsActivity,
  getAgentOverview,
  buildAgentCacheEventsQuery,
} from "@langfuse/shared/agents/server";
import { randomUUID } from "crypto";
import waitForExpect from "wait-for-expect";
import {
  getEventFilterOptions,
  getEventFilterValuePage,
} from "@/src/features/events/server/eventsService";
import { getAgentSessionFilterOptions } from "@/src/features/agents/server/agentSessionFilterOptions";

const maybe = eventsTableAvailable ? describe : describe.skip;

// Keeps the file from hanging (on redis connections opened by the shared server
// imports) when the events-table suite below is skipped.
describe("events exact filter options liveness", () => {
  it("does not hang when the events table is unavailable", () => {});
});

maybe("getEventsExactFilterOptionsForColumns (execution)", () => {
  it("validates cache token partitions without alias double counting or guessing ambiguous input totals", async () => {
    const cases: {
      name: string;
      usage: Record<string, number>;
      expected: number[];
    }[] = [
      {
        name: "normalized",
        usage: { input: 80, input_cached_tokens: 20, output: 10, total: 110 },
        expected: [1, 20, 100],
      },
      {
        name: "inclusive",
        usage: { input: 100, input_cached_tokens: 20, output: 10, total: 110 },
        expected: [1, 20, 100],
      },
      {
        name: "duplicate-alias",
        usage: {
          input: 80,
          input_cached_tokens: 20,
          input_cache_read: 20,
          output: 10,
          total: 110,
        },
        expected: [1, 20, 100],
      },
      {
        name: "anthropic-ttl",
        usage: {
          input_tokens: 3,
          cache_read_input_tokens: 6,
          input_cache_creation_5m: 2,
          input_cache_creation_1h: 9,
          output_tokens: 2,
          total: 22,
        },
        expected: [1, 6, 20],
      },
      {
        name: "output-partition",
        usage: {
          input: 80,
          input_cached_tokens: 20,
          output: 8,
          output_reasoning_tokens: 2,
          total: 110,
        },
        expected: [1, 20, 100],
      },
      {
        name: "known-zero",
        usage: { input: 100, input_cache_read: 0, output: 10, total: 110 },
        expected: [1, 0, 100],
      },
      {
        name: "zero-input",
        usage: { input: 0, input_cached_tokens: 0, output: 10, total: 10 },
        expected: [1, 0, 0],
      },
      {
        name: "missing",
        usage: { input: 100, output: 10, total: 110 },
        expected: [0, 0, 0],
      },
      {
        name: "conflicting-alias",
        usage: {
          input: 80,
          input_cached_tokens: 20,
          input_cache_read: 30,
          output: 10,
          total: 110,
        },
        expected: [0, 0, 0],
      },
      {
        name: "negative",
        usage: { input: 101, input_cached_tokens: -1, output: 10, total: 110 },
        expected: [0, 0, 0],
      },
      {
        name: "fractional",
        usage: {
          input: 79.5,
          input_cached_tokens: 20.5,
          output: 10,
          total: 110,
        },
        expected: [0, 0, 0],
      },
      {
        name: "inconsistent",
        usage: { input: 10, input_cached_tokens: 100, output: 10, total: 20 },
        expected: [0, 0, 0],
      },
      {
        name: "ambiguous",
        usage: {
          input: 100,
          input_cached_tokens: 20,
          output: 50,
          output_reasoning_tokens: 20,
          total: 170,
        },
        expected: [0, 0, 0],
      },
    ];
    const expressions = cases.map(
      (item) =>
        `tuple('${item.name}', map(${Object.entries(item.usage)
          .map(([key, value]) => `'${key}', toFloat64(${value})`)
          .join(", ")}))`,
    );
    const normalized = buildAgentCacheEventsQuery({
      query: `SELECT item.1 AS case_name, item.2 AS usage_details FROM (SELECT arrayJoin([${expressions.join(", ")}]) AS item)`,
      params: {},
    });
    const rows = await queryClickhouse<{
      case_name: string;
      _agent_cache_known: number;
      _agent_cache_read: number;
      _agent_cache_input: number;
    }>({
      ...normalized,
      query: `SELECT case_name, _agent_cache_known, _agent_cache_read, _agent_cache_input FROM (${normalized.query})`,
    });
    for (const item of cases) {
      const row = rows.find((value) => value.case_name === item.name)!;
      expect(
        [
          Number(row._agent_cache_known),
          Number(row._agent_cache_read),
          Number(row._agent_cache_input),
        ],
        item.name,
      ).toEqual(item.expected);
    }
  });

  it("compares complete run cohorts without dividing period spend by run starts and retains dormant agents", async () => {
    const projectId = randomUUID();
    const from = new Date("2026-11-06T11:00:00Z");
    const to = new Date("2026-11-06T12:00:00Z");
    const common = {
      project_id: projectId,
      trace_id: "cohort",
      agent_id: "research",
      agent_name: "Research",
      environment: "production",
      event_ts: Date.now(),
    };
    const at = (minutes: number) => from.getTime() + minutes * 60_000;
    const run = (id: string, start: number, end: number | null, extra = {}) =>
      createEvent({
        ...common,
        span_id: id,
        type: "AGENT",
        agent_run_id: id,
        start_time: start,
        end_time: end,
        cost_details: { total: 999 },
        usage_details: {
          input: 0,
          input_cached_tokens: 10_000,
          output: 0,
          total: 10_000,
        },
        ...extra,
      });
    const model = (
      id: string,
      owner: string,
      start: number,
      cost: number,
      extra = {},
    ) =>
      createEvent({
        ...common,
        span_id: id,
        type: "GENERATION",
        agent_run_id: owner,
        start_time: start,
        end_time: start + 10,
        cost_details: { total: cost },
        ...extra,
      });
    await createEventsCh([
      run("current", at(10), at(10) + 1000, { level: "ERROR" }),
      model("current-model", "current", at(10) + 100, 2, {
        usage_details: {
          input: 80,
          input_cached_tokens: 20,
          output: 10,
          total: 110,
        },
      }),
      run("open", at(20), null),
      model("open-model", "open", at(20) + 100, 3, {
        usage_details: {
          input: 900,
          input_cache_read: 0,
          output: 10,
          total: 910,
        },
      }),
      run("current", at(25), at(25) + 1000, { trace_id: "second-trace" }),
      model("multi-first", "current", at(25) + 100, 2, {
        trace_id: "second-trace",
        usage_details: {
          input_tokens: 40,
          cache_read_input_tokens: 60,
          input_cache_creation_5m: 10,
          output_tokens: 10,
          total: 120,
        },
      }),
      model("multi-second", "current", at(25) + 200, 4, {
        trace_id: "second-trace",
        usage_details: {
          input: 20,
          input_cached_tokens: 80,
          input_cache_read: 80,
          output: 10,
          total: 110,
        },
      }),
      run("crossing", at(0) - 1000, at(0) + 30_000),
      model("crossing-model", "crossing", at(0) + 5000, 7, {
        usage_details: {
          input: 10,
          input_cached_tokens: 100,
          output: 10,
          total: 20,
        },
      }),
      run("previous", at(-50), at(-50) + 2000),
      model("previous-model", "previous", at(-50) + 100, 1, {
        usage_details: {
          input: 100,
          input_cached_tokens: 0,
          output: 10,
          total: 110,
        },
      }),
      createEvent({
        ...common,
        span_id: "current-tool",
        type: "TOOL",
        agent_run_id: "current",
        name: "search_docs",
        start_time: at(10) + 500,
        skills_resource_loaded: [
          { skillName: "citations", filePath: "SKILL.md" },
          { skillName: "citations", filePath: "SKILL.md" },
        ],
      }),
      createEvent({
        ...common,
        span_id: "previous-tool",
        type: "TOOL",
        agent_run_id: "previous",
        name: "search_docs",
        start_time: at(-50) + 500,
      }),
      createEvent({
        ...common,
        span_id: "old-tool",
        type: "TOOL",
        agent_run_id: "previous",
        name: "old_tool",
        start_time: at(-50) + 600,
      }),
      run("dormant", at(-55), at(-55) + 1000, {
        trace_id: "dormant",
        agent_id: "dormant",
        agent_name: "Dormant",
      }),
      model("dormant-model", "dormant", at(-55) + 100, 4, {
        trace_id: "dormant",
        agent_id: "dormant",
        agent_name: "Dormant",
      }),
    ]);
    const scope = { projectId, from, to, environment: "production" };
    const result = await getAgentOverview({
      ...scope,
      identity: { kind: "id", value: "research" },
      bucketCount: 2,
    });
    expect(result.current.stats).toMatchObject({
      runs: 3,
      completedRuns: 2,
      unfinishedRuns: 1,
      cost: 18,
      averageRunCost: 4,
      runCostKnownRuns: 2,
      averageRunDurationMs: 1000,
      toolCalls: 1,
      skillLoads: 1,
      errorRuns: 1,
    });
    expect(result.previous.stats).toMatchObject({
      runs: 2,
      completedRuns: 1,
      unfinishedRuns: 1,
      cost: 1,
      averageRunCost: 1,
      averageRunDurationMs: 2000,
      toolCalls: 2,
      cacheHitRate: 0,
      knownCacheModelCalls: 1,
      cacheReadInputTokens: 0,
      cacheEligibleInputTokens: 100,
    });
    expect(result.current.stats).toMatchObject({
      knownCacheModelCalls: 4,
      cacheReadInputTokens: 160,
      cacheEligibleInputTokens: 1210,
    });
    expect(result.current.stats.cacheHitRate).toBeCloseTo(160 / 1210);
    expect(result.current.buckets[1]?.cacheHitRate).toBeNull();
    expect(result.current.buckets.map((bucket) => bucket.runs)).toEqual([3, 0]);
    expect(result.current.buckets.map((bucket) => bucket.modelCost)).toEqual([
      18, 0,
    ]);
    expect(result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "search_docs",
          currentCount: 1,
          previousCount: 1,
        }),
        expect.objectContaining({
          name: "old_tool",
          currentCount: 0,
          previousCount: 1,
        }),
      ]),
    );
    expect(
      result.tools
        .find((tool) => tool.name === "search_docs")
        ?.buckets?.map((bucket) => bucket.count),
    ).toEqual([1, 0]);
    expect(result.toolsTotalCount).toBe(2);
    expect(result.skills).toMatchObject([
      { name: "citations", currentCount: 1, previousCount: 0 },
    ]);
    const gallery = await listAgents({
      ...scope,
      page: 0,
      pageSize: 20,
      sort: "name",
      direction: "asc",
    });
    expect(gallery.totalCount).toBe(2);
    const dormant = gallery.items.find((agent) => agent.id === "dormant")!;
    expect(dormant.stats).toMatchObject({
      runs: 0,
      modelCalls: 0,
      cost: 0,
      averageRunCost: null,
    });
    expect(dormant.comparison?.stats).toMatchObject({
      runs: 1,
      cost: 4,
      averageRunCost: 4,
    });
    expect(dormant.lastSeen.getTime()).toBeLessThan(from.getTime());
    const dormantDetail = await getAgentDetail({
      ...scope,
      identity: dormant.identity,
    });
    expect(dormantDetail?.stats.runs).toBe(0);
    expect(dormantDetail?.comparison?.stats.runs).toBe(1);
  });

  it("batches visible agents into dense half-open activity buckets after current identity and environment revisions", async () => {
    const projectId = randomUUID();
    const from = new Date("2026-11-06T11:00:00Z");
    const to = new Date("2026-11-06T11:04:00Z");
    const common = {
      project_id: projectId,
      trace_id: "activity",
      start_time: from.getTime(),
      end_time: from.getTime() + 100,
      event_ts: Date.now(),
      agent_id: "selected",
      agent_name: "Selected",
      environment: "production",
    };
    await createEventsCh([
      createEvent({
        ...common,
        span_id: "run",
        type: "AGENT",
        agent_run_id: "run",
      }),
      createEvent({
        ...common,
        span_id: "tool",
        type: "TOOL",
        start_time: from.getTime() + 30_000,
        skills_resource_loaded: [
          { skillName: "citations", filePath: "SKILL.md" },
          { skillName: "citations", filePath: "SKILL.md" },
          { skillName: "citations", filePath: "references.md" },
        ],
      }),
      createEvent({
        ...common,
        span_id: "model",
        type: "GENERATION",
        start_time: from.getTime() + 60_000,
      }),
      createEvent({ ...common, span_id: "environment-revision" }),
      createEvent({
        ...common,
        span_id: "environment-revision",
        environment: "staging",
        event_ts: common.event_ts + 1,
      }),
      createEvent({ ...common, span_id: "identity-revision" }),
      createEvent({
        ...common,
        span_id: "identity-revision",
        agent_id: "other",
        event_ts: common.event_ts + 1,
      }),
      createEvent({ ...common, span_id: "deleted" }),
      createEvent({
        ...common,
        span_id: "deleted",
        is_deleted: 1,
        event_ts: common.event_ts + 1,
      }),
      createEvent({
        ...common,
        span_id: "name-fallback",
        agent_id: "",
        agent_name: "Résumé",
        start_time: from.getTime() + 210_000,
      }),
      createEvent({
        ...common,
        span_id: "explicit-id-wins",
        agent_id: "other",
        agent_name: "Résumé",
      }),
      createEvent({
        ...common,
        span_id: "end-exclusive",
        start_time: to.getTime(),
      }),
      createEvent({
        ...common,
        span_id: "before-start",
        start_time: from.getTime() - 1,
      }),
      createEvent({
        ...common,
        span_id: "foreign-project",
        project_id: randomUUID(),
      }),
    ]);
    const identities = [
      { kind: "id" as const, value: "selected" },
      { kind: "name" as const, value: "Résumé" },
      { kind: "id" as const, value: "absent" },
    ];
    const input = {
      projectId,
      from,
      to,
      identities,
      bucketCount: 4,
      environment: null,
      environmentFilter: [
        {
          column: "environment" as const,
          type: "stringOptions" as const,
          operator: "any of" as const,
          value: ["production"],
        },
      ],
    };
    const result = await getAgentActivity(input);
    expect(result.bucketMs).toBe(60_000);
    expect(result.series.map((series) => series.identity)).toEqual(identities);
    expect(
      result.series.map((series) =>
        series.buckets.map((bucket) => bucket.count),
      ),
    ).toEqual([
      [2, 1, 0, 0],
      [0, 0, 0, 1],
      [0, 0, 0, 0],
    ]);
    expect(
      result.series[0]?.buckets.map((bucket) => bucket.timestamp.getTime()),
    ).toEqual([0, 1, 2, 3].map((i) => from.getTime() + i * 60_000));
    expect(
      (
        await getAgentListActivity({
          ...input,
          filter: [
            { column: "id", type: "string", operator: "=", value: "selected" },
            { column: "runs", type: "number", operator: ">=", value: 1 },
          ],
        })
      ).buckets.map((bucket) => bucket.count),
    ).toEqual([2, 1, 0, 0]);
    expect(
      (
        await getAgentSkillsActivity({ ...input, identity: identities[0]! })
      ).buckets.map((bucket) => bucket.count),
    ).toEqual([2, 0, 0, 0]);
  });

  it("uses native include/exclude environment filters consistently after revisions and filters agent aggregates before paging", async () => {
    const projectId = randomUUID();
    const from = new Date("2026-11-06T11:00:00Z");
    const to = new Date("2026-11-06T15:00:00Z");
    const common = {
      project_id: projectId,
      start_time: from.getTime() + 1000,
      end_time: from.getTime() + 2000,
      event_ts: Date.now(),
      agent_id: "research",
      agent_name: "Research",
      agent_run_id: "run",
      environment: "production",
      trace_id: "production",
      type: "AGENT" as const,
      span_id: "run",
      name: "agent-step",
    };
    await createEventsCh([
      createEvent(common),
      createEvent({
        ...common,
        type: "GENERATION",
        span_id: "model",
        cost_details: { total: 2 },
      }),
      createEvent({
        ...common,
        type: "TOOL",
        span_id: "skill",
        skills_resource_loaded: [
          { skillName: "citations", filePath: "SKILL.md" },
        ],
      }),
      createEvent({
        ...common,
        type: "SPAN",
        span_id: "root",
        agent_id: "",
        agent_name: "",
        agent_run_id: "",
        session_id: "shared-session",
      }),
      createEvent({
        ...common,
        type: "GENERATION",
        span_id: "unknown-model",
        agent_id: "",
        agent_name: "",
        agent_run_id: "",
        cost_details: { total: 99 },
      }),
      createEvent({
        ...common,
        trace_id: "staging",
        environment: "staging",
        name: "staging-only",
        session_id: "staging-session",
      }),
      createEvent({
        ...common,
        trace_id: "staging",
        environment: "staging",
        type: "GENERATION",
        span_id: "model",
        cost_details: { total: 3 },
      }),
      createEvent({ ...common, trace_id: "rewritten" }),
      createEvent({
        ...common,
        trace_id: "rewritten",
        environment: "staging",
        event_ts: common.event_ts + 1,
      }),
      createEvent({
        ...common,
        trace_id: "preview",
        environment: "preview",
        name: "preview-only",
        session_id: "preview-session",
      }),
      createEvent({
        ...common,
        trace_id: "other",
        agent_id: "other",
        agent_name: "Other",
      }),
      createEvent({
        ...common,
        trace_id: "other-environment",
        agent_id: "other",
        environment: "other-agent-only",
      }),
      createEvent({
        ...common,
        trace_id: "outside-window",
        start_time: to.getTime() + 1_000,
        environment: "outside-window-only",
      }),
      createEvent({
        ...common,
        project_id: randomUUID(),
        trace_id: "foreign-project",
        environment: "foreign-project-only",
      }),
    ]);
    const identity = { kind: "id" as const, value: "research" };
    const base = {
      projectId,
      from,
      to,
      environment: null,
      page: 0,
      pageSize: 1,
      sort: "runs" as const,
      direction: "desc" as const,
    };
    const environmentFilter = [
      {
        column: "environment" as const,
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["production", "staging"],
      },
    ];
    const selected = { ...base, identity, environmentFilter };
    const detail = await getAgentDetail(selected);
    expect(detail?.stats).toMatchObject({
      runs: 3,
      modelCalls: 2,
      cost: 5,
      traceUnassignedModelCalls: 1,
    });
    const excluded = {
      ...selected,
      environmentFilter: [
        ...environmentFilter,
        {
          column: "environment" as const,
          type: "stringOptions" as const,
          operator: "none of" as const,
          value: ["staging"],
        },
      ],
    };
    expect((await getAgentDetail(excluded))?.stats).toMatchObject({
      runs: 1,
      modelCalls: 1,
      cost: 2,
      traceUnassignedModelCalls: 1,
    });
    expect((await getAgentRuns(excluded)).totalCount).toBe(1);
    expect((await getAgentSkills(excluded)).items[0]?.name).toBe("citations");
    expect((await getAgentInfo(excluded))?.environment).toBe("production");
    const startTimeFilter = [
      {
        column: "startTime",
        type: "datetime" as const,
        operator: ">=" as const,
        value: from,
      },
      {
        column: "startTime",
        type: "datetime" as const,
        operator: "<" as const,
        value: to,
      },
    ];
    const options = await getEventFilterOptions({
      projectId,
      agentScope: excluded,
      startTimeFilter,
      filter: [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ],
      columns: ["environment", "name"],
      includeApproxCount: true,
    });
    expect(options.environment?.map((option) => option.value).sort()).toEqual([
      "preview",
      "production",
      "staging",
    ]);
    expect(options.name?.map((option) => option.value)).toEqual(["agent-step"]);
    expect(options.approxTotalCount).toBe(5);
    const environmentPage = await getEventFilterValuePage({
      projectId,
      agentScope: excluded,
      startTimeFilter,
      column: "environment",
      limit: 10,
      offset: 0,
    });
    expect(environmentPage.values.map((option) => option.value).sort()).toEqual(
      ["preview", "production", "staging"],
    );
    const sessionOptions = await getAgentSessionFilterOptions({
      projectId,
      agentScope: excluded,
      eventsFilter: startTimeFilter,
      scoreFilter: [],
    });
    expect(
      sessionOptions.environment?.map((option) => option.value).sort(),
    ).toEqual(["preview", "production", "staging"]);
    expect(
      await getAgentDetail({
        ...excluded,
        environment: "staging",
      }),
    ).toBeNull();
    for (const [build, expected] of [
      [buildAgentTraceMembershipQuery, [{ trace_id: "production" }]],
      [buildAgentSessionMembershipQuery, [{ session_id: "shared-session" }]],
    ] as const) {
      const query = build(excluded);
      expect(await queryClickhouse(query)).toEqual(expected);
    }
    const result = await listAgents({
      ...base,
      environmentFilter,
      filter: [
        {
          column: "displayName",
          type: "string" as const,
          operator: "starts with" as const,
          value: "Res",
        },
        {
          column: "id",
          type: "stringOptions" as const,
          operator: "any of" as const,
          value: ["research"],
        },
        {
          column: "runs",
          type: "number" as const,
          operator: ">=" as const,
          value: 3,
        },
        {
          column: "cost",
          type: "number" as const,
          operator: "<" as const,
          value: 6,
        },
      ],
    });
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.stats).toMatchObject({ runs: 3, cost: 5 });
    expect(
      (
        await listAgents({
          ...base,
          filter: [
            {
              column: "environment",
              type: "string" as const,
              operator: "starts with" as const,
              value: "stag",
            },
          ],
        })
      ).items[0]?.stats.runs,
    ).toBe(2);
  }, 30_000);

  const valuesFor = (rows: EventFilterOptionRow[], column: string) =>
    rows
      .filter((r) => r.column === column)
      .map((r) => ({
        value: r.value,
        count: r.count,
        displayValue: r.displayValue ?? "",
      }));

  it("keeps all native rows and facets in current agent traces while excluding stale or mismatched membership", async () => {
    const projectId = randomUUID();
    const from = new Date("2026-11-02T11:00:00Z");
    const to = new Date("2026-11-02T15:00:00Z");
    const common = {
      project_id: projectId,
      start_time: from.getTime() + 1000,
      end_time: from.getTime() + 2000,
      environment: "production",
      event_ts: Date.now(),
      agent_id: "",
      agent_name: "",
      agent_run_id: "",
      agent_identity_source: "",
    };
    const member = {
      ...common,
      agent_id: "selected",
      agent_name: "Selected",
      agent_run_id: "run",
      type: "AGENT" as const,
      name: "agent",
    };
    await createEventsCh([
      createEvent({
        ...common,
        trace_id: "included",
        span_id: "root",
        type: "SPAN",
        name: "root",
      }),
      createEvent({ ...member, trace_id: "included", span_id: "run" }),
      createEvent({
        ...common,
        trace_id: "included",
        span_id: "model",
        type: "GENERATION",
        name: "other-model",
        agent_id: "other",
        agent_name: "Other",
      }),
      createEvent({
        ...member,
        trace_id: "included",
        span_id: "selected-tool",
        type: "TOOL",
        name: "selected-tool",
      }),
      createEvent({
        ...common,
        trace_id: "included",
        span_id: "other-tool",
        type: "TOOL",
        name: "other-tool",
        agent_id: "other",
        agent_name: "Other",
      }),
      createEvent({
        ...common,
        trace_id: "wrong-env",
        span_id: "env-root",
        name: "unrelated",
      }),
      createEvent({
        ...member,
        trace_id: "wrong-env",
        span_id: "env-agent",
        environment: "staging",
      }),
      createEvent({
        ...common,
        trace_id: "deleted",
        span_id: "deleted-root",
        name: "unrelated",
      }),
      createEvent({ ...member, trace_id: "deleted", span_id: "deleted-agent" }),
      createEvent({
        ...member,
        trace_id: "deleted",
        span_id: "deleted-agent",
        is_deleted: 1,
        event_ts: common.event_ts + 1,
      }),
      createEvent({
        ...common,
        trace_id: "reclassified",
        span_id: "changed-root",
        name: "unrelated",
      }),
      createEvent({
        ...member,
        trace_id: "reclassified",
        span_id: "changed-agent",
      }),
      createEvent({
        ...member,
        trace_id: "reclassified",
        span_id: "changed-agent",
        agent_id: "other",
        event_ts: common.event_ts + 1,
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        project_id: projectId,
        trace_id: "included",
        observation_id: "selected-tool",
        name: "selected-score",
        data_type: "NUMERIC",
        value: 1,
        timestamp: from.getTime() + 1000,
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: "included",
        observation_id: "other-tool",
        name: "other-score",
        data_type: "NUMERIC",
        value: 1,
        timestamp: from.getTime() + 1000,
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: "included",
        observation_id: null,
        name: "trace-score",
        data_type: "NUMERIC",
        value: 1,
        timestamp: from.getTime() + 1000,
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: "wrong-env",
        observation_id: "env-agent",
        name: "unrelated-score",
        data_type: "NUMERIC",
        value: 1,
        timestamp: from.getTime() + 1000,
      }),
    ]);
    const agentScope = {
      identity: { kind: "id" as const, value: "selected" },
      from,
      to,
      environment: "production",
    };
    await waitForExpect(async () => {
      const counts = await getObservationsCountsFromEventsTable({
        projectId,
        filter: [],
        agentScope,
      });
      expect(counts).toEqual({ totalCount: 5, uniqueTraceCount: 1 });
      const rows = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [
          {
            type: "string",
            column: "type",
            operator: "=",
            value: "GENERATION",
          },
        ],
        agentScope,
        limit: 50,
      });
      expect(rows.map((row) => row.name)).toEqual(["other-model"]);
      const facets = await getEventsExactFilterOptionsForColumns({
        projectId,
        filter: [],
        agentScope,
        columns: ["name"],
      });
      expect(
        valuesFor(facets, "name")
          .map((row) => row.value)
          .sort(),
      ).toEqual([
        "agent",
        "other-model",
        "other-tool",
        "root",
        "selected-tool",
      ]);
      const tools = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [],
        agentScope: { ...agentScope, mode: "tools" },
        limit: 50,
      });
      expect(tools.map((row) => row.name)).toEqual(["selected-tool"]);
      const invocations = await getObservationsCountsFromEventsTable({
        projectId,
        filter: [],
        agentScope: { ...agentScope, mode: "invocations" },
      });
      expect(invocations).toEqual({ totalCount: 1, uniqueTraceCount: 1 });
      const exported = buildEventsBlobExportStreamQuery({
        projectId,
        filter: [],
        agentScope: { ...agentScope, mode: "tools" },
        rowLimit: 50,
      }).queryBuilder.buildWithParams();
      const exportRows = await queryClickhouse<{ name: string }>(exported);
      expect(exportRows.map((row) => row.name)).toEqual(["selected-tool"]);
      const scoreOptions = await getEventFilterOptions({
        projectId,
        agentScope: { ...agentScope, mode: "tools" },
        columns: ["scores_avg"],
        startTimeFilter: [
          {
            type: "datetime",
            column: "startTime",
            operator: ">=",
            value: from,
          },
          { type: "datetime", column: "startTime", operator: "<=", value: to },
        ],
      });
      expect(scoreOptions.scores_avg?.sort()).toEqual([
        "selected-score",
        "trace-score",
      ]);
      const scored = await getObservationsWithModelDataFromEventsTable({
        projectId,
        agentScope: { ...agentScope, mode: "tools" },
        filter: [
          {
            type: "numberObject",
            column: "scores_avg",
            key: "selected-score",
            operator: ">=",
            value: 1,
          },
        ],
        limit: 50,
      });
      expect(scored.map((row) => row.name)).toEqual(["selected-tool"]);
      for (const mode of ["traces", "tools", "invocations"] as const) {
        const activity = await getAgentEventsActivity({
          projectId,
          agentScope: { ...agentScope, mode },
          filter: [],
          bucketCount: 4,
        });
        expect(activity.buckets.map((bucket) => bucket.count)).toEqual([
          mode === "traces" ? 5 : 1,
          0,
          0,
          0,
        ]);
      }
      const filteredActivity = await getAgentEventsActivity({
        projectId,
        agentScope: { ...agentScope, mode: "tools" },
        filter: [
          {
            type: "numberObject",
            column: "scores_avg",
            key: "selected-score",
            operator: ">=",
            value: 1,
          },
        ],
        searchQuery: "selected-tool",
        searchType: ["id"],
        bucketCount: 4,
      });
      expect(filteredActivity.buckets.map((bucket) => bucket.count)).toEqual([
        1, 0, 0, 0,
      ]);
      const emptyActivity = await getAgentEventsActivity({
        projectId,
        agentScope,
        filter: [],
        searchQuery: "no-matching-observation",
        searchType: ["id"],
        bucketCount: 4,
      });
      expect(emptyActivity.buckets.map((bucket) => bucket.count)).toEqual([
        0, 0, 0, 0,
      ]);
    }, 5000);
  });

  it("returns exact facet values and counts for every column kind", async () => {
    const projectId = randomUUID();

    await createEventsCh([
      // Root observation (is_app_root); contributes user u1, exp1, tags alpha+beta.
      createEvent({
        project_id: projectId,
        user_id: "u1",
        tags: ["alpha", "beta"],
        experiment_id: "exp1",
        experiment_name: "Exp One",
        is_app_root: true,
      }),
      // Non-root; shares user u1, exp1 and tag beta so their counts sum across rows.
      createEvent({
        project_id: projectId,
        user_id: "u1",
        tags: ["beta"],
        experiment_id: "exp1",
        experiment_name: "Exp One",
        parent_span_id: "span-b",
      }),
      // Non-root; distinct user u2, exp2 and tag gamma (each count 1).
      createEvent({
        project_id: projectId,
        user_id: "u2",
        tags: ["gamma"],
        experiment_id: "exp2",
        experiment_name: "Exp Two",
        parent_span_id: "span-c",
      }),
      // Exercises the include filters: null user_id and null experiment_id are
      // excluded; the empty-string tag is dropped by arrayFilter(length > 0)
      // while "delta" survives.
      createEvent({
        project_id: projectId,
        user_id: null,
        tags: ["", "delta"],
        experiment_id: null,
        experiment_name: null,
        parent_span_id: "span-d",
      }),
    ]);

    // events_core is populated from events_full via the events_core_mv MV; poll
    // until it catches up rather than asserting immediately after the insert.
    await waitForExpect(async () => {
      const rows = await getEventsExactFilterOptionsForColumns({
        projectId,
        filter: [],
        columns: ["userId", "experimentId", "traceTags", "isRootObservation"],
      });

      // scalar: countDesc, null excluded.
      expect(valuesFor(rows, "userId")).toEqual([
        { value: "u1", count: 2, displayValue: "" },
        { value: "u2", count: 1, displayValue: "" },
      ]);

      // labeledScalar: value + label from the nested key, null excluded.
      expect(valuesFor(rows, "experimentId")).toEqual([
        { value: "exp1", count: 2, displayValue: "Exp One" },
        { value: "exp2", count: 1, displayValue: "Exp Two" },
      ]);

      // array: alpha sort, empty-string tag filtered out, beta summed across rows.
      expect(valuesFor(rows, "traceTags")).toEqual([
        { value: "alpha", count: 1, displayValue: "" },
        { value: "beta", count: 2, displayValue: "" },
        { value: "delta", count: 1, displayValue: "" },
        { value: "gamma", count: 1, displayValue: "" },
      ]);

      // boolean: booleanAsc (false before true).
      expect(valuesFor(rows, "isRootObservation")).toEqual([
        { value: "false", count: 3, displayValue: "" },
        { value: "true", count: 1, displayValue: "" },
      ]);
    });
  });
});
