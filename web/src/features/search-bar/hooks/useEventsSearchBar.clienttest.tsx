import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FilterState } from "@langfuse/shared";

import { DEFAULT_SEARCH_TYPE } from "@/src/features/search-bar/lib/commit";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";

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
