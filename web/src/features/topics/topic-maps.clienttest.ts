import { describe, expect, it } from "vitest";
import {
  resolveTopicMapSelection,
  suggestTopicRuleName,
  topicRuleFreshness,
  type TopicMapsOverview,
} from "./topic-maps";

const overview = {
  refitIntervalHours: 24,
  rules: [{ id: "support" }, { id: "checkout" }],
  analyses: [
    {
      id: "refunds",
      latestExecutionId: "refunds-2",
      runs: [{ executionId: "refunds-2" }, { executionId: "refunds" }],
    },
  ],
} as unknown as TopicMapsOverview;

describe("resolveTopicMapSelection", () => {
  it("opens the first rule without a map in the URL", () => {
    expect(resolveTopicMapSelection(overview, undefined, undefined)).toEqual({
      kind: "rule",
      id: "support",
    });
  });

  it("keeps a known analysis run and falls back to its latest run", () => {
    expect(
      resolveTopicMapSelection(overview, "analysis:refunds", "refunds"),
    ).toEqual({ kind: "analysis", id: "refunds", runId: "refunds" });
    expect(
      resolveTopicMapSelection(overview, "analysis:refunds", "unknown"),
    ).toEqual({ kind: "analysis", id: "refunds", runId: "refunds-2" });
  });

  it("falls back to the first rule for a deleted map", () => {
    expect(
      resolveTopicMapSelection(overview, "analysis:gone", undefined),
    ).toEqual({ kind: "rule", id: "support" });
  });
});

describe("rule labels", () => {
  it("suggests a name from the filter values", () => {
    expect(
      suggestTopicRuleName([
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
        {
          column: "traceName",
          type: "stringOptions",
          operator: "any of",
          value: ["support-agent"],
        },
      ]),
    ).toBe("production · support-agent");
    expect(suggestTopicRuleName([])).toBe("All traces");
  });

  it("describes refit timing", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    expect(
      topicRuleFreshness(
        {
          enabled: true,
          lastRefitAt: "2026-10-30T10:00:00Z",
          nextRefitAt: "2026-10-31T10:00:00Z",
        },
        now,
      ),
    ).toBe("Updated 2 h ago · next refit in 22 h");
    expect(
      topicRuleFreshness(
        { enabled: true, lastRefitAt: null, nextRefitAt: null },
        now,
      ),
    ).toBe("Building first topics");
  });
});
