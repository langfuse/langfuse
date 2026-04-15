import { getScoreFilterConfig } from "./scores-config";

describe("getScoreFilterConfig", () => {
  it("omits sidebar facets for hidden score columns", () => {
    const config = getScoreFilterConfig([
      "traceId",
      "traceName",
      "observationId",
      "traceTags",
    ]);

    expect(config.facets.map((facet) => facet.column)).not.toContain("traceId");
    expect(config.facets.map((facet) => facet.column)).not.toContain(
      "traceName",
    );
    expect(config.facets.map((facet) => facet.column)).not.toContain(
      "observationId",
    );
    expect(config.facets.map((facet) => facet.column)).not.toContain("tags");
    expect(config.facets.map((facet) => facet.column)).toContain("userId");
  });
});
