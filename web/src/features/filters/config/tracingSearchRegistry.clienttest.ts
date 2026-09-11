// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { runSearchBarInvariants } from "@/src/features/search-bar/lib/searchBarInvariants";
import { validateQuery } from "@/src/features/search-bar/lib/validate";
import { getTraceFilterConfig } from "./traces-config";
import { getObservationsFilterConfig } from "./observations-config";
import {
  observationsFieldRegistry,
  tracesFieldRegistry,
} from "./tracingSearchRegistry";

const registries = [
  tracesFieldRegistry(getTraceFilterConfig()),
  observationsFieldRegistry(getObservationsFilterConfig()),
];

for (const registry of registries) {
  describe(`${registry.id} search registry`, () => {
    it("keeps bare phrases in the host's existing full-text search lane", () => {
      expect(planCommit("refund policy", undefined, registry)).toMatchObject({
        status: "committed",
        filters: [],
        searchQuery: "refund policy",
      });
    });

    it.each(["traceScores.quality:>0.8", "bookmarked:true"])(
      "rejects unsupported filters without changing the query for %s",
      (query) => {
        expect(validateQuery(query, undefined, registry).valid).toBe(false);
        expect(planCommit(query, undefined, registry).status).toBe("invalid");
      },
    );

    it.each(["content", "input", "output"] as const)(
      "searches %s through the existing backend scope",
      (scope) => {
        expect(
          planCommit(`${scope}:refund`, undefined, registry),
        ).toMatchObject({
          status: "committed",
          searchQuery: "refund",
          searchType: [scope],
          filters: [],
        });
      },
    );

    it("round-trips supported names, tags, metadata, numeric ranges and score types", () => {
      const nameColumn = registry.id === "traces" ? "traceName" : "name";
      const tagsColumn = registry.id === "traces" ? "traceTags" : "tags";
      const sidebarFilters: FilterState[] = [
        [
          {
            column: nameColumn,
            type: "stringOptions",
            operator: "any of",
            value: ["refund agent"],
          },
        ],
        [
          {
            column: nameColumn,
            type: "string",
            operator: "contains",
            value: "refund",
          },
        ],
        [
          {
            column: tagsColumn,
            type: "arrayOptions",
            operator: "all of",
            value: ["billing", "urgent"],
          },
        ],
        [
          {
            column: "metadata",
            type: "stringObject",
            key: "review team",
            operator: "=",
            value: "quality",
          },
        ],
        [
          { column: "latency", type: "number", operator: ">=", value: 1.5 },
          { column: "latency", type: "number", operator: "<", value: 4 },
        ],
        [
          {
            column: "scores_avg",
            type: "numberObject",
            key: "helpfulness",
            operator: ">=",
            value: 0.8,
          },
        ],
        [
          {
            column: "score_categories",
            type: "categoryOptions",
            key: "resolution",
            operator: "any of",
            value: ["resolved"],
          },
        ],
        [
          {
            column: "score_booleans",
            type: "booleanObject",
            key: "policy",
            operator: "=",
            value: true,
          },
        ],
      ];
      const scoreContext = {
        numericScoreNames: new Set(["helpfulness"]),
        categoricalScoreNames: new Set(["resolution"]),
        booleanScoreNames: new Set(["policy"]),
      };
      expect(
        runSearchBarInvariants({
          name: registry.id,
          registry,
          extraKeys: [
            "metadata.region",
            'metadata."review team"',
            "scores.helpfulness",
            "scores.resolution",
            "scores.policy",
          ],
          scoreContexts: [scoreContext],
          fieldValues: [
            "refund agent",
            "ERROR",
            "GENERATION",
            "true",
            "false",
            "0.5",
            "or",
            "a,b",
          ],
          freeTextValues: ["refund policy", "or", "a,b", "!important"],
          sidebarFilters,
        }),
      ).toEqual([]);
      for (const filters of sidebarFilters) {
        const projection = filterStateToQueryText(filters, {}, registry);
        expect(projection.skippedFilters).toEqual([]);
        expect(
          planCommit(projection.text, scoreContext, registry),
        ).toMatchObject({
          status: "committed",
          filters,
        });
      }
    });
  });
}

describe("embedded tracing scope", () => {
  it("does not offer user or session controls omitted by the host", () => {
    const registry = tracesFieldRegistry(
      getTraceFilterConfig(["userId", "sessionId"]),
    );
    expect(registry.resolveField("user")).toBeNull();
    expect(registry.resolveField("session")).toBeNull();
    expect(planCommit("name:checkout", undefined, registry).status).toBe(
      "committed",
    );
  });

  it("does not offer a prompt or model facet omitted by the host", () => {
    const registry = observationsFieldRegistry(
      getObservationsFilterConfig(["model", "promptName"]),
    );
    expect(registry.resolveField("model")).toBeNull();
    expect(registry.resolveField("promptName")).toBeNull();
    expect(planCommit("type:GENERATION", undefined, registry).status).toBe(
      "committed",
    );
  });
});

describe("disabled legacy payload search", () => {
  it.each([
    tracesFieldRegistry(getTraceFilterConfig(), false),
    observationsFieldRegistry(getObservationsFilterConfig(), false),
  ])("offers only supported search lanes for $id", (registry) => {
    expect(planCommit("refund", undefined, registry)).toMatchObject({
      status: "committed",
      searchQuery: "refund",
      searchType: ["id"],
    });
    for (const scope of ["content", "input", "output", "all"]) {
      expect(planCommit(`${scope}:refund`, undefined, registry).status).toBe(
        "invalid",
      );
    }
    expect(planCommit("in:content refund", undefined, registry).status).toBe(
      "invalid",
    );
  });
});
