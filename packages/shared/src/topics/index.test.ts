import { describe, expect, it } from "vitest";
import { orderByFacetIds, sortTopicFacets } from "./index";

describe("sortTopicFacets", () => {
  it("orders built-in presets canonically ahead of unlisted built-ins and custom facets", () => {
    const sharedTimestamp = new Date("2026-11-20T12:00:00Z");
    const facets = [
      {
        id: "c_custom_later",
        name: "Alpha",
        isBuiltIn: false,
        createdAt: new Date("2026-11-22T00:00:00Z"),
      },
      {
        id: "c_custom_intent",
        name: "Intent",
        isBuiltIn: false,
        createdAt: new Date("2026-11-21T00:00:00Z"),
      },
      {
        id: "a_issues",
        name: "Issues",
        isBuiltIn: true,
        createdAt: sharedTimestamp,
      },
      {
        id: "b_outcome",
        name: "Outcome",
        isBuiltIn: true,
        createdAt: sharedTimestamp,
      },
      {
        id: "c_unlisted",
        name: "Latency",
        isBuiltIn: true,
        createdAt: sharedTimestamp,
      },
      {
        id: "d_sentiment",
        name: "Sentiment",
        isBuiltIn: true,
        createdAt: sharedTimestamp,
      },
      {
        id: "z_intent",
        name: "Intent",
        isBuiltIn: true,
        createdAt: sharedTimestamp,
      },
      {
        id: "c_custom_tie_b",
        name: "Beta",
        isBuiltIn: false,
        createdAt: new Date("2026-11-21T00:00:00Z"),
      },
    ];

    expect(sortTopicFacets(facets).map((facet) => facet.id)).toEqual([
      "z_intent",
      "d_sentiment",
      "b_outcome",
      "a_issues",
      "c_unlisted",
      "c_custom_intent",
      "c_custom_tie_b",
      "c_custom_later",
    ]);
  });

  it("preserves custom facet input order when createdAt is absent", () => {
    const facets = [
      { id: "custom-2", name: "Zebra", isBuiltIn: false },
      { id: "issues", name: "Issues", isBuiltIn: true },
      { id: "custom-1", name: "Apple", isBuiltIn: false },
      { id: "intent", name: "Intent", isBuiltIn: true },
    ];

    expect(sortTopicFacets(facets).map((facet) => facet.id)).toEqual([
      "intent",
      "issues",
      "custom-2",
      "custom-1",
    ]);
  });
});

describe("orderByFacetIds", () => {
  it("orders items by canonical facet IDs and keeps unknown IDs last in original order", () => {
    const items = [
      { facetId: "deleted-1" },
      { facetId: "issues" },
      { facetId: "deleted-2" },
      { facetId: "intent" },
      { facetId: "outcome" },
    ];

    expect(
      orderByFacetIds(items, (item) => item.facetId, [
        "intent",
        "sentiment",
        "outcome",
        "issues",
      ]).map((item) => item.facetId),
    ).toEqual(["intent", "outcome", "issues", "deleted-1", "deleted-2"]);
  });
});
