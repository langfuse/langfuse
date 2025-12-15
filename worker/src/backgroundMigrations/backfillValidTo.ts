import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { parseArgs } from "node:util";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "d4f5a6b7-c8d9-4e1f-a2b3-c4d5e6f7a8b9";

/**
 * Background migration to backfill valid_to timestamps for dataset_items.
 *
 * Background:
 * - Currently, the dataset_items table uses append-only writes where new versions
 *   are created with valid_from timestamps but old versions never get their valid_to set
 * - This migration sets valid_to on old rows to equal the valid_from of the next version
 * - This enables proper temporal queries and ensures old versions are marked as superseded
 *
 * Performance Strategy:
 * - Single optimized SQL query using window functions (LEAD)
 * - Processes rows directly in batches using cursor-based pagination
 * - Uses indexed columns (id, project_id, valid_from) for efficient scanning
 * - No need to iterate projects - processes all rows in order
 *
 * State tracking:
 * - Tracks cursor position (id, project_id, valid_from) for resumability
 * - Stores total rows updated and batches processed
 */

interface MigrationState {
  phase: "init" | "processing" | "completed";
  lastProcessedCursor: {
    id: string;
    projectId: string;
    validFrom: string; // ISO string for JSON serialization
  } | null;
  totalRowsUpdated: number;
  batchesProcessed: number;
  startedAt?: string;
  lastUpdatedAt?: string;
}

interface MigrationArgs {
  batchSize?: number; // Number of rows to process per batch
  dryRun?: boolean; // If true, only log what would be done
}

const DEFAULT_BATCH_SIZE = 1000;

export default class InvalidateOldDatasetItemRows
  implements IBackgroundMigration
{
  private isAborted = false;

  // ============================================================================
  // State Management
  // ============================================================================

  private async loadState(): Promise<MigrationState> {
    const migration = await prisma.backgroundMigration.findUnique({
      where: { id: backgroundMigrationId },
      select: { state: true },
    });

    const defaultState: MigrationState = {
      phase: "init",
      lastProcessedCursor: null,
      totalRowsUpdated: 0,
      batchesProcessed: 0,
    };

    if (!migration || !migration.state) {
      return defaultState;
    }

    const state = migration.state as Partial<MigrationState>;

    return {
      phase: state.phase ?? defaultState.phase,
      lastProcessedCursor:
        state.lastProcessedCursor ?? defaultState.lastProcessedCursor,
      totalRowsUpdated: state.totalRowsUpdated ?? defaultState.totalRowsUpdated,
      batchesProcessed: state.batchesProcessed ?? defaultState.batchesProcessed,
      startedAt: state.startedAt,
      lastUpdatedAt: state.lastUpdatedAt,
    };
  }

  private async updateState(state: MigrationState): Promise<void> {
    state.lastUpdatedAt = new Date().toISOString();
    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: state as any },
    });
  }

  // ============================================================================
  // Core Migration Logic
  // ============================================================================

  /**
   * Process a batch of rows and update valid_to.
   * Uses a correlated subquery approach which is much faster than window functions.
   *
   * Strategy:
   * 1. Fetch a batch of rows ordered by (id, project_id, valid_from)
   * 2. For each row, use correlated subquery to find next version (much faster than PARTITION BY)
   * 3. Update valid_to using the join result
   *
   * This avoids expensive PARTITION BY operations over the entire table.
   */
  private async processBatch(
    cursor: { id: string; projectId: string; validFrom: Date } | null,
    batchSize: number,
    dryRun: boolean,
  ): Promise<{
    rowsUpdated: number;
    lastCursor: { id: string; projectId: string; validFrom: Date } | null;
  }> {
    // Build cursor condition for pagination
    const cursorCondition = cursor
      ? Prisma.sql`
          AND (di1.id, di1.project_id, di1.valid_from) > (${cursor.id}, ${cursor.projectId}, ${cursor.validFrom})
        `
      : Prisma.empty;

    if (dryRun) {
      // Dry run: count rows that would be updated using correlated subquery
      const countQuery = Prisma.sql`
        SELECT COUNT(*) as count
        FROM (
          SELECT di1.id, di1.project_id, di1.valid_from
          FROM dataset_items di1
          WHERE di1.valid_to IS NULL
            ${cursorCondition}
          ORDER BY di1.id, di1.project_id, di1.valid_from
          LIMIT ${batchSize}
        ) batch
        WHERE EXISTS (
          SELECT 1
          FROM dataset_items di2
          WHERE di2.id = batch.id
            AND di2.project_id = batch.project_id
            AND di2.valid_from > batch.valid_from
          LIMIT 1
        )
      `;

      const result =
        await prisma.$queryRaw<Array<{ count: bigint }>>(countQuery);
      const count = Number(result[0]?.count ?? 0);
      logger.info(
        `[Invalidate Dataset Items] [DRY RUN] Would update ${count} rows in this batch`,
      );
      return { rowsUpdated: count, lastCursor: null };
    }

    // Actual update: Use self-join to find next version efficiently
    // The correlated subquery will find the ACTUAL next version globally, not just in the batch
    // This is correct - we want to set valid_to to when the item was actually superseded
    const updateQuery = Prisma.sql`
      WITH batch AS (
        SELECT di1.id, di1.project_id, di1.valid_from
        FROM dataset_items di1
        WHERE di1.valid_to IS NULL
          ${cursorCondition}
        ORDER BY di1.id, di1.project_id, di1.valid_from
        LIMIT ${batchSize}
      ),
      with_next AS (
        SELECT
          batch.id,
          batch.project_id,
          batch.valid_from,
          (
            SELECT di2.valid_from
            FROM dataset_items di2
            WHERE di2.id = batch.id
              AND di2.project_id = batch.project_id
              AND di2.valid_from > batch.valid_from
            ORDER BY di2.valid_from ASC
            LIMIT 1
          ) as next_valid_from
        FROM batch
      )
      UPDATE dataset_items di
      SET valid_to = wn.next_valid_from
      FROM with_next wn
      WHERE di.id = wn.id
        AND di.project_id = wn.project_id
        AND di.valid_from = wn.valid_from
        AND wn.next_valid_from IS NOT NULL
      RETURNING di.id, di.project_id, di.valid_from
    `;

    const result =
      await prisma.$queryRaw<
        Array<{ id: string; project_id: string; valid_from: Date }>
      >(updateQuery);

    const rowsUpdated = result.length;

    // Get last cursor - need to track the last row from the BATCH, not just updated rows
    // to ensure we make progress even if some rows don't need updating (already latest version)
    if (rowsUpdated > 0) {
      const lastCursor = {
        id: result[result.length - 1].id,
        projectId: result[result.length - 1].project_id,
        validFrom: result[result.length - 1].valid_from,
      };
      return { rowsUpdated, lastCursor };
    }

    // If no rows were updated, fetch the last row from the batch to move cursor forward
    const lastInBatchQuery = Prisma.sql`
      SELECT di1.id, di1.project_id, di1.valid_from
      FROM dataset_items di1
      WHERE di1.valid_to IS NULL
        ${cursorCondition}
      ORDER BY di1.id, di1.project_id, di1.valid_from
      OFFSET ${batchSize - 1}
      LIMIT 1
    `;

    const lastInBatch =
      await prisma.$queryRaw<
        Array<{ id: string; project_id: string; valid_from: Date }>
      >(lastInBatchQuery);

    if (lastInBatch.length > 0) {
      return {
        rowsUpdated: 0,
        lastCursor: {
          id: lastInBatch[0].id,
          projectId: lastInBatch[0].project_id,
          validFrom: lastInBatch[0].valid_from,
        },
      };
    }

    return { rowsUpdated: 0, lastCursor: null };
  }

  // ============================================================================
  // Validation
  // ============================================================================

  async validate(
    args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // Check that dataset_items table has the versioning columns
    const tableInfo = await prisma.$queryRaw<Array<{ column_name: string }>>(
      Prisma.sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'dataset_items'
        AND column_name IN ('valid_from', 'valid_to', 'is_deleted')
    `,
    );

    const columns = tableInfo.map((r) => r.column_name);
    const missingColumns = ["valid_from", "valid_to", "is_deleted"].filter(
      (col) => !columns.includes(col),
    );

    if (missingColumns.length > 0) {
      return {
        valid: false,
        invalidReason: `Missing required columns on dataset_items: ${missingColumns.join(", ")}`,
      };
    }

    // Check if there are any rows that need migration
    const needsMigration = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*) as count
        FROM dataset_items di1
        WHERE di1.valid_to IS NULL
          AND EXISTS (
            SELECT 1
            FROM dataset_items di2
            WHERE di2.id = di1.id
              AND di2.project_id = di1.project_id
              AND di2.valid_from > di1.valid_from
          )
        LIMIT 1
      `,
    );

    const count = Number(needsMigration[0]?.count ?? 0);
    if (count === 0) {
      logger.info(
        "[Invalidate Dataset Items] No rows need migration - all valid_to timestamps are set correctly",
      );
    } else {
      logger.info(
        `[Invalidate Dataset Items] Found rows needing migration - ready to process`,
      );
    }

    // Check for index on (id, project_id, valid_from) for performance
    const indexCheck = await prisma.$queryRaw<Array<{ indexname: string }>>(
      Prisma.sql`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'dataset_items'
          AND indexdef LIKE '%id%project_id%valid_from%'
      `,
    );

    if (indexCheck.length === 0) {
      logger.warn(
        "[Invalidate Dataset Items] WARNING: No index found on (id, project_id, valid_from). Migration may be slower. Consider adding: CREATE INDEX CONCURRENTLY idx_dataset_items_id_project_valid ON dataset_items(id, project_id, valid_from);",
      );
    }

    return { valid: true, invalidReason: undefined };
  }

  // ============================================================================
  // Main Run Loop
  // ============================================================================

  async run(args: Record<string, unknown>): Promise<void> {
    const migrationArgs = args as MigrationArgs;
    const batchSize = migrationArgs.batchSize ?? DEFAULT_BATCH_SIZE;
    const dryRun = migrationArgs.dryRun ?? false;

    logger.info(
      `[Invalidate Dataset Items] Starting migration (batchSize: ${batchSize}, dryRun: ${dryRun})`,
    );

    let state = await this.loadState();

    if (state.phase === "init") {
      state.phase = "processing";
      state.startedAt = new Date().toISOString();
      await this.updateState(state);
    }

    // Convert cursor from state (ISO string) to Date
    let cursor = state.lastProcessedCursor
      ? {
          id: state.lastProcessedCursor.id,
          projectId: state.lastProcessedCursor.projectId,
          validFrom: new Date(state.lastProcessedCursor.validFrom),
        }
      : null;

    while (!this.isAborted && state.phase === "processing") {
      try {
        const { rowsUpdated, lastCursor } = await this.processBatch(
          cursor,
          batchSize,
          dryRun,
        );

        if (rowsUpdated === 0) {
          logger.info(
            "[Invalidate Dataset Items] No more rows to process - migration complete",
          );
          state.phase = "completed";
          await this.updateState(state);
          break;
        }

        // Update state
        state.totalRowsUpdated += rowsUpdated;
        state.batchesProcessed += 1;
        state.lastProcessedCursor = lastCursor
          ? {
              id: lastCursor.id,
              projectId: lastCursor.projectId,
              validFrom: lastCursor.validFrom.toISOString(),
            }
          : null;
        await this.updateState(state);

        cursor = lastCursor;

        const rate =
          state.batchesProcessed > 0
            ? Math.round(state.totalRowsUpdated / state.batchesProcessed)
            : 0;
        logger.info(
          `[Invalidate Dataset Items] Batch ${state.batchesProcessed}: Updated ${rowsUpdated} rows (total: ${state.totalRowsUpdated}, avg: ${rate}/batch)`,
        );

        // Small delay to avoid overwhelming the database
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err) {
        logger.error(
          `[Invalidate Dataset Items] Error processing batch at cursor ${JSON.stringify(cursor)}`,
          err,
        );
        throw err;
      }
    }

    if (this.isAborted) {
      logger.info(
        "[Invalidate Dataset Items] Migration aborted - can be resumed from cursor",
      );
      return;
    }

    logger.info(
      `[Invalidate Dataset Items] Migration completed: ${state.totalRowsUpdated} rows updated in ${state.batchesProcessed} batches`,
    );
  }

  async abort(): Promise<void> {
    logger.info("[Invalidate Dataset Items] Aborting migration...");
    this.isAborted = true;
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = parseArgs({
    options: {
      batchSize: { type: "string", short: "b", default: "50000" },
      dryRun: { type: "boolean", short: "d", default: false },
    },
  });

  const migration = new InvalidateOldDatasetItemRows();

  const parsedArgs = {
    batchSize: parseInt(args.values.batchSize as string, 10),
    dryRun: args.values.dryRun as boolean,
  };

  const { valid, invalidReason } = await migration.validate(parsedArgs);

  if (!valid) {
    logger.error(
      `[Invalidate Dataset Items] Validation failed: ${invalidReason}`,
    );
    throw new Error(`Validation failed: ${invalidReason}`);
  }

  await migration.run(parsedArgs);
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      logger.info(
        "[Invalidate Dataset Items] Migration completed successfully",
      );
      process.exit(0);
    })
    .catch((error) => {
      logger.error(
        `[Invalidate Dataset Items] Migration execution failed: ${error}`,
      );
      process.exit(1);
    });
}
