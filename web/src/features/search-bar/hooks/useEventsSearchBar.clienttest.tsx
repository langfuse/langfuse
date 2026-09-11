import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FilterState, TracingSearchType } from "@langfuse/shared";

import { DEFAULT_SEARCH_TYPE } from "@/src/features/search-bar/lib/commit";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { SCORES_FIELD_REGISTRY } from "@/src/features/scores/constants/scoresSearchRegistry";
import * as recentSearches from "@/src/features/search-bar/lib/recent-searches";

afterEach(() => vi.restoreAllMocks());

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => capture,
}));
beforeEach(() => capture.mockClear());

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

function setupSplitEcho() {
  const setSearchQuery = vi.fn();
  return {
    setSearchQuery,
    ...renderHook(
      ({ searchQuery }: { searchQuery: string | null }) => {
        const [filterState, setFilterState] = useState<FilterState>([]);
        return {
          ...useEventsSearchBar({
            projectId: "p",
            tableName: "observations",
            enabled: true,
            filterState,
            searchQuery,
            searchType: DEFAULT_SEARCH_TYPE,
            observed: undefined,
            setFilterState,
            setSearchQuery,
            setSearchType: vi.fn(),
          }),
          navigateToFilters: setFilterState,
        };
      },
      { initialProps: { searchQuery: null as string | null } },
    ),
  };
}

describe("useEventsSearchBar.commit", () => {
  it("keeps a mixed commit intact while the filter echoes before the search URL", () => {
    const { result, rerender, setSearchQuery } = setupSplitEcho();

    act(() =>
      result.current.store.getState().actions.setDraft("level:ERROR refund"),
    );
    act(() => result.current.commit("enter"));
    expect(result.current.store.getState().draft.trim()).toBe(
      "level:ERROR refund",
    );

    act(() => result.current.commit("blur"));
    expect(setSearchQuery).toHaveBeenLastCalledWith("refund");
    expect(capture).toHaveBeenCalledTimes(1);

    act(() =>
      result.current.store
        .getState()
        .actions.setDraft("level:ERROR refund next"),
    );
    rerender({ searchQuery: "refund" });
    expect(result.current.store.getState().draft).toBe(
      "level:ERROR refund next",
    );

    act(() => result.current.navigateToFilters([]));
    rerender({ searchQuery: null });
    expect(result.current.store.getState().draft).toBe("");
  });

  it("replaces a pending commit when an explicit draft reset matches a partial echo", () => {
    const { result, rerender } = setupSplitEcho();
    act(() =>
      result.current.store.getState().actions.setDraft("level:ERROR refund"),
    );
    act(() => result.current.commit("enter"));
    act(() =>
      result.current.resetDraft({
        filters: [
          {
            type: "stringOptions",
            column: "level",
            operator: "any of",
            value: ["ERROR"],
          },
        ],
        searchQuery: null,
        searchType: DEFAULT_SEARCH_TYPE,
      }),
    );
    rerender({ searchQuery: null });
    expect(result.current.store.getState().draft.trim()).toBe("level:ERROR");
  });

  it.each(["back", "different filters"])(
    "honors external navigation before all commit lanes acknowledge: %s",
    (navigation) => {
      const { result } = setupSplitEcho();
      act(() =>
        result.current.store.getState().actions.setDraft("level:ERROR refund"),
      );
      act(() => result.current.commit("enter"));
      if (navigation === "back") {
        act(() => window.dispatchEvent(new PopStateEvent("popstate")));
        act(() => result.current.navigateToFilters([]));
        expect(result.current.store.getState().draft).toBe("");
      } else {
        act(() => result.current.navigateToFilters(NEW_FILTERS));
        expect(result.current.store.getState().draft.trim()).toBe(
          "name:checkout",
        );
      }
    },
  );

  it.each<{ scope: TracingSearchType[] }>([
    { scope: ["id"] },
    { scope: ["id", "output"] },
    { scope: [] },
  ])(
    "reports the host's actual search scope without changing grammar lowering: $scope",
    ({ scope }) => {
      const { result, setSearchType } = setup({
        analyticsSearchType: scope,
        isV4: false,
      });
      act(() =>
        result.current.store
          .getState()
          .actions.setDraft("sensitive scope phrase"),
      );
      act(() => result.current.commit("enter"));
      expect(capture).toHaveBeenCalledWith(
        "filters:search_submitted",
        expect.objectContaining({ searchType: scope, isV4: false }),
      );
      expect(setSearchType).not.toHaveBeenCalled();
      expect(JSON.stringify(capture.mock.calls)).not.toContain(
        "sensitive scope phrase",
      );
    },
  );
  it("commits outside a project without writing project recent searches", () => {
    const recordRecentSearch = vi
      .spyOn(recentSearches, "recordRecentSearch")
      .mockImplementation(() => {});
    const { result, setFilterState } = setup({
      projectId: undefined,
      searchQuery: null,
    });
    act(() => result.current.store.getState().actions.setDraft("level:ERROR"));
    act(() => result.current.commit("enter"));

    expect(setFilterState).toHaveBeenCalledWith([
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    expect(recordRecentSearch).not.toHaveBeenCalled();
  });

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
