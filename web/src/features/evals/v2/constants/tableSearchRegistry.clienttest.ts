// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { runSearchBarInvariants } from "@/src/features/search-bar/lib/searchBarInvariants";
import { validateQuery } from "@/src/features/search-bar/lib/validate";
import { evaluationRuleTableFilterConfig } from "./tableFilterColumns";
import {
  EVALUATORS_LIST_FIELD_REGISTRY,
  evaluationRulesListFieldRegistry,
} from "./tableSearchRegistry";

const rulesRegistry = evaluationRulesListFieldRegistry(
  evaluationRuleTableFilterConfig,
);

for (const registry of [EVALUATORS_LIST_FIELD_REGISTRY, rulesRegistry]) {
  describe(`${registry.id} search contract`, () => {
    it.each(["has:name", "-has:creator"])(
      "rejects presence filters unsupported by the list API: %s",
      (query) => {
        expect(planCommit(query, undefined, registry).status).toBe("invalid");
      },
    );

    it("keeps bare name searches in the existing search lane", () => {
      expect(planCommit("answer quality", undefined, registry)).toMatchObject({
        status: "committed",
        filters: [],
        searchQuery: "answer quality",
      });
    });

    it("preserves categorical exact matches alongside substring filters", () => {
      expect(
        planCommit("name:=quality creator:API", undefined, registry),
      ).toMatchObject({
        status: "committed",
        filters: [
          {
            type: "stringOptions",
            column: "name",
            operator: "any of",
            value: ["quality"],
          },
          {
            type: "string",
            column: "creator",
            operator: "contains",
            value: "API",
          },
        ],
      });
    });

    it("satisfies validation, lowering and saved-filter round trips", () => {
      const sidebarFilters: FilterState[] = [
        [
          {
            type: "stringOptions",
            column: "name",
            operator: "any of",
            value: ["answer quality"],
          },
        ],
        [
          {
            type: "stringOptions",
            column: "creator",
            operator: "none of",
            value: ["API", "Reviewer"],
          },
        ],
      ];
      expect(
        runSearchBarInvariants({
          name: registry.id,
          registry,
          extraKeys: ["metadata.region", "scores.quality"],
          scoreContexts: [],
          fieldValues: [
            "ACTIVE",
            "CODE",
            "LLM_AS_JUDGE",
            "true",
            "false",
            "API",
            "answer quality",
            "unknown",
          ],
          freeTextValues: ["answer quality", "quality"],
          sidebarFilters,
        }),
      ).toEqual([]);
    });
  });
}

describe("evaluator list enums", () => {
  it.each([
    "status:unknown",
    "status:(ACTIVE OR unknown)",
    "-type:unknown",
    "status:*ACT*",
    "type:CO*",
  ])("rejects unsupported enum values in %s", (query) => {
    expect(
      validateQuery(query, undefined, EVALUATORS_LIST_FIELD_REGISTRY).valid,
    ).toBe(false);
    expect(
      planCommit(query, undefined, EVALUATORS_LIST_FIELD_REGISTRY).status,
    ).toBe("invalid");
  });

  it("round-trips canonical enums", () => {
    expect(
      planCommit(
        "status:ACTIVE type:CODE",
        undefined,
        EVALUATORS_LIST_FIELD_REGISTRY,
      ),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          type: "stringOptions",
          column: "status",
          operator: "any of",
          value: ["ACTIVE"],
        },
        {
          type: "stringOptions",
          column: "type",
          operator: "any of",
          value: ["CODE"],
        },
      ],
    });
  });
});

describe("rule list facet scope", () => {
  it("preserves hidden upgrade filters while rejecting new hidden-field tokens", () => {
    const registry = evaluationRulesListFieldRegistry({
      ...evaluationRuleTableFilterConfig,
      facets: evaluationRuleTableFilterConfig.facets.filter(
        (facet) => facet.column !== "upgradeRequired",
      ),
    });
    const filters: FilterState = [
      {
        type: "boolean",
        column: "upgradeRequired",
        operator: "=",
        value: true,
      },
    ];
    const projection = filterStateToQueryText(filters, {}, registry);
    expect(projection.skippedFilters).toEqual(filters);
    expect(planCommit("upgradeRequired:true", undefined, registry).status).toBe(
      "invalid",
    );
  });
});
