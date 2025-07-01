import { useEffect } from "react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
import { type ColumnSizingState } from "@tanstack/react-table";
import { isEqual } from "lodash";

// returns deep copy of local storage object
const readStoredColumnSizing = (localStorageKey: string): ColumnSizingState => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const storedValue = localStorage.getItem(localStorageKey);
    return storedValue ? JSON.parse(storedValue) : {};
  } catch (error) {
    console.error("Error reading column sizing from local storage", error);
    return {};
  }
};

function useColumnSizing<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
) {
  const getDefaultColumnSizing = (): ColumnSizingState => {
    const defaultSizing: ColumnSizingState = {};
    
    const processColumns = (cols: LangfuseColumnDef<TData>[]): void => {
      cols.forEach((column) => {
        if (column.columns) {
          // Handle grouped columns
          processColumns(column.columns);
        } else if (column.size !== undefined) {
          // Only set default size if explicitly defined in column definition
          defaultSizing[column.accessorKey] = column.size;
        }
      });
    };
    
    processColumns(columns);
    return defaultSizing;
  };

  const [columnSizing, setColumnSizing] = useLocalStorage<ColumnSizingState>(
    localStorageKey,
    {},
  );

  useEffect(() => {
    const defaultSizing = getDefaultColumnSizing();
    const storedSizing = readStoredColumnSizing(localStorageKey);
    
    // Merge stored sizing with defaults, prioritizing stored values
    const mergedSizing: ColumnSizingState = { ...defaultSizing, ...storedSizing };
    
    // Remove any sizing for columns that no longer exist
    const currentColumnIds = new Set<string>();
    const processColumns = (cols: LangfuseColumnDef<TData>[]): void => {
      cols.forEach((column) => {
        if (column.columns) {
          processColumns(column.columns);
        } else {
          currentColumnIds.add(column.accessorKey);
        }
      });
    };
    processColumns(columns);
    
    const filteredSizing: ColumnSizingState = {};
    Object.keys(mergedSizing).forEach((columnId) => {
      if (currentColumnIds.has(columnId)) {
        filteredSizing[columnId] = mergedSizing[columnId];
      }
    });
    
    if (!isEqual(filteredSizing, columnSizing)) {
      setColumnSizing(filteredSizing);
    }
  }, [columns, localStorageKey, columnSizing, setColumnSizing]);

  return [columnSizing, setColumnSizing] as const;
}

export default useColumnSizing;