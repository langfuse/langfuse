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

function setVisibility<TData>(
  visibilityState: VisibilityState,
  column: LangfuseColumnDef<TData>,
  storedVisibilityState: VisibilityState,
) {
  if (column.columns) {
    column.columns.forEach((groupColumn) => {
      setVisibility(visibilityState, groupColumn, storedVisibilityState);
    });
  } else {
    visibilityState[column.accessorKey] = storedVisibilityState.hasOwnProperty(
      column.accessorKey,
    )
      ? storedVisibilityState[column.accessorKey]
      : !(column.defaultHidden === true);
  }
}

// need to add garbage collection
function useColumnVisibility<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
) {
  const initialVisibilityState = () => {
    const storedVisibilityState = readStoredVisibilityState(localStorageKey);

    const visibilityState: VisibilityState = Boolean(
      Object.keys(storedVisibilityState).length,
    )
      ? storedVisibilityState
      : {};
    columns.forEach((column) => {
      setVisibility(visibilityState, column, storedVisibilityState);
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
