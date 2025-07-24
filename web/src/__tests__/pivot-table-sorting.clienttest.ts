/**
 * @fileoverview Unit tests for pivot table sorting functionality
 *
 * This test suite covers:
 * - usePivotTableSort hook functionality
 * - Session storage persistence
 * - Sorting algorithms and hierarchical sorting
 * - Validation functions
 * - Error handling and edge cases
 *
 * Test Strategy:
 * - Mock sessionStorage to test persistence
 * - Test various sort state scenarios
 * - Verify hierarchical sorting behavior
 * - Test validation and edge cases
 * - Ensure type safety and validation
 */

import { renderHook, act } from "@testing-library/react";
import { usePivotTableSort } from "@/src/features/widgets/hooks/usePivotTableSort";
import { type OrderByState } from "@langfuse/shared";
import {
  sortPivotTableRows,
  validateSortConfig,
  getNextSortState,
  type PivotTableRow,
} from "@/src/features/widgets/utils/pivot-table-utils";

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

  describe("initialization", () => {
    test("initializes with null when no stored state and no default", () => {
      const { result } = renderHook(() => usePivotTableSort("test-widget"));

      expect(result.current.sortState).toBeNull();
      expect(mockSessionStorage.getItem).toHaveBeenCalledWith(
        "langfuse-pivotTableSort_test-widget",
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

    test("prioritizes stored state over default sort", () => {
      const storedSort: OrderByState = { column: "metric", order: "ASC" };
      const defaultSort: OrderByState = { column: "count", order: "DESC" };
      mockSessionStorage.getItem.mockReturnValue(JSON.stringify(storedSort));

      const { result } = renderHook(() =>
        usePivotTableSort("test-widget", defaultSort),
      );

      expect(result.current.sortState).toEqual(storedSort);
    });
  });

  describe("updateSort", () => {
    test("updates sort state and persists to session storage", () => {
      const { result } = renderHook(() => usePivotTableSort("test-widget"));

      const newSort: OrderByState = { column: "count", order: "ASC" };

      act(() => {
        result.current.updateSort(newSort);
      });

      expect(result.current.sortState).toEqual(newSort);
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "langfuse-pivotTableSort_test-widget",
        JSON.stringify(newSort),
      );
    });

    test("clears sort state when null is passed", () => {
      const { result } = renderHook(() => usePivotTableSort("test-widget"));

      // Set initial sort state
      act(() => {
        result.current.updateSort({ column: "count", order: "ASC" });
      });

      // Clear sort state
      act(() => {
        result.current.updateSort(null);
      });

      expect(result.current.sortState).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
        "langfuse-pivotTableSort_test-widget",
      );
    });
  });

  describe("clearSort", () => {
    test("clears sort state and removes from session storage", () => {
      const { result } = renderHook(() => usePivotTableSort("test-widget"));

      // Set initial sort state
      act(() => {
        result.current.updateSort({ column: "count", order: "ASC" });
      });

      // Clear sort state
      act(() => {
        result.current.clearSort();
      });

      expect(result.current.sortState).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
        "langfuse-pivotTableSort_test-widget",
      );
    });
  });

  describe("resetToDefault", () => {
    test("resets to default sort when available", () => {
      const defaultSort: OrderByState = { column: "count", order: "DESC" };
      const { result } = renderHook(() =>
        usePivotTableSort("test-widget", defaultSort),
      );

      // Change sort state
      act(() => {
        result.current.updateSort({ column: "metric", order: "ASC" });
      });

      // Reset to default
      act(() => {
        result.current.resetToDefault();
      });

      expect(result.current.sortState).toEqual(defaultSort);
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "langfuse-pivotTableSort_test-widget",
        JSON.stringify(defaultSort),
      );
    });

    test("resets to null when no default sort", () => {
      const { result } = renderHook(() => usePivotTableSort("test-widget"));

      // Set initial sort state
      act(() => {
        result.current.updateSort({ column: "count", order: "ASC" });
      });

      // Reset to default (null)
      act(() => {
        result.current.resetToDefault();
      });

      expect(result.current.sortState).toBeNull();
      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith(
        "langfuse-pivotTableSort_test-widget",
      );
    });
  });

  describe("error handling", () => {
    test("handles invalid stored data gracefully", () => {
      mockSessionStorage.getItem.mockReturnValue("invalid-json");

      const { result } = renderHook(() => usePivotTableSort("test-widget"));

      expect(result.current.sortState).toBeNull();
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

      expect(result.current.sortState).toEqual({
        column: "count",
        order: "ASC",
      });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test("handles retrieval errors gracefully", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      mockSessionStorage.getItem.mockImplementation(() => {
        throw new Error("Storage not available");
      });

      const { result } = renderHook(() => usePivotTableSort("test-widget"));

      expect(result.current.sortState).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("widget ID isolation", () => {
    test("uses different storage keys for different widgets", () => {
      const { result: result1 } = renderHook(() =>
        usePivotTableSort("widget-1"),
      );
      const { result: result2 } = renderHook(() =>
        usePivotTableSort("widget-2"),
      );

      act(() => {
        result1.current.updateSort({ column: "count", order: "ASC" });
      });

      act(() => {
        result2.current.updateSort({ column: "metric", order: "DESC" });
      });

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "langfuse-pivotTableSort_widget-1",
        JSON.stringify({ column: "count", order: "ASC" }),
      );

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "langfuse-pivotTableSort_widget-2",
        JSON.stringify({ column: "metric", order: "DESC" }),
      );
    });
  });
});

describe("sortPivotTableRows", () => {
  const createMockRow = (
    type: "data" | "subtotal" | "total",
    label: string,
    values: Record<string, number>,
    level: number = 0,
  ): PivotTableRow => ({
    id: `row-${label}`,
    type,
    level,
    label,
    values,
    isSubtotal: type === "subtotal",
    isTotal: type === "total",
  });

  describe("hierarchical sorting", () => {
    test("sorts groups by total values first", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { count: 200 }),
        createMockRow("subtotal", "Group B", { count: 50 }),
        createMockRow("subtotal", "Group A", { count: 100 }),
        createMockRow("data", "Item 1", { count: 30 }),
        createMockRow("data", "Item 2", { count: 70 }),
      ];

      const sorted = sortPivotTableRows(rows, {
        column: "count",
        order: "DESC",
      });

      // Total should be at top
      expect(sorted[0].label).toBe("Total");
      // Groups should be sorted by total values
      expect(sorted[1].label).toBe("Group A");
      expect(sorted[2].label).toBe("Group B");
    });

    test("sorts items within groups", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { count: 200 }),
        createMockRow("subtotal", "Group A", { count: 100 }),
        createMockRow("data", "Item 2", { count: 30 }),
        createMockRow("data", "Item 1", { count: 70 }),
      ];

      const sorted = sortPivotTableRows(rows, {
        column: "count",
        order: "DESC",
      });

      // Total should be at top
      expect(sorted[0].label).toBe("Total");
      // Group should be next
      expect(sorted[1].label).toBe("Group A");
      // Items should be sorted within group
      expect(sorted[2].label).toBe("Item 1");
      expect(sorted[3].label).toBe("Item 2");
    });

    test("handles ascending sort order", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { count: 200 }),
        createMockRow("subtotal", "Group A", { count: 100 }),
        createMockRow("subtotal", "Group B", { count: 50 }),
        createMockRow("data", "Item 1", { count: 70 }),
        createMockRow("data", "Item 2", { count: 30 }),
      ];

      const sorted = sortPivotTableRows(rows, {
        column: "count",
        order: "ASC",
      });

      // Total should be at top
      expect(sorted[0].label).toBe("Total");
      // Groups should be sorted ascending
      expect(sorted[1].label).toBe("Group B");
      expect(sorted[2].label).toBe("Group A");
    });

    test("handles string values gracefully", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { count: 200 }),
        createMockRow("subtotal", "Group A", { count: 100 }),
        createMockRow("data", "Item 1", { count: "70" as any }),
        createMockRow("data", "Item 2", { count: "30" as any }),
      ];

      const sorted = sortPivotTableRows(rows, {
        column: "count",
        order: "DESC",
      });

      expect(sorted[2].label).toBe("Item 1");
      expect(sorted[3].label).toBe("Item 2");
    });

    test("handles invalid string values gracefully", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { count: 200 }),
        createMockRow("subtotal", "Group A", { count: 100 }),
        createMockRow("data", "Item 1", { count: "invalid" as any }),
        createMockRow("data", "Item 2", { count: 30 }),
      ];

      const sorted = sortPivotTableRows(rows, {
        column: "count",
        order: "DESC",
      });

      expect(sorted[2].label).toBe("Item 2");
      expect(sorted[3].label).toBe("Item 1"); // Invalid value treated as 0
    });

    test("returns original rows when no sort config provided", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { count: 200 }),
        createMockRow("subtotal", "Group A", { count: 100 }),
      ];

      const sorted = sortPivotTableRows(rows, null as any);

      expect(sorted).toEqual(rows);
    });

    test("returns original rows when sort column is empty", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { count: 200 }),
        createMockRow("subtotal", "Group A", { count: 100 }),
      ];

      const sorted = sortPivotTableRows(rows, { column: "", order: "ASC" });

      expect(sorted).toEqual(rows);
    });
  });

  describe("edge cases", () => {
    test("handles empty rows array", () => {
      const sorted = sortPivotTableRows([], { column: "count", order: "ASC" });
      expect(sorted).toEqual([]);
    });

    test("handles rows with missing sort column", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { other: 200 }),
        createMockRow("subtotal", "Group A", { other: 100 }),
      ];

      const sorted = sortPivotTableRows(rows, {
        column: "count",
        order: "ASC",
      });

      // Should sort by 0 (default value for missing column)
      expect(sorted).toEqual(rows);
    });

    test("handles equal values by sorting by label", () => {
      const rows: PivotTableRow[] = [
        createMockRow("total", "Total", { count: 200 }),
        createMockRow("subtotal", "Group B", { count: 100 }),
        createMockRow("subtotal", "Group A", { count: 100 }),
      ];

      const sorted = sortPivotTableRows(rows, {
        column: "count",
        order: "ASC",
      });

      expect(sorted[1].label).toBe("Group A");
      expect(sorted[2].label).toBe("Group B");
    });
  });
});

describe("validateSortConfig", () => {
  const availableColumns = ["count", "metric", "dimension"];

  test("returns true for null sort config", () => {
    expect(validateSortConfig(null, availableColumns)).toBe(true);
  });

  test("returns false for invalid sort config", () => {
    expect(
      validateSortConfig({ column: "", order: "ASC" }, availableColumns),
    ).toBe(false);
    expect(
      validateSortConfig(
        { column: "count", order: "INVALID" as any },
        availableColumns,
      ),
    ).toBe(false);
    expect(
      validateSortConfig({ column: "count" } as any, availableColumns),
    ).toBe(false);
  });

  test("returns false for non-existent column", () => {
    expect(
      validateSortConfig(
        { column: "nonexistent", order: "ASC" },
        availableColumns,
      ),
    ).toBe(false);
  });

  test("returns true for valid sort config", () => {
    expect(
      validateSortConfig({ column: "count", order: "ASC" }, availableColumns),
    ).toBe(true);
    expect(
      validateSortConfig({ column: "count", order: "DESC" }, availableColumns),
    ).toBe(true);
  });
});

describe("getNextSortState", () => {
  test("returns ASC when no current sort", () => {
    const next = getNextSortState(null, "count");
    expect(next).toEqual({ column: "count", order: "ASC" });
  });

  test("returns ASC when different column", () => {
    const next = getNextSortState({ column: "metric", order: "DESC" }, "count");
    expect(next).toEqual({ column: "count", order: "ASC" });
  });

  test("returns DESC when current is ASC", () => {
    const next = getNextSortState({ column: "count", order: "ASC" }, "count");
    expect(next).toEqual({ column: "count", order: "DESC" });
  });

  test("returns null when current is DESC", () => {
    const next = getNextSortState({ column: "count", order: "DESC" }, "count");
    expect(next).toBeNull();
  });
});
