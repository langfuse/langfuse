import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FilterInput, FilterState } from "@langfuse/shared";

import { DEFAULT_SEARCH_TYPE } from "@/src/features/search-bar/lib/commit";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";

const NEW_FILTERS: FilterState = [
  { type: "string", column: "name", operator: "contains", value: "checkout" },
];

// A cross-field OR tree, as the AI generator now produces it.
const OR_TREE: FilterInput = {
  type: "group",
  operator: "OR",
  conditions: [
    {
      type: "stringOptions",
      column: "level",
      operator: "any of",
      value: ["ERROR"],
    },
    { type: "number", column: "latency", operator: ">", value: 5 },
  ],
};

function setup(
  overrides: Partial<Parameters<typeof useEventsSearchBar>[0]> = {},
) {
  const setFilterExpression = vi.fn();
  const setSearchQuery = vi.fn();
  const setSearchType = vi.fn();
  const { result } = renderHook(() =>
    useEventsSearchBar({
      projectId: "p",
      enabled: true,
      filterExpression: [],
      searchQuery: "refund",
      searchType: DEFAULT_SEARCH_TYPE,
      observed: undefined,
      setFilterExpression,
      setSearchQuery,
      setSearchType,
      ...overrides,
    }),
  );
  return { result, setFilterExpression, setSearchQuery, setSearchType };
}

describe("useEventsSearchBar.applyFilters", () => {
  it("clears the free-text lane so refine actually drops it", () => {
    // The model gets the full bar text (with `refund` rendered inline) as
    // refine context and returns the COMPLETE updated FilterState. Applying it
    // must clear searchQuery, else the dropped free text re-derives back in.
    const { result, setFilterExpression, setSearchQuery } = setup();
    act(() => result.current.applyFilters(NEW_FILTERS));
    expect(setFilterExpression).toHaveBeenCalledWith(NEW_FILTERS);
    expect(setSearchQuery).toHaveBeenCalledWith(null);
  });

  it("applies a nested OR tree unchanged when there are no skipped filters", () => {
    // The AI generator can now return a tree (cross-field OR / brackets). With
    // no grammar-less filters to preserve, applyFilters writes it through as-is.
    const { result, setFilterExpression, setSearchQuery } = setup();
    act(() => result.current.applyFilters(OR_TREE));
    expect(setFilterExpression).toHaveBeenCalledWith(OR_TREE);
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
