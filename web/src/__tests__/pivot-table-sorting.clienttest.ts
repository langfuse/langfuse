/**
 * @fileoverview Unit tests for simplified pivot table sorting functionality
 *
 * This test suite covers:
 * - usePivotTableSort hook functionality
 * - Session storage persistence
 * - Simple sorting cycle (DESC → ASC → unsorted)
 * - Validation functions
 * - Error handling
 */

import { renderHook, act } from "@testing-library/react";
import { usePivotTableSort } from "@/src/features/widgets/hooks/usePivotTableSort";
import { type OrderByState } from "@langfuse/shared";
import { getNextSortState } from "@/src/features/widgets/utils/pivot-table-utils";

// Mock sessionStorage
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

Object.defineProperty(window, "sessionStorage", {
  value: mockSessionStorage,
  writable: true,
});

describe("usePivotTableSort", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionStorage.getItem.mockReturnValue(null);
  });

  test("initializes with null when no stored state and no default", () => {
    const { result } = renderHook(() => usePivotTableSort("test-widget"));

    expect(result.current.sortState).toBeNull();
    expect(mockSessionStorage.getItem).toHaveBeenCalledWith(
      "langfuse-pivot_sort_test-widget",
    );
  });

  test("initializes with default sort when provided", () => {
    const defaultSort: OrderByState = { column: "count", order: "DESC" };
    const { result } = renderHook(() =>
      usePivotTableSort("test-widget", defaultSort),
    );

    expect(result.current.sortState).toEqual(defaultSort);
  });

  test("initializes with stored state when available", () => {
    const storedSort: OrderByState = { column: "metric", order: "ASC" };
    mockSessionStorage.getItem.mockReturnValue(JSON.stringify(storedSort));

    const { result } = renderHook(() => usePivotTableSort("test-widget"));

    expect(result.current.sortState).toEqual(storedSort);
  });

  test("initializes with stored null state (explicitly unsorted)", () => {
    mockSessionStorage.getItem.mockReturnValue("null");

    const { result } = renderHook(() => usePivotTableSort("test-widget"));

    expect(result.current.sortState).toBeNull();
  });

  test("prioritizes stored state over default sort", () => {
    const storedSort: OrderByState = { column: "metric", order: "ASC" };
    const defaultSort: OrderByState = { column: "count", order: "DESC" };
    mockSessionStorage.getItem.mockReturnValue(JSON.stringify(storedSort));

    const { result } = renderHook(() =>
      usePivotTableSort("test-widget", defaultSort),
    );

    expect(result.current.sortState).toEqual(storedSort);
  });

  test("updates sort state and persists to session storage", () => {
    const { result } = renderHook(() => usePivotTableSort("test-widget"));

    const newSort: OrderByState = { column: "count", order: "ASC" };

    act(() => {
      result.current.updateSort(newSort);
    });

    expect(result.current.sortState).toEqual(newSort);
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
      "langfuse-pivot_sort_test-widget",
      JSON.stringify(newSort),
    );
  });

  test("stores null state when explicitly unsorted", () => {
    const { result } = renderHook(() => usePivotTableSort("test-widget"));

    act(() => {
      result.current.updateSort(null);
    });

    expect(result.current.sortState).toBeNull();
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
      "langfuse-pivot_sort_test-widget",
      "null",
    );
  });

  test("handles storage errors gracefully", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
    mockSessionStorage.setItem.mockImplementation(() => {
      throw new Error("Storage quota exceeded");
    });

    const { result } = renderHook(() => usePivotTableSort("test-widget"));

    act(() => {
      result.current.updateSort({ column: "count", order: "ASC" });
    });

    expect(result.current.sortState).toEqual({ column: "count", order: "ASC" });
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe("getNextSortState", () => {
  test("returns DESC when no current sort", () => {
    const next = getNextSortState(null, "count");
    expect(next).toEqual({ column: "count", order: "DESC" });
  });

  test("returns DESC when different column", () => {
    const next = getNextSortState({ column: "metric", order: "ASC" }, "count");
    expect(next).toEqual({ column: "count", order: "DESC" });
  });

  test("returns ASC when current is DESC", () => {
    const next = getNextSortState({ column: "count", order: "DESC" }, "count");
    expect(next).toEqual({ column: "count", order: "ASC" });
  });

  test("returns null when current is ASC", () => {
    const next = getNextSortState({ column: "count", order: "ASC" }, "count");
    expect(next).toBeNull();
  });
});
