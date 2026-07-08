import {
  generateNumericHeatmapData,
  generateConfusionMatrixData,
  fillMissingBins,
} from "@/src/features/score-analytics/lib/heatmap-utils";

describe("heatmap-utils", () => {
  describe("generateNumericHeatmapData", () => {
    it("should generate correct cell data for a single bin", () => {
      const input = {
        data: [
          { bin_x: 0, bin_y: 0, count: 45, min1: 0, max1: 1, min2: 0, max2: 1 },
        ],
        nBins: 10,
      };

      const result = generateNumericHeatmapData(input);

      expect(result.cells).toHaveLength(1);
      expect(result.cells[0].row).toBe(0);
      expect(result.cells[0].col).toBe(0);
      expect(result.cells[0].value).toBe(45);
      // Division point labels: nBins + 1 (11 labels for 10 bins)
      expect(result.rowLabels).toHaveLength(11);
      expect(result.colLabels).toHaveLength(11);
    });

    it("should generate correct labels for numeric bins", () => {
      const input = {
        data: [
          { bin_x: 0, bin_y: 0, count: 10, min1: 0, max1: 1, min2: 0, max2: 1 },
        ],
        nBins: 10,
      };

      const result = generateNumericHeatmapData(input);

      // Labels are division points (numeric values), not ranges
      expect(result.rowLabels[0]).toBe("0.00");
      expect(result.colLabels[0]).toBe("0.00");
      expect(result.rowLabels[10]).toBe("1.00");
      expect(result.colLabels[10]).toBe("1.00");
    });

    it("should calculate percentages correctly", () => {
      const input = {
        data: [
          { bin_x: 0, bin_y: 0, count: 25, min1: 0, max1: 1, min2: 0, max2: 1 },
          { bin_x: 1, bin_y: 0, count: 75, min1: 0, max1: 1, min2: 0, max2: 1 },
        ],
        nBins: 10,
        showPercentages: true,
        showCounts: true,
      };

      const result = generateNumericHeatmapData(input);

      expect(result.cells[0].metadata?.percentage).toBe(25);
      expect(result.cells[1].metadata?.percentage).toBe(75);
    });

    it("should handle empty data", () => {
      const input = {
        data: [],
        nBins: 10,
      };

      const result = generateNumericHeatmapData(input);

      expect(result.cells).toHaveLength(0);
      expect(result.rowLabels).toHaveLength(0);
      expect(result.colLabels).toHaveLength(0);
    });

    it("should format display values based on options", () => {
      const input = {
        data: [
          { bin_x: 0, bin_y: 0, count: 50, min1: 0, max1: 1, min2: 0, max2: 1 },
        ],
        nBins: 10,
        showCounts: true,
        showPercentages: false,
      };

      const result = generateNumericHeatmapData(input);

      expect(result.cells[0].displayValue).toBe("50");
    });

    it("should include metadata with bin ranges", () => {
      const input = {
        data: [
          { bin_x: 0, bin_y: 0, count: 10, min1: 0, max1: 1, min2: 0, max2: 1 },
        ],
        nBins: 10,
      };

      const result = generateNumericHeatmapData(input);

      expect(result.cells[0].metadata?.xRange).toBeDefined();
      expect(result.cells[0].metadata?.yRange).toBeDefined();
      expect(result.cells[0].metadata?.xRange).toEqual([0, 0.1]);
      expect(result.cells[0].metadata?.yRange).toEqual([0, 0.1]);
    });
  });

  describe("generateConfusionMatrixData", () => {
    it("should generate confusion matrix for categorical data", () => {
      const input = {
        data: [
          { row_category: "good", col_category: "good", count: 450 },
          { row_category: "good", col_category: "bad", count: 50 },
          { row_category: "bad", col_category: "good", count: 30 },
          { row_category: "bad", col_category: "bad", count: 470 },
        ],
      };

      const result = generateConfusionMatrixData(input);

      expect(result.cells).toHaveLength(4);
      expect(result.rows).toBe(2);
      expect(result.cols).toBe(2);
      expect(result.rowLabels).toEqual(["bad", "good"]);
      expect(result.colLabels).toEqual(["bad", "good"]);
    });

    it("should mark diagonal cells correctly", () => {
      const input = {
        data: [
          { row_category: "good", col_category: "good", count: 450 },
          { row_category: "good", col_category: "bad", count: 50 },
        ],
      };

      const result = generateConfusionMatrixData(input);

      const diagonalCell = result.cells.find(
        (c) => c.metadata?.isDiagonal === true,
      );
      expect(diagonalCell).toBeDefined();
      expect(diagonalCell?.metadata?.rowCategory).toBe(
        diagonalCell?.metadata?.colCategory,
      );
    });

    it("should calculate percentages for confusion matrix", () => {
      const input = {
        data: [
          { row_category: "a", col_category: "a", count: 25 },
          { row_category: "a", col_category: "b", count: 75 },
        ],
        showPercentages: true,
        showCounts: false,
      };

      const result = generateConfusionMatrixData(input);

      expect(result.cells[0].metadata?.percentage).toBe(25);
      expect(result.cells[1].metadata?.percentage).toBe(75);
    });

    it("should handle empty confusion matrix data", () => {
      const input = {
        data: [],
      };

      const result = generateConfusionMatrixData(input);

      expect(result.cells).toHaveLength(0);
      expect(result.rows).toBe(0);
      expect(result.cols).toBe(0);
    });

    it("should handle missing category combinations", () => {
      const input = {
        data: [
          { row_category: "good", col_category: "good", count: 450 },
          // Missing: good-bad, bad-good, bad-bad
        ],
      };

      const result = generateConfusionMatrixData(input);

      // Should create cells for all combinations even if count is 0
      expect(result.cells).toHaveLength(1);
      expect(result.cells[0].value).toBe(450);
    });
  });

  describe("fillMissingBins", () => {
    it("should fill in missing bins with zero counts", () => {
      const data = [
        { bin_x: 0, bin_y: 0, count: 10 },
        { bin_x: 1, bin_y: 1, count: 20 },
      ];
      const bounds = { min1: 0, max1: 1, min2: 0, max2: 1 };

      const result = fillMissingBins(data, 3, bounds);

      expect(result).toHaveLength(9); // 3x3 grid
      expect(result[0].count).toBe(10);
      expect(result[4].count).toBe(20);
      expect(result[1].count).toBe(0); // Filled bin
    });

    it("should preserve bounds in all filled bins", () => {
      const data = [{ bin_x: 0, bin_y: 0, count: 10 }];
      const bounds = { min1: 0, max1: 1, min2: 2, max2: 3 };

      const result = fillMissingBins(data, 2, bounds);

      expect(result[0].min1).toBe(0);
      expect(result[0].max1).toBe(1);
      expect(result[0].min2).toBe(2);
      expect(result[0].max2).toBe(3);
    });
  });
});
