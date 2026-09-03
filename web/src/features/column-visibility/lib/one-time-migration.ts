/**
 * A one-time, opt-in transform of persisted table state (column order or
 * column visibility). Use it when a table changes a *default*: the
 * reconciliation in `useColumnOrder` / `useColumnVisibility` never overrides a
 * value a returning user already has stored, so without a migration a new
 * default only ever reaches new users.
 *
 * Migrations are entirely opt-in (passed per-call): tables that omit them keep
 * the previous behavior byte-for-byte.
 */
export type OneTimeMigration<T> = {
  /**
   * localStorage key for the one-time guard flag. Should be unique per table +
   * migration, e.g. `experimentsColumnOrder-metadataReorder-v1-${projectId}`.
   */
  versionKey: string;
  /**
   * Pure transform applied to the reconciled state. Must not mutate its input.
   * Return the input unchanged to skip (the flag is still set so it does not
   * retry on every mount), or `null` to defer — for state that depends on
   * asynchronously loaded columns, so the migration is retried instead of
   * being consumed against incomplete state.
   */
  apply: (state: T) => T | null;
};

export const hasRunMigration = (versionKey: string): boolean => {
  if (typeof window === "undefined") {
    return true; // never run migrations server-side
  }
  try {
    return localStorage.getItem(versionKey) !== null;
  } catch (error) {
    console.warn("Error reading migration flag from local storage", error);
    return true;
  }
};

export const markMigrationRun = (versionKey: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(versionKey, "1");
  } catch (error) {
    console.warn("Error writing migration flag to local storage", error);
  }
};
