import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FilterState } from "@langfuse/shared";

import { DEFAULT_SEARCH_TYPE } from "@/src/features/search-bar/lib/commit";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { SCORES_FIELD_REGISTRY } from "@/src/features/scores/constants/scoresSearchRegistry";

const NEW_FILTERS: FilterState = [
  { type: "string", column: "name", operator: "contains", value: "checkout" },
];

function setup(
  overrides: Partial<Parameters<typeof useEventsSearchBar>[0]> = {},
) {
  const setFilterState = vi.fn();
  const setSearchQuery = vi.fn();
  const setSearchType = vi.fn();
  const { result } = renderHook(() =>
    useEventsSearchBar({
      projectId: "p",
      tableName: "observations",
      enabled: true,
      filterState: [],
      searchQuery: "refund",
      searchType: DEFAULT_SEARCH_TYPE,
      observed: undefined,
      setFilterState,
      setSearchQuery,
      setSearchType,
      ...overrides,
    }),
  );
  return { result, setFilterState, setSearchQuery, setSearchType };
}

describe("useEventsSearchBar.commit", () => {
  it("preserves a Scores saved-view filter the bar cannot represent", () => {
    const hiddenFilter: FilterState = [
      {
        column: "evaluatorId",
        type: "stringOptions",
        operator: "any of",
        value: ["legacy-evaluator"],
      },
    ];
    const { result, setFilterState } = setup({
      tableName: "scores",
      registry: SCORES_FIELD_REGISTRY,
      filterState: hiddenFilter,
      searchQuery: null,
    });
    act(() => result.current.store.getState().actions.setDraft("Rouge Score"));
    act(() => {
      result.current.commit("enter");
    });
    expect(setFilterState).toHaveBeenCalledWith([
      {
        column: "name",
        type: "string",
        operator: "contains",
        value: "Rouge Score",
      },
      ...hiddenFilter,
    ]);
  });

  it("fully replaces hidden filters when a query preset is picked", () => {
    const hiddenFilter: FilterState = [
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "all of",
        value: ["legacy-scope"],
      },
    ];
    const { result, setFilterState } = setup({
      filterState: hiddenFilter,
      searchQuery: null,
    });

    act(() => result.current.store.getState().actions.setDraft("level:ERROR"));
    act(() => result.current.commit("pick", { replaceHidden: true }));

    expect(setFilterState).toHaveBeenCalledWith([
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
  });
});

describe("useEventsSearchBar.applyFilters", () => {
  it("clears the free-text lane so refine actually drops it", () => {
    // The model gets the full bar text (with `refund` rendered inline) as
    // refine context and returns the COMPLETE updated FilterState. Applying it
    // must clear searchQuery, else the dropped free text re-derives back in.
    const { result, setFilterState, setSearchQuery } = setup();
    act(() => result.current.applyFilters(NEW_FILTERS));
    expect(setFilterState).toHaveBeenCalledWith(NEW_FILTERS);
    expect(setSearchQuery).toHaveBeenCalledWith(null);
  });

  it("resets a non-default searchType to the default on apply", () => {
    const { result, setSearchType } = setup({ searchType: ["id"] });
    act(() => result.current.applyFilters(NEW_FILTERS));
    expect(setSearchType).toHaveBeenCalledWith(DEFAULT_SEARCH_TYPE);
  });

  it("skips the redundant searchType write when already default", () => {
    const { result, setSearchType } = setup({
      searchType: DEFAULT_SEARCH_TYPE,
    });
    act(() => result.current.applyFilters(NEW_FILTERS));
    expect(setSearchType).not.toHaveBeenCalled();
  });
});
