// @vitest-environment node

import { describe, expect, it } from "vitest";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { runSearchBarInvariants } from "@/src/features/search-bar/lib/searchBarInvariants";
import {
  EVAL_LOGS_FIELD_REGISTRY,
  LEGACY_EVALUATORS_FIELD_REGISTRY,
} from "./tableSearchRegistry";

for (const registry of [
  LEGACY_EVALUATORS_FIELD_REGISTRY,
  EVAL_LOGS_FIELD_REGISTRY,
]) {
  it(`${registry.id} preserves facet filters through validation and lowering`, () => {
    expect(
      runSearchBarInvariants({
        name: registry.id,
        registry,
        extraKeys: ["metadata.region", "scores.quality"],
        scoreContexts: [],
        fieldValues: [
          "ACTIVE",
          "ERROR",
          "EVENT",
          "NEW",
          "HISTORIC",
          "example trace",
        ],
        freeTextValues: ["answer quality"],
      }),
    ).toEqual([]);
  });
}

describe("legacy evaluator search lanes", () => {
  it("keeps score and rule name search separate from structured filters", () => {
    expect(
      planCommit(
        "quality status:ACTIVE",
        undefined,
        LEGACY_EVALUATORS_FIELD_REGISTRY,
      ),
    ).toMatchObject({
      status: "committed",
      searchQuery: "quality",
      filters: [
        {
          column: "status",
          type: "stringOptions",
          operator: "any of",
          value: ["ACTIVE"],
        },
      ],
    });
  });

  it("lowers log searches into the supported trace ID filter", () => {
    expect(
      planCommit("example trace", undefined, EVAL_LOGS_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      searchQuery: null,
      filters: [
        {
          column: "traceId",
          type: "string",
          operator: "contains",
          value: "example trace",
        },
      ],
    });
  });
});
