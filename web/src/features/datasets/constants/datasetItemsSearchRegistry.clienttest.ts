import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";
import { DATASET_ITEMS_FIELD_REGISTRY } from "./datasetItemsSearchRegistry";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import {
  applyPick,
  planInputCompletions,
} from "@/src/features/search-bar/lib/completions";
import { runSearchBarInvariants } from "@/src/features/search-bar/lib/searchBarInvariants";

const registry = DATASET_ITEMS_FIELD_REGISTRY;
const metadataFilter: FilterState = [
  {
    column: "metadata",
    type: "stringObject",
    key: "region",
    operator: "=",
    value: "eu",
  },
];

describe("dataset item search contract", () => {
  it("keeps bare phrases in the ID lane and resets to it when clearing", () => {
    expect(planCommit("item 123", undefined, registry)).toMatchObject({
      status: "committed",
      filters: [],
      searchQuery: "item 123",
      searchType: ["id"],
    });
    expect(planCommit("", undefined, registry)).toMatchObject({
      status: "committed",
      filters: [],
      searchQuery: null,
      searchType: ["id"],
    });
  });

  it.each([
    ["content", ["content"]],
    ["input", ["input"]],
    ["output", ["output"]],
    ["all", ["id", "content"]],
  ])(
    "round-trips the %s lane alongside metadata filters",
    (scope, searchType) => {
      const first = planCommit(
        `${scope}:"refund policy" metadata.region:eu`,
        undefined,
        registry,
      );
      expect(first).toMatchObject({
        status: "committed",
        filters: metadataFilter,
        searchQuery: "refund policy",
        searchType,
      });
      if (first.status !== "committed") throw new Error(first.status);

      const projection = filterStateToQueryText(first.filters, first, registry);
      expect(projection.skippedFilters).toEqual([]);
      expect(planCommit(projection.text, undefined, registry)).toMatchObject({
        status: "committed",
        filters: metadataFilter,
        searchQuery: first.searchQuery,
        searchType,
      });
    },
  );

  it("offers payload scope rewrites that keep the full phrase", () => {
    const input = "refund policy";
    const plan = planInputCompletions(
      {
        input,
        caret: input.length,
        observed: {},
        recents: [],
        currentQueryText: input,
      },
      registry,
    );
    const options = plan?.sections.flatMap((section) => section.options) ?? [];
    for (const [scope, searchType] of [
      ["content", ["content"]],
      ["input", ["input"]],
      ["output", ["output"]],
      ["all", ["id", "content"]],
    ] as const) {
      const option = options.find((option) => option.id === `scope:${scope}`);
      expect(option).toBeDefined();
      if (
        !plan ||
        !option ||
        option.kind === "recent" ||
        option.kind === "preset"
      ) {
        throw new Error("Expected a scope completion");
      }
      expect(
        planCommit(applyPick(option, input, plan).next, undefined, registry),
      ).toMatchObject({
        status: "committed",
        filters: [],
        searchQuery: input,
        searchType,
      });
    }
  });

  it("preserves metadata filter and quoting invariants without exposing unsupported fields", () => {
    const legacyProjection = filterStateToQueryText(
      metadataFilter.map((filter) => ({ ...filter, column: "Metadata" })),
      undefined,
      registry,
    );
    expect(legacyProjection.skippedFilters).toEqual([]);
    expect(
      planCommit(legacyProjection.text, undefined, registry),
    ).toMatchObject({
      status: "committed",
      filters: metadataFilter,
    });
    expect(
      runSearchBarInvariants({
        name: "dataset items",
        registry,
        extraKeys: ["metadata.region", 'metadata."review team"'],
        scoreContexts: [],
        fieldValues: ["x", "5", "true", '"a b"'],
        freeTextValues: ["item 123", "or", "!important", "key:value"],
        sidebarFilters: [metadataFilter],
      }),
    ).toEqual([]);
    for (const query of ["status:ACTIVE", "scores.quality:1", "traceId:abc"]) {
      expect(planCommit(query, undefined, registry).status).toBe("invalid");
    }
  });
});
