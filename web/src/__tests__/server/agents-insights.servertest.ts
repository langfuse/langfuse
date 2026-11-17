import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import {
  createEvent,
  createEventsCh,
  createTraceScore,
  createScoresCh,
} from "@langfuse/shared/src/server";
import {
  getAgentQualityOptions,
  getAgentQuality,
  getAgentRelationships,
} from "@langfuse/shared/agents/server";

const available = vi.hoisted(
  () => process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
);

describe.skipIf(!available)("agent quality and observed delegation", () => {
  it("compares run-weighted direct scores after score revisions and separates model cohorts", async () => {
    const projectId = randomUUID();
    const from = new Date("2026-11-06T12:00:00Z");
    const to = new Date("2026-11-06T13:00:00Z");
    const common = {
      project_id: projectId,
      trace_id: "quality",
      agent_id: "researcher",
      agent_name: "Researcher",
      environment: "production",
      event_ts: Date.now(),
    };
    const run = (span: string, time: number) =>
      createEvent({
        ...common,
        span_id: span,
        agent_run_id: span,
        type: "AGENT",
        start_time: time,
        end_time: time + 10_000,
      });
    const model = (span: string, owner: string, time: number, name: string) =>
      createEvent({
        ...common,
        span_id: span,
        agent_run_id: owner,
        parent_span_id: owner,
        type: "GENERATION",
        start_time: time + 100,
        end_time: time + 200,
        provided_model_name: name,
      });
    await createEventsCh([
      run("before", from.getTime() - 3_000_000),
      model(
        "before-model",
        "before",
        from.getTime() - 3_000_000,
        "small-model",
      ),
      run("first", from.getTime() + 60_000),
      model("first-model", "first", from.getTime() + 60_000, "small-model"),
      run("second", from.getTime() + 1_860_000),
      model(
        "second-model",
        "second",
        from.getTime() + 1_860_000,
        "large-model",
      ),
      run("unscored", from.getTime() + 3_000_000),
      run("partial-model", from.getTime() + 3_100_000),
      model(
        "known-part",
        "partial-model",
        from.getTime() + 3_100_000,
        "small-model",
      ),
      model("unknown-part", "partial-model", from.getTime() + 3_100_000, ""),
      createEvent({
        ...common,
        span_id: "tool",
        agent_run_id: "first",
        type: "TOOL",
        start_time: from.getTime() + 61_000,
      }),
    ]);
    const score = (
      id: string,
      observationId: string | null,
      value: number,
      extra = {},
    ) =>
      createTraceScore({
        project_id: projectId,
        trace_id: "quality",
        observation_id: observationId,
        name: "answer-quality",
        config_id: null,
        id,
        value,
        source: "API",
        data_type: "NUMERIC",
        timestamp: to.getTime() + 60_000,
        event_ts: common.event_ts,
        ...extra,
      });
    await createScoresCh([
      score("s-before", "before", 0.8),
      score("s-first", "first", 0.2),
      score("s-first-repeat", "first", 0.4),
      score("s-second", "second", 0.9),
      score("s-partial-model", "partial-model", 0.6),
      score("trace-score", null, 100),
      score("tool-score", "tool", 100),
      score("foreign-project", "first", 100, { project_id: randomUUID() }),
      score("deleted", "first", 100),
      score("deleted", "first", 100, {
        event_ts: common.event_ts + 1,
        is_deleted: 1,
      }),
      score("moved", "first", 100),
      score("moved", "other-owner", 100, { event_ts: common.event_ts + 1 }),
      score("different-source", "first", 7, { source: "EVAL" }),
      score("different-config", "first", 8, { config_id: "another-evaluator" }),
    ]);
    const input = {
      projectId,
      from,
      to,
      environment: "production",
      identity: { kind: "id" as const, value: "researcher" },
    };
    const selection = {
      name: "answer-quality",
      dataType: "NUMERIC" as const,
      source: "API" as const,
      configId: null,
    };
    const options = await getAgentQualityOptions(input);
    expect(options.items).toContainEqual({ ...selection, scoredRuns: 4 });
    expect(options.items).toHaveLength(3);
    const result = await getAgentQuality({
      ...input,
      score: selection,
      bucketCount: 2,
    });
    expect(result.current.totalRuns).toBe(4);
    expect(result.current.scoredRuns).toBe(3);
    expect(result.current.average).toBeCloseTo(0.6);
    expect(result.previous).toEqual({
      totalRuns: 1,
      scoredRuns: 1,
      average: 0.8,
    });
    expect(result.buckets.map((bucket) => bucket.scoredRuns)).toEqual([1, 2]);
    expect(
      result.models.find((model) => model.name === "small-model")?.current
        .average,
    ).toBeCloseTo(0.3);
    expect(
      result.models.find((model) => model.name === "small-model")?.previous
        .average,
    ).toBe(0.8);
    expect(
      result.models.find((model) => model.kind === "unknown")?.current,
    ).toEqual({ average: 0.6, scoredRuns: 1, totalRuns: 2 });
    expect(result.models.some((model) => model.kind === "multiple")).toBe(
      false,
    );
    const empty = await getAgentQuality({
      ...input,
      score: { ...selection, name: "not-recorded" },
      bucketCount: 2,
    });
    expect(empty.current).toEqual({
      totalRuns: 4,
      scoredRuns: 0,
      average: null,
    });
  });

  it("keeps valid long score names selectable without hiding other quality metrics", async () => {
    const projectId = randomUUID();
    const from = new Date("2026-11-06T12:00:00Z");
    const to = new Date("2026-11-06T13:00:00Z");
    await createEventsCh([
      createEvent({
        project_id: projectId,
        trace_id: "long-score",
        span_id: "run",
        type: "AGENT",
        agent_id: "selected",
        agent_run_id: "run",
        environment: "production",
        start_time: from.getTime() + 1_000,
      }),
    ]);
    const longName = "quality-".repeat(40);
    await createScoresCh(
      ["answer-quality", longName].map((name) =>
        createTraceScore({
          project_id: projectId,
          trace_id: "long-score",
          observation_id: "run",
          name,
          value: 0.7,
          config_id: null,
          source: "API",
          data_type: "NUMERIC",
          timestamp: from.getTime() + 2_000,
        }),
      ),
    );
    const input = {
      projectId,
      from,
      to,
      environment: "production",
      identity: { kind: "id" as const, value: "selected" },
    };
    const options = await getAgentQualityOptions(input);
    expect(options.items.map((score) => score.name).sort()).toEqual(
      ["answer-quality", longName].sort(),
    );
    const result = await getAgentQuality({
      ...input,
      score: options.items.find((score) => score.name === longName)!,
    });
    expect(result.current).toEqual({
      average: 0.7,
      scoredRuns: 1,
      totalRuns: 1,
    });
  });

  it("proves nearest agent ancestry through ordinary spans without turning siblings or invalid chains into edges", async () => {
    const projectId = randomUUID();
    const from = new Date("2026-11-06T12:00:00Z");
    const to = new Date("2026-11-06T13:00:00Z");
    const common = {
      project_id: projectId,
      trace_id: "tree",
      environment: "production",
      start_time: from.getTime() + 1_000,
      end_time: from.getTime() + 10_000,
      event_ts: Date.now(),
    };
    const run = (span: string, agent: string, parent = "") =>
      createEvent({
        ...common,
        span_id: span,
        agent_run_id: span,
        agent_id: agent,
        agent_name: agent,
        parent_span_id: parent,
        type: "AGENT",
      });
    await createEventsCh([
      run("root", "orchestrator"),
      createEvent({
        ...common,
        span_id: "delegate-tool",
        parent_span_id: "root",
        type: "TOOL",
      }),
      run("research", "researcher", "delegate-tool"),
      run("sibling", "writer", "root"),
      run("review", "reviewer", "research"),
      run("missing", "researcher", "not-recorded"),
      run("cycle-a", "researcher", "cycle-b"),
      run("cycle-b", "reviewer", "cycle-a"),
      createEvent({
        ...common,
        span_id: "priced",
        parent_span_id: "research",
        agent_run_id: "research",
        agent_id: "researcher",
        agent_name: "researcher",
        type: "GENERATION",
        cost_details: { total: 0.04 },
      }),
      createEvent({
        ...common,
        span_id: "unpriced",
        parent_span_id: "research",
        agent_run_id: "research",
        agent_id: "researcher",
        agent_name: "researcher",
        type: "GENERATION",
        cost_details: {},
      }),
      createEvent({
        ...common,
        span_id: "wrong-owner",
        agent_run_id: "research",
        agent_id: "writer",
        type: "GENERATION",
        cost_details: { total: 100 },
      }),
    ]);
    const result = await getAgentRelationships({
      projectId,
      from,
      to,
      environment: "production",
      identity: { kind: "id", value: "researcher" },
    });
    expect(
      result.items
        .map((edge) => [edge.parent.identity.value, edge.child.identity.value])
        .sort(),
    ).toEqual([
      ["orchestrator", "researcher"],
      ["researcher", "reviewer"],
    ]);
    const incoming = result.items.find(
      (edge) => edge.child.identity.value === "researcher",
    )!;
    expect(incoming).toMatchObject({
      runs: 1,
      traces: 1,
      childOwnModelCost: 0.04,
      modelCalls: 2,
      pricedModelCalls: 1,
    });
    expect(result.coverage).toMatchObject({
      traces: 1,
      truncated: false,
      unresolvedRuns: 3,
    });
  });
});
