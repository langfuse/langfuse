import { describe, expect, it } from "vitest";
import {
  resolveTopicMapSelection,
  topicsViewQueryPatch,
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

describe("topicsViewQueryPatch", () => {
  it("names the shown map and facet in the URL until it matches the view", () => {
    const view = { map: "rule:support", facetId: "intent" };
    expect(topicsViewQueryPatch({ projectId: "p" }, view)).toEqual({
      map: "rule:support",
      topicFacet: "intent",
    });
    expect(
      topicsViewQueryPatch(
        { map: "rule:support", topicFacet: "deleted-facet" },
        view,
      ),
    ).toEqual({ topicFacet: "intent" });
    expect(
      topicsViewQueryPatch({ map: "rule:support", topicFacet: "intent" }, view),
    ).toBeNull();
    expect(
      topicsViewQueryPatch(
        { topicFacet: "sentiment" },
        { map: undefined, facetId: undefined },
      ),
    ).toBeNull();
  });
});
