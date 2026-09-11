import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TracingSearchType } from "@langfuse/shared";
import { eventsSearchRegistry } from "../config/eventsSearchRegistry";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";

describe("embedded events search scopes", () => {
  it.each<TracingSearchType[]>([
    ["id"],
    ["id", "input"],
    ["id", "output"],
    ["content"],
  ])(
    "keeps the restored scope %j visible and intact when another facet is edited",
    (...scope) => {
      const setSearchType = vi.fn();
      const setSearchQuery = vi.fn();
      const setFilterState = vi.fn();
      const { result } = renderHook(() =>
        useEventsSearchBar({
          projectId: "p",
          tableName: "observations-events",
          enabled: true,
          registry: eventsSearchRegistry(["sessionId"], true),
          filterState: [],
          searchQuery: "refund",
          searchType: scope,
          observed: undefined,
          setFilterState,
          setSearchQuery,
          setSearchType,
        }),
      );
      const restored = result.current.store.getState().draft.trim();
      expect(restored).toContain("refund");
      act(() =>
        result.current.store
          .getState()
          .actions.setDraft(`${restored} level:ERROR`),
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

  it("changes an embedded payload scope back to its IDs and names default", () => {
    const setSearchType = vi.fn();
    const setSearchQuery = vi.fn();
    const { result } = renderHook(() =>
      useEventsSearchBar({
        tableName: "observations-events",
        enabled: true,
        registry: eventsSearchRegistry(["userId"], true),
        filterState: [],
        searchQuery: "refund",
        searchType: ["content"],
        observed: undefined,
        setFilterState: vi.fn(),
        setSearchQuery,
        setSearchType,
      }),
    );
    act(() => result.current.store.getState().actions.setDraft("refund"));
    act(() => result.current.commit("enter"));
    expect(setSearchType).toHaveBeenCalledWith(["id"]);
    expect(setSearchQuery).toHaveBeenCalledWith("refund");
  });

  it("keeps the full-page grammar's original full-text default", () => {
    const setSearchType = vi.fn();
    const { result } = renderHook(() =>
      useEventsSearchBar({
        projectId: "p",
        tableName: "observations-events",
        enabled: true,
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
