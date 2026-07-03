import { IBackgroundMigration } from "./IBackgroundMigration";
import { commandClickhouse, logger } from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import {
  checkPredecessorMigrationFinalized,
  onClusterClause,
} from "./utils/backfillBase";

// Hard-coded UUID identifying the row in background_migrations. Must match the
// Prisma migration that registers this row.
const backgroundMigrationId = "b3f1c5d8-9e47-4a26-8b3f-5c6d7e8f9a01";

const LOG_PREFIX = "[Drop PID/TID sorting tables]";

// ============================================================================
// Migration class
// ============================================================================

/**
 * Cleanup migration that drops the scratch table created by the V4 historic
 * backfill chain (M2 → M3 → M4):
 *
 *   - `observations_pid_tid_sorting` — populated by M2, read by M3, M4.
 *
 * This is a single-step migration with no chunking. It is gated by
 * `LANGFUSE_BACKGROUND_MIGRATION_V4_DROP_PID_TID_SORTING_TABLES` so self-hosters can keep
 * the scratch table around for forensics/restartability until they're
 * confident the new path is healthy.
 */
export default class DropPidTidSortingTables implements IBackgroundMigration {
  private isAborted = false;

  // ============================================================================
  // Validate
  // ============================================================================

  async validate(
    _args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    return checkPredecessorMigrationFinalized(
      "9d4f8a12-7b35-4e6c-9f48-a2b3c4d5e6f7",
      "20260701_v4_step_4_backfill_events_full_from_dataset_run_items",
    );
  }

  // ============================================================================
  // Run
  // ============================================================================

  async run(_args: Record<string, unknown>): Promise<void> {
    logger.info(`${LOG_PREFIX} Starting cleanup of V4 backfill scratch tables`);

    const tables = ["observations_pid_tid_sorting"];

    for (const table of tables) {
      if (this.isAborted) {
        logger.info(`${LOG_PREFIX} Aborted before dropping ${table}`);
        return;
      }

      const onCluster = onClusterClause();
      // `IF EXISTS` keeps the migration idempotent — re-running the row (or
      // running it on a deployment that never created the scratch tables) is
      // a no-op rather than an error.
      const sql = `DROP TABLE IF EXISTS ${table} ${onCluster} SYNC`.trim();

      logger.info(`${LOG_PREFIX} Dropping ${table}`);
      try {
        await commandClickhouse({
          query: sql,
          tags: {
            surface: "worker",
            route: `background-migration.dropPidTidSortingTables:${table}`,
          },
        });
        logger.info(`${LOG_PREFIX} Dropped ${table}`);
      } catch (error) {
        logger.error(`${LOG_PREFIX} Failed to drop ${table}`, error);
        throw error;
      }
    }

    logger.info(`${LOG_PREFIX} Cleanup complete`);
  }

  // ============================================================================
  // Abort
  // ============================================================================

  async abort(): Promise<void> {
    logger.info(`${LOG_PREFIX} Aborting drop migration`);
    this.isAborted = true;
  }
}

// ============================================================================
// CLI entry point
// ============================================================================

async function main(): Promise<void> {
  process.on("unhandledRejection", (reason) => {
    logger.error(
      `${LOG_PREFIX} Unhandled rejection - process will exit`,
      reason,
    );
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error(`${LOG_PREFIX} Uncaught exception - process will exit`, error);
    process.exit(1);
  });

  parseArgs({ options: {} });

  const migration = new DropPidTidSortingTables();
  const validation = await migration.validate({});

  if (!validation.valid) {
    logger.error(
      `${LOG_PREFIX} Validation failed: ${validation.invalidReason}`,
    );
    process.exit(1);
  }

  await migration.run({});
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`${LOG_PREFIX} Migration execution failed: ${error}`, error);
      process.exit(1);
    });
}

// Exported so callers can reference the canonical UUID without importing the
// default export.
export { backgroundMigrationId };
