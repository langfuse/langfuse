import { type VisibilityState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useEffect } from "react";
import { isEqual } from "lodash";

const readStoredVisibilityState = (
  localStorageKey: string,
): VisibilityState => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const storedValue = localStorage.getItem(localStorageKey);
    return storedValue ? JSON.parse(storedValue) : {};
  } catch (error) {
    console.error("Error reading from local storage", error);
    return {};
  }
};

function useColumnVisibility<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
) {
  const initialVisibilityState = () => {
    const visibilityState: VisibilityState = {};
    const storedVisibilityState = readStoredVisibilityState(localStorageKey);

    // With virtual detail columns we must ensure state in local storage is valid given current project data and possibly upsert
    if (Object.keys(storedVisibilityState).length > 0) {
      if (Boolean(columns.length)) {
        const storedVisibilityStateKeys = new Set(
          Object.keys(storedVisibilityState),
        );
        return columns.reduce((acc, column) => {
          if (
            "accessorKey" in column &&
            typeof column.accessorKey === "string"
          ) {
            if (storedVisibilityStateKeys.has(column.accessorKey))
              acc[column.accessorKey] =
                storedVisibilityState[column.accessorKey];
            else acc[column.accessorKey] = !(column.defaultHidden === true);
          }
          return acc;
        }, {} as VisibilityState);
      }
      return storedVisibilityState;
    }

    columns.forEach((column) => {
      if (
        "accessorKey" in column &&
        typeof column.accessorKey === "string" &&
        column.enableHiding
      ) {
        visibilityState[column.accessorKey] = !(column.defaultHidden === true);
      }
    });
    return visibilityState;
  };

  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<VisibilityState>(localStorageKey, initialVisibilityState());

  useEffect(() => {
    const initialColumnVisibility = initialVisibilityState();
    Object.keys(initialColumnVisibility).forEach((key) => {
      if (Object.hasOwn(columnVisibility, key)) {
        initialColumnVisibility[key] = columnVisibility[key];
      }
    });

    if (!isEqual(initialColumnVisibility, columnVisibility)) {
      setColumnVisibility(initialColumnVisibility);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnVisibility, setColumnVisibility, columns]);

  return [columnVisibility, setColumnVisibility] as const;
}

export default useColumnVisibility;
