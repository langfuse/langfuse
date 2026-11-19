import { describe, expect, it } from "vitest";
import {
  resolveTopicMapSelection,
  topicNextRefitLabel,
  type TopicMapsOverview,
} from "./topic-maps";

const overview = {
  rules: [{ id: "support" }, { id: "checkout" }],
  analyses: [{ id: "refunds" }],
} as unknown as TopicMapsOverview;

describe("resolveTopicMapSelection", () => {
  it("opens the first rule without a map in the URL", () => {
    expect(resolveTopicMapSelection(overview, undefined)).toEqual({
      kind: "rule",
      id: "support",
    });
  });

  it("keeps a known analysis", () => {
    expect(resolveTopicMapSelection(overview, "analysis:refunds")).toEqual({
      kind: "analysis",
      id: "refunds",
    });
  });

  it("falls back to the first rule for a deleted map", () => {
    expect(resolveTopicMapSelection(overview, "analysis:gone")).toEqual({
      kind: "rule",
      id: "support",
    });
  });
});

describe("topicNextRefitLabel", () => {
  it("counts to the following day's slot once a fetched slot has passed", () => {
    const slot = Date.parse("2026-11-19T04:12:00.000Z");
    expect(
      topicNextRefitLabel(new Date(slot).toISOString(), slot + 3_600_000),
    ).toBe("in about 23 hours");
  });
});
