/**
 * @fileoverview PivotTable Chart Component
 *
 * A configurable pivot table widget component that displays data in a tabular format
 * with support for multiple dimensions (currently up to 2), metrics as columns,
 * subtotals, and grand totals.
 *
 * Features:
 * - Dynamic dimension support (0-N dimensions, currently limited to 2)
 * - Proper indentation for nested dimension levels
 * - Subtotal and grand total calculations
 * - Responsive design within dashboard grid
 * - Consistent styling with Langfuse design system
 * - Row limiting to prevent performance issues
 *
 * Usage:
 * Used as part of the dashboard widget system to display tabular data
 * visualizations with grouping and aggregation capabilities.
 */

import React, { useMemo } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/src/components/ui/table";
import {
  transformToPivotTable,
  extractDimensionValues,
  extractMetricValues,
  type PivotTableRow,
  type PivotTableConfig,
  type DatabaseRow,
  DEFAULT_ROW_LIMIT,
} from "@/src/features/widgets/utils/pivot-table-utils";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";
import { numberFormatter } from "@/src/utils/numbers";
import { formatMetricName } from "@/src/features/widgets/utils";

/**
 * Props interface for the PivotTable component
 * Uses standard chart data structure with pivot-specific configuration
 */
export interface PivotTableProps {
  /** Array of data points from the chart query */
  data: ChartProps["data"];

  /** Pivot table specific configuration */
  config?: PivotTableConfig;

  /** Chart configuration from shadcn/ui (for consistency with other charts) */
  chartConfig?: ChartProps["config"];

  /** Accessibility layer flag */
  accessibilityLayer?: boolean;
}

/**
 * Individual row component for the pivot table
 * Handles styling, indentation, and content display for each row type
 */
const PivotTableRowComponent: React.FC<{
  row: PivotTableRow;
  metrics: string[];
}> = ({ row, metrics }) => {
  return (
    <TableRow
      className={cn(
        "border-b transition-colors hover:bg-muted/30",
        row.isSubtotal && "bg-muted/30",
        row.isTotal && "bg-muted/50",
      )}
    >
      {/* Dimension column with indentation and styling */}
      <TableCell
        className={cn(
          "p-2 align-middle font-normal",
          // Apply indentation based on level using explicit Tailwind classes
          row.level === 1 && "pl-6", // 1.5rem indentation for level 1
          row.level === 2 && "pl-10", // 2.5rem indentation for level 2
          // Bold styling for subtotal and total rows
          (row.isSubtotal || row.isTotal) && "font-semibold",
        )}
        style={{
          // Fallback for levels beyond 2 using inline styles
          paddingLeft:
            row.level > 2 ? `${row.level * 1.5 + 0.5}rem` : undefined,
        }}
      >
        {row.label}
      </TableCell>

      {/* Metric columns */}
      {metrics.map((metric) => (
        <TableCell
          key={metric}
          className={cn(
            "p-2 text-right align-middle tabular-nums",
            (row.isSubtotal || row.isTotal) && "font-semibold",
          )}
        >
          {formatMetricValue(row.values[metric])}
        </TableCell>
      ))}
    </TableRow>
  );
};

/**
 * Formats metric values for display in the table
 * Handles numbers and strings with appropriate formatting
 *
 * @param value - The metric value to format
 * @returns Formatted string for display
 */
function formatMetricValue(value: number | string): string {
  if (typeof value === "string") {
    return value;
  }

  return numberFormatter(value, 2).replace(/\.00$/, "");
}

/**
 * Formats metric names for column headers
 *
 * @param metricName - The metric field name
 * @returns Formatted column header
 */
function formatColumnHeader(metricName: string): string {
  return formatMetricName(metricName);
}

/**
 * Main PivotTable Component
 *
 * Transforms flat data into a pivot table structure and renders it with
 * proper styling, indentation, and responsive behavior.
 *
 * @param data - Array of data points from the chart query
 * @param config - Pivot table configuration including dimensions and metrics
 */
export const PivotTable: React.FC<PivotTableProps> = ({ data, config }) => {
  // Transform chart data into pivot table structure
  const pivotTableRows = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // Extract configuration with defaults
    const pivotConfig: PivotTableConfig = {
      dimensions: config?.dimensions ?? [],
      metrics: config?.metrics ?? ["metric"], // Default to 'metric' field from DataPoint
      rowLimit: config?.rowLimit ?? DEFAULT_ROW_LIMIT,
    };

    // Transform DataPoint[] to DatabaseRow[] format using utility functions
    const databaseRows: DatabaseRow[] = data.map((point) => {
      // Cast the point to any to access dynamic fields from the query
      const rowData = point as any;

      // Create a database row with all fields from the original data
      const row: DatabaseRow = { ...rowData };

      // Use utility functions to ensure proper extraction and parsing
      const dimensionValues = extractDimensionValues(
        row,
        pivotConfig.dimensions,
      );
      const metricValues = extractMetricValues(row, pivotConfig.metrics);

      // Combine dimension and metric values into the final row
      const result: DatabaseRow = {
        ...dimensionValues,
        ...metricValues,
      };

      // Include time dimension if present
      if (point.time_dimension !== undefined) {
        result.time_dimension = point.time_dimension;
      }

      // Include legacy 'metric' field for backward compatibility
      if (point.metric !== undefined) {
        if (typeof point.metric === "number") {
          result.metric = point.metric;
        } else if (Array.isArray(point.metric)) {
          result.metric = point.metric
            .flat()
            .reduce((sum, val) => sum + val, 0);
        }
      }

      return result;
    });

    try {
      return transformToPivotTable(databaseRows, pivotConfig);
    } catch (error) {
      console.error("Error transforming data to pivot table:", error);
      return [];
    }
  }, [data, config]);

  // Extract metrics from configuration or fallback to default
  const metrics = useMemo(() => {
    return config?.metrics ?? ["metric"];
  }, [config?.metrics]);

  // Handle empty data state
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  // Handle transformation errors
  if (pivotTableRows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Unable to process data for pivot table
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-5 pb-2">
      <Table>
        <TableHeader>
          <TableRow className="border-b bg-muted/50">
            {/* Dimension column header */}
            <TableHead className="p-2 text-left font-medium">
              {config?.dimensions && config.dimensions.length > 0
                ? config.dimensions.map(formatColumnHeader).join(" / ") // Show all dimensions
                : "Dimension"}
            </TableHead>

            {/* Metric column headers */}
            {metrics.map((metric) => (
              <TableHead key={metric} className="p-2 text-right font-medium">
                {formatColumnHeader(metric)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {pivotTableRows.map((row) => (
            <PivotTableRowComponent key={row.id} row={row} metrics={metrics} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default PivotTable;
