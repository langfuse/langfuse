/**
 * @fileoverview Unit tests for pivot table data transformation utilities
 *
 * This test suite comprehensively tests the pivot table utility functions,
 * covering various dimension scenarios, edge cases, and configuration validation.
 *
 * Test Coverage:
 * - transformToPivotTable function with 0-N dimensions
 * - Configuration validation and error handling
 * - Helper functions for row generation and calculation
 * - MAX_DIMENSIONS constraint validation
 * - Edge cases with empty data, null values, and malformed input
 */

import {
  transformToPivotTable,
  validateDimensionCount,
  validatePivotTableConfig,
  generateRowId,
  createEmptyMetricValues,
  extractDimensionValues,
  extractMetricValues,
  isDataRow,
  isSubtotalRow,
  isTotalRow,
  groupDataByDimension,
  calculateSubtotals,
  calculateGrandTotals,
  createSubtotalRow,
  createGrandTotalRow,
  type PivotTableConfig,
  type DatabaseRow,
  type PivotTableRow,
} from "@/src/features/widgets/utils/pivot-table-utils";

describe("pivot-table-utils", () => {
  const MAX_PIVOT_TABLE_DIMENSIONS = 2;
  // Sample test data
  const sampleData: DatabaseRow[] = [
    { model: "gpt-4", user: "alice", count: 10, avg_cost: 0.5 },
    { model: "gpt-4", user: "bob", count: 15, avg_cost: 0.6 },
    { model: "gpt-3.5", user: "alice", count: 20, avg_cost: 0.3 },
    { model: "gpt-3.5", user: "bob", count: 25, avg_cost: 0.4 },
    { model: "claude", user: "alice", count: 5, avg_cost: 0.8 },
  ];

  const sampleMetrics = ["count", "avg_cost"];

  describe("validateDimensionCount", () => {
    it("should pass validation for valid dimension counts", () => {
      expect(() => validateDimensionCount([])).not.toThrow();
      expect(() => validateDimensionCount(["dim1"])).not.toThrow();
      expect(() => validateDimensionCount(["dim1", "dim2"])).not.toThrow();
    });

    it("should throw error when dimension count exceeds maximum", () => {
      const tooManyDimensions = Array.from(
        { length: MAX_PIVOT_TABLE_DIMENSIONS + 1 },
        (_, i) => `dim${i + 1}`,
      );

      expect(() => validateDimensionCount(tooManyDimensions)).toThrow(
        `Cannot create pivot table with ${MAX_PIVOT_TABLE_DIMENSIONS + 1} dimensions. ` +
          `Maximum supported dimensions: ${MAX_PIVOT_TABLE_DIMENSIONS}`,
      );
    });
  });

  describe("validatePivotTableConfig", () => {
    it("should pass validation for valid configurations", () => {
      const validConfig: PivotTableConfig = {
        dimensions: ["model"],
        metrics: ["count"],
        rowLimit: 20,
      };

      expect(() => validatePivotTableConfig(validConfig)).not.toThrow();
    });

    it("should throw error for empty metrics", () => {
      const invalidConfig: PivotTableConfig = {
        dimensions: ["model"],
        metrics: [],
      };

      expect(() => validatePivotTableConfig(invalidConfig)).toThrow(
        "At least one metric is required for pivot table",
      );
    });

    it("should throw error for invalid row limit", () => {
      const invalidConfig: PivotTableConfig = {
        dimensions: ["model"],
        metrics: ["count"],
        rowLimit: 0,
      };

      expect(() => validatePivotTableConfig(invalidConfig)).toThrow(
        "Row limit must be a positive number",
      );
    });

    it("should throw error for too many dimensions", () => {
      const invalidConfig: PivotTableConfig = {
        dimensions: Array.from(
          { length: MAX_PIVOT_TABLE_DIMENSIONS + 1 },
          (_, i) => `dim${i + 1}`,
        ),
        metrics: ["count"],
      };

      expect(() => validatePivotTableConfig(invalidConfig)).toThrow();
    });
  });

  describe("generateRowId", () => {
    it("should generate consistent IDs for same inputs", () => {
      const dimensionValues = { model: "gpt-4", user: "alice" };
      const id1 = generateRowId(dimensionValues, "data", 0);
      const id2 = generateRowId(dimensionValues, "data", 0);

      expect(id1).toBe(id2);
      expect(id1).toContain("data-0");
    });

    it("should generate different IDs for different inputs", () => {
      const dimensionValues1 = { model: "gpt-4" };
      const dimensionValues2 = { model: "gpt-3.5" };

      const id1 = generateRowId(dimensionValues1, "data", 0);
      const id2 = generateRowId(dimensionValues2, "data", 0);

      expect(id1).not.toBe(id2);
    });

    it("should include type and level in ID", () => {
      const dimensionValues = { model: "gpt-4" };

      const dataId = generateRowId(dimensionValues, "data", 0);
      const subtotalId = generateRowId(dimensionValues, "subtotal", 1);
      const totalId = generateRowId(dimensionValues, "total", 0);

      expect(dataId).toContain("data-0");
      expect(subtotalId).toContain("subtotal-1");
      expect(totalId).toContain("total-0");
    });
  });

  describe("createEmptyMetricValues", () => {
    it("should create object with all metrics set to 0", () => {
      const metrics = ["count", "avg_cost", "total_tokens"];
      const result = createEmptyMetricValues(metrics);

      expect(result).toEqual({
        count: 0,
        avg_cost: 0,
        total_tokens: 0,
      });
    });

    it("should handle empty metrics array", () => {
      const result = createEmptyMetricValues([]);
      expect(result).toEqual({});
    });
  });

  describe("extractDimensionValues", () => {
    it("should extract specified dimension values from row", () => {
      const row: DatabaseRow = {
        model: "gpt-4",
        user: "alice",
        count: 10,
        avg_cost: 0.5,
      };

      const result = extractDimensionValues(row, ["model", "user"]);

      expect(result).toEqual({
        model: "gpt-4",
        user: "alice",
      });
    });

    it("should handle missing dimension values", () => {
      const row: DatabaseRow = {
        model: "gpt-4",
        count: 10,
      };

      const result = extractDimensionValues(row, ["model", "missing"]);

      expect(result).toEqual({
        model: "gpt-4",
        missing: "",
      });
    });

    it("should return empty object for empty dimensions", () => {
      const row: DatabaseRow = { model: "gpt-4", count: 10 };
      const result = extractDimensionValues(row, []);

      expect(result).toEqual({});
    });
  });

  describe("extractMetricValues", () => {
    it("should extract specified metric values from row", () => {
      const row: DatabaseRow = {
        model: "gpt-4",
        count: 10,
        avg_cost: 0.5,
        total_tokens: 1000,
      };

      const result = extractMetricValues(row, ["count", "avg_cost"]);

      expect(result).toEqual({
        count: 10,
        avg_cost: 0.5,
      });
    });

    it("should handle missing metric values", () => {
      const row: DatabaseRow = {
        model: "gpt-4",
        count: 10,
      };

      const result = extractMetricValues(row, ["count", "missing"]);

      expect(result).toEqual({
        count: 10,
        missing: 0,
      });
    });

    it("should handle non-numeric values", () => {
      const row: DatabaseRow = {
        model: "gpt-4",
        count: "invalid",
        avg_cost: null,
      };

      const result = extractMetricValues(row, ["count", "avg_cost"]);

      expect(result).toEqual({
        count: 0,
        avg_cost: 0,
      });
    });
  });

  describe("row type helpers", () => {
    const dataRow: PivotTableRow = {
      id: "test-data",
      type: "data",
      level: 0,
      label: "Test",
      values: { count: 10 },
    };

    const subtotalRow: PivotTableRow = {
      id: "test-subtotal",
      type: "subtotal",
      level: 0,
      label: "Subtotal",
      values: { count: 20 },
      isSubtotal: true,
    };

    const totalRow: PivotTableRow = {
      id: "test-total",
      type: "total",
      level: 0,
      label: "Total",
      values: { count: 30 },
      isTotal: true,
    };

    describe("isDataRow", () => {
      it("should correctly identify data rows", () => {
        expect(isDataRow(dataRow)).toBe(true);
        expect(isDataRow(subtotalRow)).toBe(false);
        expect(isDataRow(totalRow)).toBe(false);
      });
    });

    describe("isSubtotalRow", () => {
      it("should correctly identify subtotal rows", () => {
        expect(isSubtotalRow(dataRow)).toBe(false);
        expect(isSubtotalRow(subtotalRow)).toBe(true);
        expect(isSubtotalRow(totalRow)).toBe(false);
      });
    });

    describe("isTotalRow", () => {
      it("should correctly identify total rows", () => {
        expect(isTotalRow(dataRow)).toBe(false);
        expect(isTotalRow(subtotalRow)).toBe(false);
        expect(isTotalRow(totalRow)).toBe(true);
      });
    });
  });

  describe("groupDataByDimension", () => {
    it("should group data by specified dimension", () => {
      const result = groupDataByDimension(sampleData, "model");

      expect(Object.keys(result)).toEqual(["gpt-4", "gpt-3.5", "claude"]);
      expect(result["gpt-4"]).toHaveLength(2);
      expect(result["gpt-3.5"]).toHaveLength(2);
      expect(result["claude"]).toHaveLength(1);
    });

    it("should handle missing dimension values", () => {
      const dataWithMissing: DatabaseRow[] = [
        { model: "gpt-4", count: 10 },
        { count: 15 }, // missing model
        { model: "gpt-3.5", count: 20 },
      ];

      const result = groupDataByDimension(dataWithMissing, "model");

      expect(Object.keys(result).sort()).toEqual(["gpt-3.5", "gpt-4", "n/a"]);
      expect(result["n/a"]).toHaveLength(1);
    });

    it("should handle empty data", () => {
      const result = groupDataByDimension([], "model");
      expect(result).toEqual({});
    });
  });

  describe("calculateSubtotals", () => {
    it("should calculate subtotals for numeric metrics", () => {
      const data: DatabaseRow[] = [
        { count: 10, avg_cost: 0.5 },
        { count: 15, avg_cost: 0.6 },
        { count: 20, avg_cost: 0.3 },
      ];

      const result = calculateSubtotals(data, ["count", "avg_cost"]);

      expect(result).toEqual({
        count: 45,
        avg_cost: 1.4,
      });
    });

    it("should handle missing values", () => {
      const data: DatabaseRow[] = [
        { count: 10 },
        { count: 15, avg_cost: 0.6 },
        { avg_cost: 0.3 },
      ];

      const result = calculateSubtotals(data, ["count", "avg_cost"]);

      expect(result).toEqual({
        count: 25,
        avg_cost: 0.9,
      });
    });

    it("should handle empty data", () => {
      const result = calculateSubtotals([], ["count", "avg_cost"]);

      expect(result).toEqual({
        count: 0,
        avg_cost: 0,
      });
    });
  });

  describe("calculateGrandTotals", () => {
    it("should calculate grand totals for all data", () => {
      const result = calculateGrandTotals(sampleData, sampleMetrics);

      expect(result).toEqual({
        count: 75, // 10 + 15 + 20 + 25 + 5
        avg_cost: 2.6, // 0.5 + 0.6 + 0.3 + 0.4 + 0.8
      });
    });

    it("should handle empty data", () => {
      const result = calculateGrandTotals([], sampleMetrics);

      expect(result).toEqual({
        count: 0,
        avg_cost: 0,
      });
    });
  });

  describe("createSubtotalRow", () => {
    it("should create properly formatted subtotal row", () => {
      const subtotalValues = { count: 25, avg_cost: 1.1 };
      const result = createSubtotalRow("gpt-4", subtotalValues, 0);

      expect(result).toEqual({
        id: "subtotal-0-subtotal:gpt-4",
        type: "subtotal",
        level: 0,
        label: "gpt-4 (Subtotal)",
        values: subtotalValues,
        isSubtotal: true,
        dimensionValues: { subtotal: "gpt-4" },
      });
    });
  });

  describe("createGrandTotalRow", () => {
    it("should create properly formatted grand total row", () => {
      const metrics = ["count", "avg_cost"];
      const grandTotalValues = { count: 75, avg_cost: 2.6 };
      const result = createGrandTotalRow(metrics, grandTotalValues);

      expect(result).toEqual({
        id: "total-0-total:grand",
        type: "total",
        level: 0,
        label: "Total",
        values: grandTotalValues,
        isTotal: true,
        dimensionValues: { total: "grand" },
      });
    });
  });

  describe("transformToPivotTable", () => {
    describe("zero dimensions (summary table)", () => {
      it("should create single total row when no dimensions specified", () => {
        const config: PivotTableConfig = {
          dimensions: [],
          metrics: sampleMetrics,
        };

        const result = transformToPivotTable(sampleData, config);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "total",
          level: 0,
          label: "Total",
          isTotal: true,
        });
        expect(result[0].values).toEqual({
          count: 75,
          avg_cost: 2.6,
        });
      });

      it("should handle empty data with zero dimensions", () => {
        const config: PivotTableConfig = {
          dimensions: [],
          metrics: sampleMetrics,
        };

        const result = transformToPivotTable([], config);

        expect(result).toHaveLength(1);
        expect(result[0].values).toEqual({
          count: 0,
          avg_cost: 0,
        });
      });
    });

    describe("single dimension grouping", () => {
      it("should create grouped table with subtotals and grand total", () => {
        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: sampleMetrics,
          rowLimit: 20,
        };

        const result = transformToPivotTable(sampleData, config);

        // Should have: 5 data rows + 1 grand total = 6 rows (no subtotals for single dimension)
        expect(result).toHaveLength(6);

        // Check structure: data rows only, no subtotals for single dimension
        expect(result[0]).toMatchObject({
          type: "data",
          level: 0,
          label: "claude",
        });

        // Check grand total is last
        expect(result[result.length - 1]).toMatchObject({
          type: "total",
          level: 0,
          label: "Total",
          isTotal: true,
        });
      });

      it("should apply row limit correctly", () => {
        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: sampleMetrics,
          rowLimit: 2, // Limit to 2 data rows
        };

        const result = transformToPivotTable(sampleData, config);

        // Should have: 2 data rows + 1 grand total = 3 rows (no subtotals for single dimension)
        expect(result).toHaveLength(3);

        // Verify only first 2 data rows are included
        const dataRows = result.filter((row) => row.type === "data");
        expect(dataRows).toHaveLength(2);
      });
    });

    describe("two-dimension grouping", () => {
      it("should create nested table with proper indentation and subtotals", () => {
        const config: PivotTableConfig = {
          dimensions: ["model", "user"],
          metrics: sampleMetrics,
          rowLimit: 20,
        };

        const result = transformToPivotTable(sampleData, config);

        // Should have data rows, subtotals for first dimension, and grand total
        expect(result.length).toBeGreaterThan(5);

        // Check for proper nesting levels
        const dataRows = result.filter((row) => row.type === "data");
        const subtotalRows = result.filter((row) => row.type === "subtotal");
        const totalRows = result.filter((row) => row.type === "total");

        expect(dataRows.length).toBeGreaterThan(0);
        expect(subtotalRows.length).toBeGreaterThan(0);
        expect(totalRows).toHaveLength(1);

        // Check indentation levels
        expect(dataRows.some((row) => row.level === 1)).toBe(true); // Second dimension should be indented at level 1
        expect(subtotalRows.every((row) => row.level === 0)).toBe(true); // Subtotals at first level (level 0)
      });

      it("should handle missing values in second dimension", () => {
        const dataWithMissing: DatabaseRow[] = [
          { model: "gpt-4", user: "alice", count: 10, avg_cost: 0.5 },
          { model: "gpt-4", count: 15, avg_cost: 0.6 }, // missing user
          { model: "gpt-3.5", user: "bob", count: 20, avg_cost: 0.3 },
        ];

        const config: PivotTableConfig = {
          dimensions: ["model", "user"],
          metrics: sampleMetrics,
          rowLimit: 20,
        };

        const result = transformToPivotTable(dataWithMissing, config);

        // Should handle missing values gracefully
        expect(result.length).toBeGreaterThan(0);
        expect(result.some((row) => row.label.includes("n/a"))).toBe(true);
      });
    });

    describe("edge cases and error handling", () => {
      it("should handle empty data gracefully", () => {
        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: sampleMetrics,
        };

        const result = transformToPivotTable([], config);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: "total",
          level: 0,
          label: "Total",
          values: { count: 0, avg_cost: 0 },
        });
      });

      it("should handle data with all null values", () => {
        const nullData: DatabaseRow[] = [
          { model: null, user: null, count: null, avg_cost: null },
          { model: null, user: null, count: null, avg_cost: null },
        ];

        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: sampleMetrics,
        };

        const result = transformToPivotTable(nullData, config);

        expect(result.length).toBeGreaterThan(0);
        expect(result[result.length - 1].type).toBe("total");
      });

      it("should validate configuration before processing", () => {
        const invalidConfig: PivotTableConfig = {
          dimensions: Array.from(
            { length: MAX_PIVOT_TABLE_DIMENSIONS + 1 },
            (_, i) => `dim${i + 1}`,
          ),
          metrics: [],
        };

        expect(() =>
          transformToPivotTable(sampleData, invalidConfig),
        ).toThrow();
      });

      it("should use default row limit when not specified", () => {
        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: sampleMetrics,
          // No rowLimit specified
        };

        // This should not throw an error and should use DEFAULT_ROW_LIMIT
        expect(() => transformToPivotTable(sampleData, config)).not.toThrow();
      });

      it("should handle very large datasets with row limiting", () => {
        // Create a large dataset
        const largeData: DatabaseRow[] = Array.from(
          { length: 100 },
          (_, i) => ({
            model: `model-${i % 10}`,
            user: `user-${i % 5}`,
            count: i + 1,
            avg_cost: (i + 1) * 0.1,
          }),
        );

        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: sampleMetrics,
          rowLimit: 5,
        };

        const result = transformToPivotTable(largeData, config);

        // Should limit data rows but still include totals
        const dataRows = result.filter((row) => row.type === "data");
        expect(dataRows.length).toBeLessThanOrEqual(5);

        // Should still have grand total
        expect(result[result.length - 1].type).toBe("total");
      });
    });

    describe("configuration edge cases", () => {
      it("should handle single metric", () => {
        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: ["count"],
        };

        const result = transformToPivotTable(sampleData, config);

        expect(result.length).toBeGreaterThan(0);
        expect(Object.keys(result[0].values)).toEqual(["count"]);
      });

      it("should handle many metrics", () => {
        const manyMetrics = [
          "count",
          "avg_cost",
          "total_tokens",
          "avg_latency",
        ];
        const dataWithManyMetrics: DatabaseRow[] = sampleData.map((row) => ({
          ...row,
          total_tokens: 1000,
          avg_latency: 0.5,
        }));

        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: manyMetrics,
        };

        const result = transformToPivotTable(dataWithManyMetrics, config);

        expect(result.length).toBeGreaterThan(0);
        expect(Object.keys(result[0].values)).toEqual(manyMetrics);
      });
    });
  });
});
