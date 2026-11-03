// @vitest-environment node

import { getScoreFilterConfig, observationScopeFilter } from "./scores-config";
import { decodeAndNormalizeFilters } from "../hooks/useSidebarFilterState";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { scoresFieldRegistry } from "@/src/features/scores/constants/scoresSearchRegistry";
import { planCommit } from "@/src/features/search-bar/lib/commit";

describe("getScoreFilterConfig", () => {
  it("keeps the evaluator-test filter when opening a score URL and editing its search pill", () => {
    const config = getScoreFilterConfig();
    const filters: FilterState = [
      {
        column: "isEvaluatorTest",
        type: "boolean",
        operator: "=",
        value: false,
      },
    ];

    expect(
      decodeAndNormalizeFilters(
        encodeFiltersGeneric(filters),
        config.columnDefinitions,
      ),
    ).toEqual(filters);
    const committed = planCommit(
      "isEvaluatorTest:false",
      undefined,
      scoresFieldRegistry(config),
    );
    expect(committed.status).toBe("committed");
    if (committed.status === "committed") {
      expect(committed.filters).toEqual(filters);
    }
  });

  it("offers score metadata in the filter sidebar", () => {
    const config = getScoreFilterConfig();

    expect(config.columnDefinitions).toContainEqual(
      expect.objectContaining({ id: "metadata", type: "stringObject" }),
    );
    expect(config.facets).toContainEqual({
      type: "stringKeyValue",
      column: "metadata",
      label: "Metadata",
    });
  });

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

describe("observationScopeFilter", () => {
  it("includes trace-level scores only for a trace-level owner", () => {
    expect(observationScopeFilter("obs-1", true)).toEqual([
      {
        column: "observationId",
        type: "stringOptions",
        operator: "any of",
        value: ["", "obs-1"],
      },
    ]);
    expect(observationScopeFilter("obs-1", false)).toEqual([
      {
        column: "observationId",
        type: "string",
        operator: "=",
        value: "obs-1",
      },
    ]);
    expect(observationScopeFilter(undefined, true)).toEqual([]);
  });
});
