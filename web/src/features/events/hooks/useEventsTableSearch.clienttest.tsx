import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TracingSearchType } from "@langfuse/shared";
import { eventsSearchRegistry } from "../config/eventsSearchRegistry";
import { useEventsTableSearch } from "./useEventsTableSearch";

describe("embedded events search scopes", () => {
  it.each<TracingSearchType[]>([
    ["id"],
    ["id", "input"],
    ["id", "output"],
    ["content"],
  ])(
    "keeps the host scope %j when a phrase or another facet is edited",
    (...scope) => {
      const setSearchType = vi.fn();
      const setSearchQuery = vi.fn();
      const setFilterState = vi.fn();
      const { result } = renderHook(() =>
        useEventsTableSearch({
          projectId: "p",
          tableName: "observations-events",
          enabled: true,
          useHostSearchScopes: true,
          registry: eventsSearchRegistry(["sessionId"]),
          filterState: [],
          searchQuery: "refund",
          searchType: scope,
          observed: undefined,
          setFilterState,
          setSearchQuery,
          setSearchType,
        }),
      );
      expect(result.current.store.getState().draft).toBe("refund ");
      act(() =>
        result.current.store.getState().actions.setDraft("refund level:ERROR"),
      );
      act(() => result.current.commit("enter"));
      expect(setSearchType).not.toHaveBeenCalled();
      expect(setSearchQuery).toHaveBeenCalledWith("refund");
      expect(setFilterState).toHaveBeenCalledWith([
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR"],
        },
      ]);
    },
  );

  it("keeps the full-page grammar's original full-text default", () => {
    const setSearchType = vi.fn();
    const { result } = renderHook(() =>
      useEventsTableSearch({
        projectId: "p",
        tableName: "observations-events",
        enabled: true,
        useHostSearchScopes: false,
        registry: eventsSearchRegistry([]),
        filterState: [],
        searchQuery: null,
        searchType: ["id"],
        observed: undefined,
        setFilterState: vi.fn(),
        setSearchQuery: vi.fn(),
        setSearchType,
      }),
    );
    act(() => result.current.store.getState().actions.setDraft("refund"));
    act(() => result.current.commit("enter"));
    expect(setSearchType).toHaveBeenCalledWith(["id", "content"]);
  });
});
