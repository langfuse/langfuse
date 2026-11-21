import { describe, expect, it } from "vitest";
import { resolveTopicMapSelection, type TopicMapsOverview } from "./topic-maps";

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
