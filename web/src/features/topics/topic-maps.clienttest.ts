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
  it("estimates the next nightly refit a whole number of days after the last", () => {
    const last = Date.parse("2026-11-17T04:12:00.000Z");
    expect(
      topicNextRefitLabel(new Date(last).toISOString(), last + 25 * 3_600_000),
    ).toBe("in about 23 hours");
  });
});
