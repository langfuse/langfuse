import { describe, expect, it } from "vitest";
import { orderByFacetIds, sortTopicFacets } from "./index";

describe("sortTopicFacets", () => {
  it("puts built-in presets in canonical order while preserving other facets' order", () => {
    const facets = [
      { id: "c_first", name: "Intent", isBuiltIn: false },
      { id: "a_issues", name: "Issues", isBuiltIn: true },
      { id: "c_second", name: "Alpha", isBuiltIn: false },
      { id: "b_outcome", name: "Outcome", isBuiltIn: true },
      { id: "d_sentiment", name: "Sentiment", isBuiltIn: true },
      { id: "z_intent", name: "Intent", isBuiltIn: true },
    ];

    expect(sortTopicFacets(facets).map((facet) => facet.id)).toEqual([
      "z_intent",
      "d_sentiment",
      "b_outcome",
      "a_issues",
      "c_first",
      "c_second",
    ]);
  });
});

describe("orderByFacetIds", () => {
  it("orders items to match facets and keeps unknown IDs last", () => {
    const items = ["deleted-1", "issues", "deleted-2", "intent"].map(
      (facetId) => ({ facetId }),
    );
    const facets = [{ id: "intent" }, { id: "sentiment" }, { id: "issues" }];

    expect(orderByFacetIds(items, facets).map((item) => item.facetId)).toEqual([
      "intent",
      "issues",
      "deleted-1",
      "deleted-2",
    ]);
  });
});
