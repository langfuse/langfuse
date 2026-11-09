import { useMemo, useCallback, useState, useEffect } from "react";
import {
  transformToPivotTable,
  extractDimensionValues,
  extractMetricValues,
  sortPivotTableRows,
  getNextSortState,
  type PivotTableConfig,
  type DatabaseRow,
  DEFAULT_ROW_LIMIT,
} from "@/src/features/widgets/utils/pivot-table-utils";
import { type ChartProps } from "./chart-props";
import { valueFormatter } from "./utils";
import { formatMetricName } from "@/src/features/widgets/utils";
import { type OrderByState } from "@langfuse/shared";

export function usePivotTable({
  data,
  config,
  sortState,
  onSortChange,
}: {
  data: ChartProps["data"];
  config?: PivotTableConfig;
  sortState?: OrderByState;
  onSortChange?: (sortState: OrderByState | null) => void;
}) {
  const pivotTableRows = useMemo(() => {
    if (!data.length) return [];
    const pivotConfig: PivotTableConfig = {
      dimensions: config?.dimensions ?? [],
      metrics: config?.metrics ?? ["metric"],
      rowLimit: config?.rowLimit ?? DEFAULT_ROW_LIMIT,
      defaultSort: config?.defaultSort,
    };
    const databaseRows: DatabaseRow[] = data.map((point) => {
      const row: DatabaseRow = {};
      for (const [key, value] of Object.entries(point)) {
        if (
          value === null ||
          typeof value === "string" ||
          typeof value === "number"
        )
          row[key] = value;
      }
      const result: DatabaseRow = {
        ...extractDimensionValues(row, pivotConfig.dimensions),
        ...extractMetricValues(row, pivotConfig.metrics),
      };
      if (point.time_dimension !== undefined)
        result.time_dimension = point.time_dimension;
      if (typeof point.metric === "number") result.metric = point.metric;
      else if (Array.isArray(point.metric)) {
        result.metric = point.metric
          .flat()
          .reduce((sum, value) => sum + value, 0);
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
  const sortedRows = useMemo(() => {
    if (!sortState?.column) return pivotTableRows;
    try {
      return sortPivotTableRows(pivotTableRows, sortState);
    } catch (error) {
      console.error("Error sorting pivot table rows:", error);
      return pivotTableRows;
    }
  }, [pivotTableRows, sortState]);
  const metrics = config?.metrics ?? ["metric"];
  const handleSort = useCallback(
    (column: string) => {
      if (!onSortChange) return;
      onSortChange(
        getNextSortState(
          config?.defaultSort ?? null,
          sortState ?? null,
          column,
        ),
      );
    },
    [sortState, onSortChange, config?.defaultSort],
  );
  const [lastDefaultSort, setLastDefaultSort] = useState(config?.defaultSort);
  useEffect(() => {
    if (config?.defaultSort !== lastDefaultSort) {
      setLastDefaultSort(config?.defaultSort);
      onSortChange?.(config?.defaultSort ?? null);
    }
  }, [config?.defaultSort, onSortChange, lastDefaultSort]);

  return {
    visualization: {
      type: "table" as const,
      columns: [
        {
          id: "dimension",
          label: config?.dimensions?.length
            ? config.dimensions.map(formatMetricName).join(" / ")
            : "Dimension",
        },
        ...metrics.map((metric) => {
          const sort = (() => {
            if (sortState?.column !== metric) return undefined;
            return sortState.order === "ASC"
              ? ("asc" as const)
              : ("desc" as const);
          })();
          return {
            id: metric,
            label: formatMetricName(metric),
            align: "right" as const,
            sort,
            onSort: onSortChange ? () => handleSort(metric) : undefined,
          };
        }),
      ],
      rows: sortedRows.map((row) => {
        const emphasis = (() => {
          if (row.isTotal) return "total" as const;
          if (row.isSubtotal) return "subtotal" as const;
          return "normal" as const;
        })();
        return {
          id: row.id,
          emphasis,
          cells: [
            { columnId: "dimension", value: row.label, indent: row.level },
            ...metrics.map((metric, index) => ({
              columnId: metric,
              value: valueFormatter(row.values[metric], config?.units?.[index]),
            })),
          ],
        };
      }),
    },
  };
}
