import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  hasRunMigration,
  markMigrationRun,
  type OneTimeMigration,
} from "../lib/one-time-migration";

// Stable identity, so a missing or unusable stored value does not make a new
// array on every render (the value is a dependency of the effect below).
const EMPTY_COLUMN_ORDER: string[] = [];

// returns deep copy of local storage object
const readStoredColumnOrder = (localStorageKey: string): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const storedValue = localStorage.getItem(localStorageKey);
    if (!storedValue) return [];
    const parsed: unknown = JSON.parse(storedValue);
    // Local storage is hand-editable and keys get reused, so the parsed value
    // can be any shape. Anything but a list of column ids is discarded.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
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
  const [storedColumnOrder, setStoredColumnOrder] = useLocalStorage<string[]>(
    localStorageKey,
    EMPTY_COLUMN_ORDER,
  );
  // useLocalStorage hands back whatever the key holds — its cross-tab and
  // same-tab listeners parse and set without checking — so coerce here: the
  // value this hook exposes is always an array. The effect below rewrites the
  // key, which heals a wrong-shaped one.
  const columnOrder = Array.isArray(storedColumnOrder)
    ? storedColumnOrder
    : EMPTY_COLUMN_ORDER;

  // The setter is coerced too: callers pass an updater (the picker's drag
  // handler calls `.indexOf` on the previous order), and an updater reads the
  // raw stored value rather than the one above.
  const setColumnOrder = useCallback<Dispatch<SetStateAction<string[]>>>(
    (next) =>
      setStoredColumnOrder((previous) =>
        typeof next === "function"
          ? next(Array.isArray(previous) ? previous : EMPTY_COLUMN_ORDER)
          : next,
      ),
    [setStoredColumnOrder],
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
