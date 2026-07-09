import { useEffect } from "react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";

// returns deep copy of local storage object
const readStoredColumnOrder = (localStorageKey: string): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const storedValue = localStorage.getItem(localStorageKey);
    return storedValue ? JSON.parse(storedValue) : [];
  } catch (error) {
    console.error("Error reading from local storage", error);
    return [];
  }
};

/**
 * A one-time, opt-in transform of the persisted column order. Use it when a
 * table changes its *default* column position: the reconciliation in
 * `useColumnOrder` only splices in column IDs that are new to the app, so it
 * never repositions a column that already exists in a returning user's stored
 * order. A migration lets a specific table reposition such a column exactly
 * once, guarded by `versionKey` so it never re-fights a user who later moves
 * the column themselves.
 *
 * Migrations are entirely opt-in (passed per-call): tables that omit them keep
 * the previous behavior byte-for-byte.
 */
export type ColumnOrderMigration = {
  /**
   * localStorage key for the one-time guard flag. Should be unique per table +
   * migration, e.g. `experimentsColumnOrder-metadataReorder-v1-${projectId}`.
   */
  versionKey: string;
  /**
   * Pure transform applied to the reconciled column order. Must not mutate its
   * input. Return the input unchanged to skip (the flag is still set so it does
   * not retry on every mount).
   */
  apply: (columnOrder: string[]) => string[];
};

const hasRunMigration = (versionKey: string): boolean => {
  if (typeof window === "undefined") {
    return true; // never run migrations server-side
  }
  try {
    return localStorage.getItem(versionKey) !== null;
  } catch (error) {
    console.error("Error reading migration flag from local storage", error);
    return true;
  }
};

const markMigrationRun = (versionKey: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(versionKey, "1");
  } catch (error) {
    console.error("Error writing migration flag to local storage", error);
  }
};

function useColumnOrder<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
  migrations?: ColumnOrderMigration[],
) {
  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    localStorageKey,
    [],
  );

  useEffect(() => {
    const appColumnIds = columns.map((c) => c.accessorKey);
    const storedColumnIds = readStoredColumnOrder(localStorageKey);

    let finalColumnOrder: string[] = storedColumnIds.filter((id) =>
      appColumnIds.includes(id),
    );

    appColumnIds.forEach((id) => {
      if (!finalColumnOrder.includes(id)) {
        finalColumnOrder.splice(appColumnIds.indexOf(id), 0, id);
      }
    });

    // Apply any opt-in one-time migrations (e.g. repositioning a column whose
    // default slot changed). Each runs at most once, guarded by its versionKey.
    migrations?.forEach((migration) => {
      if (!hasRunMigration(migration.versionKey)) {
        finalColumnOrder = migration.apply(finalColumnOrder);
        markMigrationRun(migration.versionKey);
      }
    });

    // Compare the new order with the current order to avoid unnecessary updates
    if (JSON.stringify(finalColumnOrder) !== JSON.stringify(columnOrder)) {
      setColumnOrder(finalColumnOrder);
    }
  }, [columns, localStorageKey, columnOrder, setColumnOrder, migrations]);

  return [columnOrder, setColumnOrder] as const;
}

export default useColumnOrder;
