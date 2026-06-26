/**
 * One-at-a-time executor for the V4 historic backfill chain (M1→M5).
 *
 * Drives a single migration directly via its `validate()`/`run()` (bypassing the
 * BackgroundMigrationManager and its env gates), after preparing the Postgres
 * `background_migrations` bookkeeping the migration relies on:
 *   - the migration's own row is reset (state/finishedAt/failedAt cleared);
 *   - its predecessor row is marked finished so `checkPredecessorMigrationFinalized`
 *     passes (the manager would normally have set this).
 *
 * The hard-coded UUIDs MUST match the Prisma rows; `findUniqueOrThrow` fails
 * loudly if a row is missing (e.g. db:migrate drift), which is far easier to
 * debug than a downstream "table does not exist".
 *
 * See specs/v4-historic-backfill-migration-testing.md (§3, §5).
 */
import { prisma } from "@langfuse/shared/src/db";
import { IBackgroundMigration } from "../../../IBackgroundMigration";
import CreateRootSpansFromTraces from "../../../createRootSpansFromTraces";
import RewriteObservationsToPidTidSorting from "../../../rewriteObservationsToPidTidSorting";
import BackfillEventsFullFromObservations from "../../../backfillEventsFullFromObservations";
import BackfillEventsFullFromDatasetRunItems from "../../../backfillEventsFullFromDatasetRunItems";
import DropPidTidSortingTables from "../../../dropPidTidSortingTables";

export type MigrationKey = "M1" | "M2" | "M3" | "M4" | "M5";

interface MigrationEntry {
  id: string;
  predecessorId: string | null;
  create: () => IBackgroundMigration;
}

/** Canonical registry — UUIDs are duplicated from the Prisma migration rows. */
export const MIGRATIONS: Record<MigrationKey, MigrationEntry> = {
  M1: {
    id: "8e1f4a2b-5c63-4d8e-9a47-1b2f3c4d5e6f",
    predecessorId: null,
    create: () => new CreateRootSpansFromTraces(),
  },
  M2: {
    id: "9c2d5a4f-7b8e-4f6a-a91c-3e5d7f8a2b1c",
    predecessorId: null,
    create: () => new RewriteObservationsToPidTidSorting(),
  },
  M3: {
    id: "7a3f8d6e-2c91-4b5e-8d72-f4a5b6c7d8e9",
    predecessorId: "9c2d5a4f-7b8e-4f6a-a91c-3e5d7f8a2b1c",
    create: () => new BackfillEventsFullFromObservations(),
  },
  M4: {
    id: "9d4f8a12-7b35-4e6c-9f48-a2b3c4d5e6f7",
    predecessorId: "7a3f8d6e-2c91-4b5e-8d72-f4a5b6c7d8e9",
    create: () => new BackfillEventsFullFromDatasetRunItems(),
  },
  M5: {
    id: "b3f1c5d8-9e47-4a26-8b3f-5c6d7e8f9a01",
    predecessorId: "9d4f8a12-7b35-4e6c-9f48-a2b3c4d5e6f7",
    create: () => new DropPidTidSortingTables(),
  },
};

/** Small `run()` args that keep the scheduler/loops fast in tests. */
export const FAST_RUN_ARGS = { pollIntervalMs: 250 } as const;

async function assertRowExists(id: string, key: MigrationKey): Promise<void> {
  // Guards against UUID / db:migrate drift with a clear, actionable error.
  const row = await prisma.backgroundMigration.findUnique({ where: { id } });
  if (!row) {
    throw new Error(
      `[${key}] background_migrations row ${id} is missing — run db:migrate (UUID drift?)`,
    );
  }
}

export async function resetMigration(id: string): Promise<void> {
  // `state` is a non-nullable Json column (@default("{}")). Prisma ignores
  // `undefined`, so an empty object is the correct "fresh" reset value —
  // loadState() treats it as no persisted progress (chunksLoaded falsy).
  await prisma.backgroundMigration.update({
    where: { id },
    data: { state: {}, finishedAt: null, failedAt: null },
  });
}

export async function markFinished(key: MigrationKey): Promise<void> {
  await prisma.backgroundMigration.update({
    where: { id: MIGRATIONS[key].id },
    data: { finishedAt: new Date(), failedAt: null },
  });
}

export async function getMigrationRow(key: MigrationKey) {
  return prisma.backgroundMigration.findUniqueOrThrow({
    where: { id: MIGRATIONS[key].id },
  });
}

export async function getMigrationState<T = unknown>(
  key: MigrationKey,
): Promise<T | null> {
  const row = await getMigrationRow(key);
  return (row.state as T) ?? null;
}

/**
 * Construct, validate, and run a single migration once. Resets its row and
 * marks its predecessor finished first. Returns the constructed instance so a
 * caller can drive `abort()` for resumability tests.
 */
export async function runMigrationOnce(
  key: MigrationKey,
  args: Record<string, unknown> = FAST_RUN_ARGS,
): Promise<IBackgroundMigration> {
  const entry = MIGRATIONS[key];
  await assertRowExists(entry.id, key);
  await resetMigration(entry.id);
  if (entry.predecessorId) {
    await prisma.backgroundMigration.update({
      where: { id: entry.predecessorId },
      data: { finishedAt: new Date(), failedAt: null },
    });
  }

  const migration = entry.create();
  const validation = await migration.validate(args);
  if (!validation.valid) {
    throw new Error(
      `[${key}] validate() failed: ${validation.invalidReason ?? "unknown"}`,
    );
  }
  await migration.run(args);
  return migration;
}

/** Validate-only, without resetting the predecessor (for predecessor-guard tests). */
export async function validateMigration(
  key: MigrationKey,
  args: Record<string, unknown> = FAST_RUN_ARGS,
): Promise<{ valid: boolean; invalidReason: string | undefined }> {
  return MIGRATIONS[key].create().validate(args);
}
