import { type VisibilityState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useEffect } from "react";
import isEqual from "lodash/isEqual";
import {
  hasRunMigration,
  markMigrationRun,
  type OneTimeMigration,
} from "../lib/one-time-migration";

// Stable identity for the fallback, so an unusable stored value does not make
// a new object on every render (the value is a dependency of the effect below).
const EMPTY_VISIBILITY_STATE: VisibilityState = {};

// Local storage is hand-editable and keys get reused, so a parsed value can be
// any shape — an array, null, a primitive — and every consumer here indexes it
// or runs `in` against it.
const isVisibilityState = (value: unknown): value is VisibilityState =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// returns deep copy of local storage object
const readStoredVisibilityState = (
  localStorageKey: string,
): VisibilityState => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const storedValue = localStorage.getItem(localStorageKey);
    if (!storedValue) return {};
    const parsed: unknown = JSON.parse(storedValue);
    if (!isVisibilityState(parsed)) return {};
    // Values matter as much as the shape: entries whose value is not a boolean
    // are not column visibility, and they outlive the object they came from
    // (nothing else prunes them) until a saved view rejects them.
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, visible]) => typeof visible === "boolean",
      ),
    ) as VisibilityState;
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

  const [storedColumnVisibility, setColumnVisibility] =
    useLocalStorage<VisibilityState>(localStorageKey, initialVisibilityState());
  // useLocalStorage hands back whatever the key holds — its cross-tab and
  // same-tab listeners parse and set without checking — so coerce here: the
  // value this hook exposes is always an object of boolean entries. The effect
  // below rewrites the key, which heals a wrong-shaped or poisoned one.
  const columnVisibility = (() => {
    if (!isVisibilityState(storedColumnVisibility)) {
      return EMPTY_VISIBILITY_STATE;
    }
    const booleanEntries = Object.entries(storedColumnVisibility).filter(
      ([, visible]) => typeof visible === "boolean",
    );
    if (booleanEntries.length === Object.keys(storedColumnVisibility).length) {
      return storedColumnVisibility;
    }
    return Object.fromEntries(booleanEntries) as VisibilityState;
  })();

  useEffect(() => {
    let initialColumnVisibility = initialVisibilityState();
    Object.keys(initialColumnVisibility).forEach((key) => {
      const stored = columnVisibility[key];
      if (typeof stored === "boolean") {
        initialColumnVisibility[key] = stored;
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
