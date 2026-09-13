import { type VisibilityState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useEffect } from "react";
import isEqual from "lodash/isEqual";
import {
  hasRunMigration,
  markMigrationRun,
  type OneTimeMigration,
} from "@/src/features/column-visibility/lib/one-time-migration";

// returns deep copy of local storage object
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
) {
  if (column.columns) {
    column.columns.forEach((groupColumn) => {
      setVisibility(visibilityState, groupColumn);
    });
  } else {
    if (
      column.enableHiding &&
      !visibilityState.hasOwnProperty(column.accessorKey)
    ) {
      visibilityState[column.accessorKey] = !(column.defaultHidden === true);
    }
  }
}

function useColumnVisibility<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
  migrations?: OneTimeMigration<VisibilityState>[],
) {
  const initialVisibilityState = () => {
    const storedVisibilityState = readStoredVisibilityState(localStorageKey);
    const visibilityState: VisibilityState = storedVisibilityState;
    columns.forEach((column) => {
      setVisibility(visibilityState, column);
    });
    return visibilityState;
  };

  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<VisibilityState>(localStorageKey, initialVisibilityState());

  useEffect(() => {
    let initialColumnVisibility = initialVisibilityState();
    Object.keys(initialColumnVisibility).forEach((key) => {
      if (Object.hasOwn(columnVisibility, key)) {
        initialColumnVisibility[key] = columnVisibility[key];
      }
    });

    // Apply any opt-in one-time migrations (e.g. a column that became visible
    // by default). Each runs at most once, guarded by its versionKey.
    migrations?.forEach((migration) => {
      if (hasRunMigration(migration.versionKey)) return;
      const migrated = migration.apply(initialColumnVisibility);
      if (migrated === null) return; // deferred, retry on a later render
      initialColumnVisibility = migrated;
      markMigrationRun(migration.versionKey);
    });

    if (!isEqual(initialColumnVisibility, columnVisibility)) {
      setColumnVisibility(initialColumnVisibility);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnVisibility, setColumnVisibility, columns, migrations]);

  return [columnVisibility, setColumnVisibility] as const;
}

export default useColumnVisibility;
