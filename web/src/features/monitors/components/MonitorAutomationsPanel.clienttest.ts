import { describe, expect, it } from "vitest";

import { __test } from "./MonitorAutomationsPanel";

const { computeSelectedSet, toggle } = __test;

describe("computeSelectedSet", () => {
  it("pre-checks rows whose trigger.id is in triggerIds", () => {
    const liveIds = ["t1", "t2", "t3"];
    const selected = computeSelectedSet(["t1", "t3"], liveIds);
    expect(selected.has("t1")).toBe(true);
    expect(selected.has("t2")).toBe(false);
    expect(selected.has("t3")).toBe(true);
  });

  it("drops stale IDs that are no longer in liveTriggerIds", () => {
    const liveIds = ["t1", "t2"];
    const selected = computeSelectedSet(["t1", "t99-stale"], liveIds);
    expect(selected.has("t1")).toBe(true);
    expect(selected.has("t99-stale")).toBe(false);
    expect(selected.size).toBe(1);
  });
});

describe("toggle", () => {
  it("toggle-on appends the id to the selected set and returns the new array", () => {
    const liveIds = ["t1", "t2", "t3"];
    const current = ["t1"];
    const next = toggle("t2", current, liveIds);
    expect(next).toContain("t1");
    expect(next).toContain("t2");
    expect(next).not.toContain("t3");
  });

  it("toggle-off removes the id from the selected set and returns the new array", () => {
    const liveIds = ["t1", "t2", "t3"];
    const current = ["t1", "t2"];
    const next = toggle("t2", current, liveIds);
    expect(next).toContain("t1");
    expect(next).not.toContain("t2");
  });

  it("stale IDs are dropped during a toggle-on (lazy cleanup)", () => {
    const liveIds = ["t1", "t2"];
    // t99 is stale — not in liveIds; t2 is being toggled on
    const current = ["t1", "t99-stale"];
    const next = toggle("t2", current, liveIds);
    expect(next).toContain("t1");
    expect(next).toContain("t2");
    expect(next).not.toContain("t99-stale");
  });
});
