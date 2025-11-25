/**
 * @fileoverview Unit Tests for PivotTable React Component
 *
 * Comprehensive test suite for the PivotTable component functionality including:
 * - Component rendering with various data scenarios
 * - Proper styling and CSS class application
 * - Indentation behavior for nested dimensions
 * - Empty data and error state handling
 * - Metric value formatting and display
 * - Column header formatting
 *
 * Uses Jest and React Testing Library for component testing.
 * This test focuses on component behavior rather than data transformation logic.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  PivotTable,
  type PivotTableProps,
} from "@/src/features/widgets/chart-library/PivotTable";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

describe("PivotTable Component", () => {
  describe("Basic Rendering", () => {
    test("renders table with simple data", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "gpt-4",
          metric: 100,
        },
        {
          time_dimension: "2024-01-01",
          dimension: "gpt-3.5",
          metric: 75,
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      render(<PivotTable {...props} />);

      // Check table structure exists
      expect(screen.getByRole("table")).toBeInTheDocument();
      // Should have dimension column and metric column
      expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    });

    test("displays data when no configuration provided", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test",
          metric: 50,
        },
      ];

      const props: PivotTableProps = {
        data,
      };

      render(<PivotTable {...props} />);

      // Should still render a table
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
  });

  describe("Column Header Formatting", () => {
    test("formats single dimension header correctly", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test",
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: ["model_name"],
          metrics: ["request_count"],
        },
      };

      render(<PivotTable {...props} />);

      expect(
        screen.getByRole("columnheader", { name: "Model Name" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("columnheader", { name: "Request Count" }),
      ).toBeInTheDocument();
    });

    test("formats multiple dimension headers correctly", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test",
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: ["model_name", "time_period"],
          metrics: ["request_count", "avg_duration"],
        },
      };

      render(<PivotTable {...props} />);

      expect(
        screen.getByRole("columnheader", { name: "Model Name / Time Period" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("columnheader", { name: "Request Count" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("columnheader", { name: "Avg Duration" }),
      ).toBeInTheDocument();
    });

    test("defaults to 'Dimension' when no dimensions configured", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test",
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: [],
          metrics: ["metric"],
        },
      };

      render(<PivotTable {...props} />);

      expect(
        screen.getByRole("columnheader", { name: "Dimension" }),
      ).toBeInTheDocument();
    });
  });

  describe("Empty Data Handling", () => {
    test("displays 'No data available' for empty data array", () => {
      const props: PivotTableProps = {
        data: [],
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      render(<PivotTable {...props} />);

      expect(screen.getByText("No data available")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    test("displays 'No data available' for null data", () => {
      const props: PivotTableProps = {
        data: null as any,
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      render(<PivotTable {...props} />);

      expect(screen.getByText("No data available")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    test("displays 'No data available' for undefined data", () => {
      const props: PivotTableProps = {
        data: undefined as any,
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      render(<PivotTable {...props} />);

      expect(screen.getByText("No data available")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });

  describe("Responsive Design", () => {
    test("includes overflow-auto class for responsive scrolling", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test",
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      const { container } = render(<PivotTable {...props} />);

      const pivotTableContainer = container.firstChild as HTMLElement;
      expect(pivotTableContainer).toHaveClass("h-full", "overflow-auto");
    });
  });

  describe("Accessibility", () => {
    test("provides proper table structure for screen readers", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "gpt-4",
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      render(<PivotTable {...props} />);

      // Check table has proper semantic structure
      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getAllByRole("columnheader")).toHaveLength(2);
      // Should have at least header row
      expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(1);
    });

    test("provides proper cell associations", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test",
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      render(<PivotTable {...props} />);

      // Header cells should be properly associated
      const headers = screen.getAllByRole("columnheader");
      expect(headers.length).toBeGreaterThan(0);

      // Each header should be part of a row
      headers.forEach((header) => {
        expect(header.closest("tr")).toBeInTheDocument();
      });
    });
  });

  describe("Component Props", () => {
    test("handles missing config gracefully", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test",
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        // No config provided
      };

      render(<PivotTable {...props} />);

      // Should still render a table
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    test("passes accessibilityLayer prop correctly", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test",
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        accessibilityLayer: true,
      };

      // Should render without error
      expect(() => render(<PivotTable {...props} />)).not.toThrow();
    });
  });

  describe("Data Processing Integration", () => {
    test("handles various metric data types", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: "test1",
          metric: 100, // number
        },
        {
          time_dimension: "2024-01-01",
          dimension: "test2",
          metric: [
            [10, 20],
            [30, 40],
          ], // nested array
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      // Should render without error
      expect(() => render(<PivotTable {...props} />)).not.toThrow();
      expect(screen.getByRole("table")).toBeInTheDocument();
    });

    test("handles missing dimension data", () => {
      const data: DataPoint[] = [
        {
          time_dimension: "2024-01-01",
          dimension: undefined, // missing dimension
          metric: 100,
        },
      ];

      const props: PivotTableProps = {
        data,
        config: {
          dimensions: ["model"],
          metrics: ["metric"],
        },
      };

      // Should render without error
      expect(() => render(<PivotTable {...props} />)).not.toThrow();
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
  });
});
