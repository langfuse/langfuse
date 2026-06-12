import { describe, expect, it } from "vitest";

import {
  convertGreptimeTraceRowToDomain,
  convertGreptimeObservationRowToDomain,
  convertGreptimeScoreRowToDomain,
  greptimeTraceSelect,
  greptimeObservationSelect,
} from "./converters";

// mysql2 read-pool row contract: timestamps are JS Date (pool pinned to UTC), JSON columns arrive as
// json_to_string text, BOOLEAN as 0/1, BIGINT/DECIMAL as strings.

describe("convertGreptimeTraceRowToDomain", () => {
  it("maps the row contract to the trace domain", () => {
    const ts = new Date("2026-06-01T10:00:00.000Z");
    const trace = convertGreptimeTraceRowToDomain({
      id: "t1",
      project_id: "p1",
      name: "my-trace",
      timestamp: ts,
      environment: "default",
      tags: '["a","b"]',
      bookmarked: 1,
      public: 0,
      release: null,
      version: "v1",
      user_id: "u1",
      session_id: null,
      input: '{"x":1}',
      output: "plain text",
      // metadata stored as Record<string, JSON-encoded-string> (the write contract)
      metadata: JSON.stringify({ env: '"prod"', count: "5" }),
      created_at: ts,
      updated_at: ts,
    });

    expect(trace).toMatchObject({
      id: "t1",
      projectId: "p1",
      name: "my-trace",
      timestamp: ts,
      environment: "default",
      tags: ["a", "b"],
      bookmarked: true,
      public: false,
      release: null,
      version: "v1",
      userId: "u1",
      sessionId: null,
    });
    expect(trace.input).toEqual({ x: 1 });
    expect(trace.output).toBe("plain text");
    // each metadata value is JSON-parsed by parseMetadataCHRecordToDomain
    expect(trace.metadata).toEqual({ env: "prod", count: 5 });
    expect(trace.createdAt).toEqual(ts);
  });

  it("throws on a missing required column", () => {
    expect(() =>
      convertGreptimeTraceRowToDomain({
        // id missing
        project_id: "p1",
        timestamp: new Date(),
        environment: "default",
        created_at: new Date(),
        updated_at: new Date(),
      }),
    ).toThrow(/required string column 'traces.id'/);
  });

  it("throws on a missing required timestamp", () => {
    expect(() =>
      convertGreptimeTraceRowToDomain({
        id: "t1",
        project_id: "p1",
        // timestamp missing
        environment: "default",
        created_at: new Date(),
        updated_at: new Date(),
      }),
    ).toThrow(/required timestamp column 'traces.timestamp'/);
  });
});

describe("convertGreptimeObservationRowToDomain", () => {
  it("computes latency and reduces usage/cost maps", () => {
    const start = new Date("2026-06-01T10:00:00.000Z");
    const end = new Date("2026-06-01T10:00:03.000Z");
    const obs = convertGreptimeObservationRowToDomain({
      id: "o1",
      project_id: "p1",
      start_time: start,
      end_time: end,
      completion_start_time: null,
      type: "GENERATION",
      trace_id: "t1",
      parent_observation_id: null,
      environment: "default",
      name: "gen",
      level: "DEFAULT",
      status_message: null,
      version: null,
      provided_model_name: "gpt-x",
      internal_model_id: "m1",
      model_parameters: JSON.stringify({ temperature: 0.7 }),
      input: null,
      output: null,
      metadata: "{}",
      usage_details: JSON.stringify({ input: 10, output: 20, total: 30 }),
      cost_details: JSON.stringify({ input: 0.1, output: 0.2, total: 0.3 }),
      provided_usage_details: "{}",
      provided_cost_details: "{}",
      usage_pricing_tier_id: null,
      usage_pricing_tier_name: null,
      prompt_id: null,
      prompt_name: null,
      prompt_version: 3,
      tool_definitions: null,
      tool_calls: null,
      tool_call_names: null,
      created_at: start,
      updated_at: end,
    });

    expect(obs.latency).toBe(3);
    expect(obs.timeToFirstToken).toBeNull();
    expect(obs.inputUsage).toBe(10);
    expect(obs.outputUsage).toBe(20);
    expect(obs.totalUsage).toBe(30);
    expect(obs.inputCost).toBeCloseTo(0.1);
    expect(obs.totalCost).toBeCloseTo(0.3);
    expect(obs.modelParameters).toEqual({ temperature: 0.7 });
    expect(obs.promptVersion).toBe(3);
    expect(obs.model).toBe("gpt-x");
  });
});

describe("convertGreptimeScoreRowToDomain", () => {
  const base = {
    id: "s1",
    project_id: "p1",
    timestamp: new Date("2026-06-01T10:00:00.000Z"),
    environment: "default",
    source: "API",
    name: "accuracy",
    value: 0.9,
    string_value: null,
    long_string_value: null,
    comment: null,
    trace_id: "t1",
    observation_id: null,
    session_id: null,
    dataset_run_id: null,
    execution_trace_id: null,
    author_user_id: null,
    config_id: null,
    queue_id: null,
    metadata: "{}",
    created_at: new Date("2026-06-01T10:00:00.000Z"),
    updated_at: new Date("2026-06-01T10:00:00.000Z"),
  };

  it("maps a numeric score with null stringValue", () => {
    const score = convertGreptimeScoreRowToDomain({
      ...base,
      data_type: "NUMERIC",
    });
    expect(score).toMatchObject({
      id: "s1",
      name: "accuracy",
      value: 0.9,
      source: "API",
      dataType: "NUMERIC",
      stringValue: null,
      traceId: "t1",
    });
  });

  it("maps a categorical score's stringValue", () => {
    const score = convertGreptimeScoreRowToDomain({
      ...base,
      data_type: "CATEGORICAL",
      value: 0,
      string_value: "good",
    });
    expect(score.dataType).toBe("CATEGORICAL");
    expect(score.stringValue).toBe("good");
  });

  it("throws on a missing required timestamp", () => {
    expect(() =>
      convertGreptimeScoreRowToDomain({
        ...base,
        data_type: "NUMERIC",
        timestamp: null,
      }),
    ).toThrow(/required timestamp column 'scores.timestamp'/);
  });
});

describe("select builders project JSON columns through json_to_string", () => {
  it("trace select wraps JSON columns and respects excludeMetadata", () => {
    const sel = greptimeTraceSelect();
    expect(sel).toContain("json_to_string(`tags`) AS `tags`");
    expect(sel).toContain("json_to_string(`metadata`) AS `metadata`");
    expect(sel).toContain("`input`");

    const noMeta = greptimeTraceSelect({
      excludeMetadata: true,
      excludeIo: true,
    });
    expect(noMeta).not.toContain("`metadata`");
    expect(noMeta).not.toContain("`input`");
    expect(noMeta).toContain("json_to_string(`tags`)");
  });

  it("observation select prefixes columns and wraps usage/cost JSON", () => {
    const sel = greptimeObservationSelect({ prefix: "o" });
    expect(sel).toContain("o.`start_time`");
    expect(sel).toContain(
      "json_to_string(o.`usage_details`) AS `usage_details`",
    );
    expect(sel).toContain("json_to_string(o.`cost_details`) AS `cost_details`");
  });
});
