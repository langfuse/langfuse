import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  diffResults,
  runEventsTableExperiment,
  shouldRunEventsTableExperiment,
} from "./eventsTableExperiment";

// Mock the module's dependencies so the runner can be exercised deterministically
// without a real ClickHouse/env/metrics backend. `mocks.env` is mutated per test
// to control the sample rate.
const mocks = vi.hoisted(() => ({
  env: { LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE: 0 },
  recordHistogram: vi.fn(),
  recordIncrement: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../../env", () => ({ env: mocks.env }));
vi.mock("../instrumentation", () => ({
  recordHistogram: mocks.recordHistogram,
  recordIncrement: mocks.recordIncrement,
}));
vi.mock("../logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(() => {
  mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 0;
  mocks.recordHistogram.mockClear();
  mocks.recordIncrement.mockClear();
  mocks.loggerInfo.mockClear();
  mocks.loggerWarn.mockClear();
});

describe("diffResults", () => {
  it("returns no diffs for identical objects", () => {
    const a = { id: "t1", name: "trace", tags: ["a", "b"] };
    const b = { id: "t1", name: "trace", tags: ["a", "b"] };
    expect(diffResults(a, b)).toEqual([]);
  });

  it("ignores ordering differences in primitive arrays (e.g. tags)", () => {
    const legacy = { tags: ["b", "a", "c"] };
    const events = { tags: ["a", "c", "b"] };
    expect(diffResults(legacy, events)).toEqual([]);
  });

  it("ignores ordering differences in id arrays (observations/scores)", () => {
    const legacy = { observations: ["o2", "o1"], scores: ["s1"] };
    const events = { observations: ["o1", "o2"], scores: ["s1"] };
    expect(diffResults(legacy, events)).toEqual([]);
  });

  it("treats JSON-string metadata and parsed-object metadata as equal", () => {
    const legacy = { metadata: { foo: "bar", n: 1 } };
    const events = { metadata: '{"n":1,"foo":"bar"}' };
    expect(diffResults(legacy, events)).toEqual([]);
  });

  it("reports a difference in nested JSON metadata values", () => {
    const legacy = { metadata: { nested: { a: 1, b: 2 } } };
    const events = { metadata: { nested: { a: 1, b: 3 } } };
    expect(diffResults(legacy, events)).toEqual([
      expect.objectContaining({
        path: "metadata.nested.b",
        field: "b",
        legacy: 2,
        events: 3,
      }),
    ]);
  });

  it("treats null and undefined as equal", () => {
    const legacy = { userId: null };
    const events = { userId: undefined };
    expect(diffResults(legacy, events)).toEqual([]);
  });

  it("treats empty arrays as equal", () => {
    expect(diffResults({ observations: [] }, { observations: [] })).toEqual([]);
  });

  it("treats Date and equal epoch millis as equal", () => {
    const ts = new Date("2024-01-01T00:00:00.000Z");
    const legacy = { timestamp: ts };
    const events = { timestamp: new Date(ts.getTime()) };
    expect(diffResults(legacy, events)).toEqual([]);
  });

  it("reports a Date difference", () => {
    const legacy = { timestamp: new Date("2024-01-01T00:00:00.000Z") };
    const events = { timestamp: new Date("2024-01-01T00:00:01.000Z") };
    expect(diffResults(legacy, events)).toHaveLength(1);
    expect(diffResults(legacy, events)[0]).toMatchObject({
      field: "timestamp",
    });
  });

  it("reports a type mismatch (number vs string)", () => {
    const diffs = diffResults({ value: 5 }, { value: "5" });
    expect(diffs).toEqual([
      expect.objectContaining({ field: "value", legacy: 5, events: "5" }),
    ]);
  });

  it("applies numeric tolerance only to configured fields", () => {
    const legacy = { latency: 1.0000001, count: 1 };
    const events = { latency: 1.0000002, count: 2 };
    const diffs = diffResults(legacy, events, {
      numericFields: new Set(["latency"]),
    });
    // latency within epsilon -> ignored; count differs -> reported
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ field: "count", legacy: 1, events: 2 });
  });

  it("respects a custom epsilon", () => {
    const within = diffResults(
      { x: 1.0 },
      { x: 1.4 },
      { numericFields: new Set(["x"]), epsilon: 0.5 },
    );
    expect(within).toEqual([]);
    const outside = diffResults(
      { x: 1.0 },
      { x: 1.6 },
      { numericFields: new Set(["x"]), epsilon: 0.5 },
    );
    expect(outside).toHaveLength(1);
  });

  it("compares Decimal-like values by number with epsilon tolerance", () => {
    const decimal = (n: number) => ({ toNumber: () => n });
    const legacy = { totalCost: decimal(0.08) };
    const events = { totalCost: decimal(0.08 + 1e-9) };
    expect(
      diffResults(legacy, events, { numericFields: new Set(["totalCost"]) }),
    ).toEqual([]);

    const mismatch = diffResults(
      { totalCost: decimal(0.08) },
      { totalCost: decimal(0.09) },
      { numericFields: new Set(["totalCost"]) },
    );
    expect(mismatch).toEqual([
      expect.objectContaining({
        field: "totalCost",
        legacy: 0.08,
        events: 0.09,
      }),
    ]);
  });

  it("reports an array length mismatch as a diff", () => {
    const legacy = { data: ["o1", "o2"] };
    const events = { data: ["o1"] };
    const diffs = diffResults(legacy, events);
    expect(diffs).toEqual([
      expect.objectContaining({
        field: "data",
        legacy: "length=2",
        events: "length=1",
      }),
    ]);
  });

  it("reports the leaf field name for a nested scalar difference", () => {
    const legacy = { meta: { totalItems: 5 } };
    const events = { meta: { totalItems: 6 } };
    const diffs = diffResults(legacy, events);
    expect(diffs).toEqual([
      expect.objectContaining({
        path: "meta.totalItems",
        field: "totalItems",
        legacy: 5,
        events: 6,
      }),
    ]);
  });

  it("aligns object arrays by id and reports per-field diffs", () => {
    const legacy = {
      data: [
        { id: "t1", name: "first" },
        { id: "t2", name: "second" },
      ],
    };
    const events = {
      // reversed order + one differing field
      data: [
        { id: "t2", name: "SECOND" },
        { id: "t1", name: "first" },
      ],
    };
    const diffs = diffResults(legacy, events);
    expect(diffs).toEqual([
      expect.objectContaining({
        field: "name",
        legacy: "second",
        events: "SECOND",
      }),
    ]);
  });

  it("reports multiple differing fields within aligned array objects", () => {
    const legacy = {
      data: [{ id: "o1", name: "a", level: "DEFAULT" }],
    };
    const events = {
      data: [{ id: "o1", name: "b", level: "ERROR" }],
    };
    const diffs = diffResults(legacy, events);
    expect(diffs.map((d) => d.field).sort()).toEqual(["level", "name"]);
  });
});

describe("shouldRunEventsTableExperiment", () => {
  it("is off when the sample rate is 0", () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 0;
    expect(shouldRunEventsTableExperiment()).toBe(false);
  });

  it("always runs when the sample rate is 1", () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 1;
    // Math.random() is always < 1, so this is deterministically true.
    expect(shouldRunEventsTableExperiment()).toBe(true);
  });

  it("honours the rate via Math.random", () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 0.5;
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValueOnce(0.4);
    expect(shouldRunEventsTableExperiment()).toBe(true);
    spy.mockReturnValueOnce(0.6);
    expect(shouldRunEventsTableExperiment()).toBe(false);
    spy.mockRestore();
  });
});

describe("runEventsTableExperiment", () => {
  const baseParams = {
    feature: "traces.test",
    projectId: "p1",
  };

  it("not sampled: returns the selected path and runs nothing else", async () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 0;
    const events = vi.fn().mockResolvedValue("EVENTS");
    const legacy = vi.fn().mockResolvedValue("LEGACY");
    const compare = vi.fn().mockReturnValue([]);

    const result = await runEventsTableExperiment({
      ...baseParams,
      selected: "events",
      events,
      legacy,
      compare,
    });

    expect(result).toBe("EVENTS");
    expect(events).toHaveBeenCalledTimes(1);
    expect(legacy).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
    // No experiment metrics on the fast path.
    expect(mocks.recordHistogram).not.toHaveBeenCalled();
    expect(mocks.recordIncrement).not.toHaveBeenCalled();
  });

  it("not sampled with selected=legacy: returns the legacy path", async () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 0;
    const events = vi.fn().mockResolvedValue("EVENTS");
    const legacy = vi.fn().mockResolvedValue("LEGACY");

    const result = await runEventsTableExperiment({
      ...baseParams,
      selected: "legacy",
      events,
      legacy,
      compare: vi.fn().mockReturnValue([]),
    });

    expect(result).toBe("LEGACY");
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(events).not.toHaveBeenCalled();
  });

  it("sampled + identical results: runs both, returns selected, records match", async () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 1;
    const events = vi.fn().mockResolvedValue({ a: 1 });
    const legacy = vi.fn().mockResolvedValue({ a: 1 });

    const result = await runEventsTableExperiment({
      ...baseParams,
      selected: "legacy",
      events,
      legacy,
      compare: (l, e) => diffResults(l, e),
    });

    expect(result).toEqual({ a: 1 });
    expect(events).toHaveBeenCalledTimes(1);
    expect(legacy).toHaveBeenCalledTimes(1);
    // Both latencies recorded, one per source.
    expect(mocks.recordHistogram).toHaveBeenCalledTimes(2);
    expect(mocks.recordHistogram).toHaveBeenCalledWith(
      "langfuse.events_table_experiment.latency_ms",
      expect.any(Number),
      { feature: "traces.test", source: "legacy" },
    );
    expect(mocks.recordHistogram).toHaveBeenCalledWith(
      "langfuse.events_table_experiment.latency_ms",
      expect.any(Number),
      { feature: "traces.test", source: "events" },
    );
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.events_table_experiment.result",
      1,
      { feature: "traces.test", match: "true" },
    );
    // No field mismatch recorded for identical results.
    expect(mocks.recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.events_table_experiment.field_mismatch",
      expect.anything(),
      expect.anything(),
    );
  });

  it("sampled + mismatch: records field_mismatch, match=false, and logs", async () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 1;
    const events = vi.fn().mockResolvedValue({ name: "X" });
    const legacy = vi.fn().mockResolvedValue({ name: "Y" });

    const result = await runEventsTableExperiment({
      ...baseParams,
      selected: "events",
      events,
      legacy,
      compare: (l, e) => diffResults(l, e),
    });

    expect(result).toEqual({ name: "X" });
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.events_table_experiment.result",
      1,
      { feature: "traces.test", match: "false" },
    );
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.events_table_experiment.field_mismatch",
      1,
      { feature: "traces.test", field: "name" },
    );
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      "events table experiment mismatch",
      expect.objectContaining({ feature: "traces.test", projectId: "p1" }),
    );
  });

  it("sampled + shadow read fails: returns selected, records shadow_error, no throw", async () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 1;
    const events = vi.fn().mockResolvedValue("EVENTS"); // selected
    const legacy = vi.fn().mockRejectedValue(new Error("shadow boom")); // shadow
    const compare = vi.fn();

    const result = await runEventsTableExperiment({
      ...baseParams,
      selected: "events",
      events,
      legacy,
      compare,
    });

    expect(result).toBe("EVENTS");
    expect(compare).not.toHaveBeenCalled();
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.events_table_experiment.shadow_error",
      1,
      { feature: "traces.test" },
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "events table experiment shadow read failed",
      expect.objectContaining({ shadowSource: "legacy" }),
    );
  });

  it("sampled + selected read fails: propagates the error", async () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 1;
    const events = vi.fn().mockRejectedValue(new Error("selected boom")); // selected
    const legacy = vi.fn().mockResolvedValue("LEGACY"); // shadow

    await expect(
      runEventsTableExperiment({
        ...baseParams,
        selected: "events",
        events,
        legacy,
        compare: vi.fn(),
      }),
    ).rejects.toThrow("selected boom");
  });

  it("runs both read paths concurrently when sampled", async () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 1;
    let active = 0;
    let maxActive = 0;
    const slow = (value: string) =>
      vi.fn().mockImplementation(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 15));
        active -= 1;
        return value;
      });
    const events = slow("EVENTS");
    const legacy = slow("LEGACY");

    await runEventsTableExperiment({
      ...baseParams,
      selected: "events",
      events,
      legacy,
      compare: vi.fn().mockReturnValue([]),
    });

    // If the reads were serial, maxActive would be 1.
    expect(maxActive).toBe(2);
  });

  it("does not break the response when compare throws", async () => {
    mocks.env.LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE = 1;
    const events = vi.fn().mockResolvedValue("EVENTS");
    const legacy = vi.fn().mockResolvedValue("LEGACY");
    const compare = vi.fn().mockImplementation(() => {
      throw new Error("compare boom");
    });

    const result = await runEventsTableExperiment({
      ...baseParams,
      selected: "events",
      events,
      legacy,
      compare,
    });

    expect(result).toBe("EVENTS");
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "events table experiment comparison failed",
      expect.objectContaining({ feature: "traces.test" }),
    );
  });
});
