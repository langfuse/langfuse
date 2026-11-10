import { describe, expect, it } from "vitest";
import { resolveTopicFacetId } from "./topic-facet-selection";

describe("resolveTopicFacetId", () => {
  const facets = [{ facetId: "intent" }, { facetId: "issues" }];

  it("retains user intent when refreshed results contain the same facet", () => {
    expect(resolveTopicFacetId(facets, "issues")).toBe("issues");
    expect(
      resolveTopicFacetId(
        facets.map((facet) => ({ ...facet })),
        "issues",
      ),
    ).toBe("issues");
  });

  it("uses the first available facet when no choice exists or a choice disappears", () => {
    expect(resolveTopicFacetId(facets, undefined)).toBe("intent");
    expect(resolveTopicFacetId([{ facetId: "intent" }], "issues")).toBe(
      "intent",
    );
    expect(resolveTopicFacetId([], "issues")).toBeUndefined();
  });
});
