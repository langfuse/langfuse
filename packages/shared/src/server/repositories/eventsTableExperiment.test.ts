import { describe, expect, it } from "vitest";

import {
  diffResults,
  shouldRunEventsTableExperiment,
} from "./eventsTableExperiment";

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

  it("treats null and undefined as equal", () => {
    const legacy = { userId: null };
    const events = { userId: undefined };
    expect(diffResults(legacy, events)).toEqual([]);
  });

  it("treats Date and equal epoch millis as equal", () => {
    const ts = new Date("2024-01-01T00:00:00.000Z");
    const legacy = { timestamp: ts };
    const events = { timestamp: new Date(ts.getTime()) };
    expect(diffResults(legacy, events)).toEqual([]);
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
});

describe("shouldRunEventsTableExperiment", () => {
  it("is off by default (sample rate 0)", () => {
    // LANGFUSE_EVENTS_TABLE_EXPERIMENT_SAMPLE_RATE defaults to 0 in tests.
    expect(shouldRunEventsTableExperiment()).toBe(false);
  });
});
