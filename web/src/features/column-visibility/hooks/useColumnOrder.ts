import { useEffect } from "react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  hasRunMigration,
  markMigrationRun,
  type OneTimeMigration,
} from "@/src/features/column-visibility/lib/one-time-migration";

// returns deep copy of local storage object
const readStoredColumnOrder = (localStorageKey: string): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const storedValue = localStorage.getItem(localStorageKey);
    return storedValue ? JSON.parse(storedValue) : [];
  } catch (error) {
    console.warn("Error reading from local storage", error);
    return [];
  }
};

function useColumnOrder<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
  migrations?: OneTimeMigration<string[]>[],
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
    // default slot changed).
    //
    // The flag is only set once the transform has nothing left to change: it is
    // written synchronously while `setColumnOrder` lands a render later, so
    // marking it as soon as the transform ran would let a repeated effect run
    // (React re-invokes mount effects in development) read the pre-migration
    // order back out of local storage and overwrite the result with it. Waiting
    // for a no-op pass costs one extra application of an idempotent transform
    // and converges instead.
    migrations?.forEach((migration) => {
      if (hasRunMigration(migration.versionKey)) return;
      const migrated = migration.apply(finalColumnOrder);
      if (migrated === null) return; // deferred, retry on a later render
      const settled =
        JSON.stringify(migrated) === JSON.stringify(finalColumnOrder);
      finalColumnOrder = migrated;
      if (settled) markMigrationRun(migration.versionKey);
    });

    // Compare the new order with the current order to avoid unnecessary updates
    if (JSON.stringify(finalColumnOrder) !== JSON.stringify(columnOrder)) {
      setColumnOrder(finalColumnOrder);
    }
  }, [columns, localStorageKey, columnOrder, setColumnOrder, migrations]);

  return [columnOrder, setColumnOrder] as const;
}

export default useColumnOrder;
