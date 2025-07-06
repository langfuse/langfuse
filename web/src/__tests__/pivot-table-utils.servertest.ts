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
    { model: "gpt-3.5", user: "alice", count: 20, avg_cost: 0.2 },
    { model: "gpt-3.5", user: "bob", count: 25, avg_cost: 0.4 },
    { model: "claude", user: "alice", count: 5, avg_cost: 0.8 },
  ];

  const sampleMetrics = ["count", "avg_cost"];

  describe("validatePivotTableConfig", () => {
    it("should pass validation for valid configurations", () => {
      const validConfig: PivotTableConfig = {
        dimensions: ["model"],
        metrics: ["count"],
        rowLimit: 20,
      };

      expect(() => validatePivotTableConfig(validConfig)).not.toThrow();
    });

    it("should pass validation for valid dimension counts", () => {
      const configWithNoDimensions: PivotTableConfig = {
        dimensions: [],
        metrics: ["count"],
      };
      const configWithOneDimension: PivotTableConfig = {
        dimensions: ["dim1"],
        metrics: ["count"],
      };
      const configWithTwoDimensions: PivotTableConfig = {
        dimensions: ["dim1", "dim2"],
        metrics: ["count"],
      };

      expect(() =>
        validatePivotTableConfig(configWithNoDimensions),
      ).not.toThrow();
      expect(() =>
        validatePivotTableConfig(configWithOneDimension),
      ).not.toThrow();
      expect(() =>
        validatePivotTableConfig(configWithTwoDimensions),
      ).not.toThrow();
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

    it("should throw error when dimension count exceeds maximum", () => {
      const tooManyDimensions = Array.from(
        { length: MAX_PIVOT_TABLE_DIMENSIONS + 1 },
        (_, i) => `dim${i + 1}`,
      );

      const invalidConfig: PivotTableConfig = {
        dimensions: tooManyDimensions,
        metrics: ["count"],
      };

      expect(() => validatePivotTableConfig(invalidConfig)).toThrow(
        `Cannot create pivot table with ${MAX_PIVOT_TABLE_DIMENSIONS + 1} dimensions. ` +
          `Maximum supported dimensions: ${MAX_PIVOT_TABLE_DIMENSIONS}`,
      );
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
        { count: 20, avg_cost: 0.4 },
      ];

      const result = calculateSubtotals(data, ["count", "avg_cost"]);

      expect(result).toEqual({
        count: 45,
        avg_cost: 0.5,
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
        avg_cost: 0.3,
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
        avg_cost: 0.5, // (0.5 + 0.6 + 0.2 + 0.4 + 0.8) / 5
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
          avg_cost: 0.5,
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

        // Should have: 1 grand total + 5 data rows = 6 rows (no subtotals for single dimension)
        expect(result).toHaveLength(6);

        // Check grand total is first
        expect(result[0]).toMatchObject({
          type: "total",
          level: 0,
          label: "Total",
          isTotal: true,
        });

        // Check structure: data rows after total, no subtotals for single dimension
        expect(result[1]).toMatchObject({
          type: "data",
          level: 0,
          label: "claude",
        });
      });

      it("should apply row limit correctly", () => {
        const config: PivotTableConfig = {
          dimensions: ["model"],
          metrics: sampleMetrics,
          rowLimit: 2, // Limit to 2 data rows
        };

        const result = transformToPivotTable(sampleData, config);

        // Should have: 1 grand total + 2 data rows = 3 rows (no subtotals for single dimension)
        expect(result).toHaveLength(3);

        // Verify grand total is first, then only 2 data rows are included
        expect(result[0].type).toBe("total");
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

        // Should have grand total, subtotals for first dimension, and data rows
        expect(result.length).toBeGreaterThan(5);

        // Check for proper nesting levels
        const dataRows = result.filter((row) => row.type === "data");
        const subtotalRows = result.filter((row) => row.type === "subtotal");
        const totalRows = result.filter((row) => row.type === "total");

        expect(dataRows.length).toBeGreaterThan(0);
        expect(subtotalRows.length).toBeGreaterThan(0);
        expect(totalRows).toHaveLength(1);

        // Check that grand total is first
        expect(result[0].type).toBe("total");

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
        expect(result[0].type).toBe("total");
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

        // Should still have grand total at the top
        expect(result[0].type).toBe("total");
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

  describe("multiple metrics and aggregation functions", () => {
    // Test data with various aggregation types
    const multiMetricData: DatabaseRow[] = [
      {
        environment: "production",
        model: "gpt-4",
        count_requests: 100,
        sum_tokens: 5000,
        avg_latency: 120,
        min_cost: 0.05,
        max_cost: 0.15,
        p95_duration: 250,
      },
      {
        environment: "production",
        model: "gpt-3.5",
        count_requests: 200,
        sum_tokens: 8000,
        avg_latency: 80,
        min_cost: 0.02,
        max_cost: 0.08,
        p95_duration: 150,
      },
      {
        environment: "staging",
        model: "gpt-4",
        count_requests: 50,
        sum_tokens: 2500,
        avg_latency: 140,
        min_cost: 0.06,
        max_cost: 0.18,
        p95_duration: 300,
      },
    ];

    const multiMetrics = [
      "count_requests",
      "sum_tokens",
      "avg_latency",
      "min_cost",
      "max_cost",
      "p95_duration",
    ];

    describe("aggregation type detection and calculation", () => {
      it("should correctly aggregate multiple metrics with different aggregation types", () => {
        const config: PivotTableConfig = {
          dimensions: ["environment"],
          metrics: multiMetrics,
        };

        const result = transformToPivotTable(multiMetricData, config);

        // Find the grand total row
        const totalRow = result.find((row) => row.type === "total");
        expect(totalRow).toBeDefined();

        if (totalRow) {
          // Count should be summed: 100 + 200 + 50 = 350
          expect(totalRow.values.count_requests).toBe(350);

          // Sum should be summed: 5000 + 8000 + 2500 = 15500
          expect(totalRow.values.sum_tokens).toBe(15500);

          // Average should be averaged: (120 + 80 + 140) / 3 = 113.33...
          expect(totalRow.values.avg_latency).toBeCloseTo(113.33, 2);

          // Min should be minimum: min(0.05, 0.02, 0.06) = 0.02
          expect(totalRow.values.min_cost).toBe(0.02);

          // Max should be maximum: max(0.15, 0.08, 0.18) = 0.18
          expect(totalRow.values.max_cost).toBe(0.18);

          // Percentile should be averaged: (250 + 150 + 300) / 3 = 233.33...
          expect(totalRow.values.p95_duration).toBeCloseTo(233.33, 2);
        }
      });

      it("should correctly calculate subtotals with different aggregation types", () => {
        const config: PivotTableConfig = {
          dimensions: ["environment"],
          metrics: multiMetrics,
        };

        const result = transformToPivotTable(multiMetricData, config);

        // Since this is single dimension, there should be data rows and a total
        const dataRows = result.filter((row) => row.type === "data");
        const productionDataRows = dataRows.filter(
          (row) =>
            row.label.includes("production") ||
            (row.dimensionValues &&
              row.dimensionValues.environment === "production"),
        );

        // There should be 2 production data rows
        expect(productionDataRows.length).toBeGreaterThan(0);

        // Check total row calculations include production data correctly
        const totalRow = result.find((row) => row.type === "total");
        expect(totalRow).toBeDefined();

        if (totalRow) {
          // Production contributes: count=300, sum=13000, avg=(120+80)/2=100
          // Staging contributes: count=50, sum=2500, avg=140
          // Total should be: count=350, sum=15500, avg=(100+140)/2=120 (weighted by count would be different)
          expect(totalRow.values.count_requests).toBe(350);
          expect(totalRow.values.sum_tokens).toBe(15500);
        }
      });

      it("should handle mixed numeric and string values correctly", () => {
        const mixedData: DatabaseRow[] = [
          {
            environment: "prod",
            count_requests: "100", // String value
            avg_latency: 120.5, // Numeric value
            sum_tokens: "5000", // String value
          },
          {
            environment: "prod",
            count_requests: 200, // Numeric value
            avg_latency: "80.2", // String value
            sum_tokens: 8000, // Numeric value
          },
        ];

        const config: PivotTableConfig = {
          dimensions: ["environment"],
          metrics: ["count_requests", "avg_latency", "sum_tokens"],
        };

        const result = transformToPivotTable(mixedData, config);
        const totalRow = result.find((row) => row.type === "total");

        expect(totalRow).toBeDefined();
        if (totalRow) {
          // Count: 100 + 200 = 300 (strings parsed correctly)
          expect(totalRow.values.count_requests).toBe(300);

          // Average: (120.5 + 80.2) / 2 = 100.35
          expect(totalRow.values.avg_latency).toBeCloseTo(100.35, 2);

          // Sum: 5000 + 8000 = 13000 (strings parsed correctly)
          expect(totalRow.values.sum_tokens).toBe(13000);
        }
      });

      it("should handle edge cases for different aggregation types", () => {
        const edgeCaseData: DatabaseRow[] = [
          {
            category: "A",
            count_items: 0,
            avg_score: 0,
            min_value: 100,
            max_value: 100,
          },
        ];

        const config: PivotTableConfig = {
          dimensions: ["category"],
          metrics: ["count_items", "avg_score", "min_value", "max_value"],
        };

        const result = transformToPivotTable(edgeCaseData, config);
        const totalRow = result.find((row) => row.type === "total");

        expect(totalRow).toBeDefined();
        if (totalRow) {
          expect(totalRow.values.count_items).toBe(0);
          expect(totalRow.values.avg_score).toBe(0);
          expect(totalRow.values.min_value).toBe(100);
          expect(totalRow.values.max_value).toBe(100);
        }
      });

      it("should handle empty arrays for aggregation functions", () => {
        const config: PivotTableConfig = {
          dimensions: ["nonexistent"],
          metrics: ["count_requests", "avg_latency"],
        };

        const result = transformToPivotTable([], config);

        expect(result).toHaveLength(1);
        const totalRow = result[0];
        expect(totalRow.type).toBe("total");
        expect(totalRow.values.count_requests).toBe(0);
        expect(totalRow.values.avg_latency).toBe(0);
      });
    });

    describe("complex multi-dimensional scenarios with multiple metrics", () => {
      it("should handle two dimensions with multiple aggregation types", () => {
        const config: PivotTableConfig = {
          dimensions: ["environment", "model"],
          metrics: multiMetrics,
        };

        const result = transformToPivotTable(multiMetricData, config);

        // Should have grand total, subtotals, and data rows
        const dataRows = result.filter((row) => row.type === "data");
        const subtotalRows = result.filter((row) => row.type === "subtotal");
        const totalRow = result.find((row) => row.type === "total");

        expect(dataRows.length).toBe(3); // 3 data points
        expect(subtotalRows.length).toBeGreaterThan(0); // Environment subtotals
        expect(totalRow).toBeDefined();

        // Check that grand total is first
        expect(result[0].type).toBe("total");

        // Check that subtotals correctly aggregate their children
        const productionSubtotal = subtotalRows.find((row) =>
          row.label.includes("production"),
        );

        if (productionSubtotal) {
          // Production has 2 models: gpt-4 (100 requests) + gpt-3.5 (200 requests) = 300
          expect(productionSubtotal.values.count_requests).toBe(300);

          // Production tokens: 5000 + 8000 = 13000
          expect(productionSubtotal.values.sum_tokens).toBe(13000);

          // Production avg latency: (120 + 80) / 2 = 100
          expect(productionSubtotal.values.avg_latency).toBe(100);

          // Production min cost: min(0.05, 0.02) = 0.02
          expect(productionSubtotal.values.min_cost).toBe(0.02);

          // Production max cost: max(0.15, 0.08) = 0.15
          expect(productionSubtotal.values.max_cost).toBe(0.15);
        }
      });

      it("should validate metric field name patterns", () => {
        const testCases = [
          { metric: "count_requests", expectedType: "count" },
          { metric: "sum_tokens", expectedType: "sum" },
          { metric: "avg_latency", expectedType: "avg" },
          { metric: "average_score", expectedType: "avg" },
          { metric: "min_cost", expectedType: "min" },
          { metric: "max_duration", expectedType: "max" },
          { metric: "p95_latency", expectedType: "percentile" },
          { metric: "p99_duration", expectedType: "percentile" },
          { metric: "p50_response", expectedType: "percentile" },
          { metric: "unknown_metric", expectedType: "sum" }, // defaults to sum
        ];

        // Test each pattern by creating data and checking the results
        testCases.forEach(({ metric, expectedType }) => {
          const testData: DatabaseRow[] = [
            { category: "A", [metric]: 10 },
            { category: "A", [metric]: 20 },
          ];

          const config: PivotTableConfig = {
            dimensions: ["category"],
            metrics: [metric],
          };

          const result = transformToPivotTable(testData, config);
          const totalRow = result.find((row) => row.type === "total");

          expect(totalRow).toBeDefined();
          if (totalRow) {
            const value = totalRow.values[metric];

            switch (expectedType) {
              case "count":
              case "sum":
                expect(value).toBe(30); // 10 + 20
                break;
              case "avg":
              case "percentile":
                expect(value).toBe(15); // (10 + 20) / 2
                break;
              case "min":
                expect(value).toBe(10); // min(10, 20)
                break;
              case "max":
                expect(value).toBe(20); // max(10, 20)
                break;
            }
          }
        });
      });

      it("should maintain precision in floating point calculations", () => {
        const precisionData: DatabaseRow[] = [
          { env: "test", avg_value: 0.1 },
          { env: "test", avg_value: 0.2 },
          { env: "test", avg_value: 0.3 },
        ];

        const config: PivotTableConfig = {
          dimensions: ["env"],
          metrics: ["avg_value"],
        };

        const result = transformToPivotTable(precisionData, config);
        const totalRow = result.find((row) => row.type === "total");

        expect(totalRow).toBeDefined();
        if (totalRow) {
          // Should be (0.1 + 0.2 + 0.3) / 3 = 0.2, properly rounded
          expect(totalRow.values.avg_value).toBeCloseTo(0.2, 10);
        }
      });
    });
  });
});
