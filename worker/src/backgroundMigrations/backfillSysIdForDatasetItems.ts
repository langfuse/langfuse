import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "d4f5a6b7-c8d9-4e1f-a2b3-c4d5e6f7a8b9";

/**
 * Background migration to backfill sys_id for dataset_items.
 *
 * Background:
 * - Dataset items need a sys_id column for versioning/temporal table support
 * - This backfills NULL sys_id values with dataset item id
 *
 * This migration is idempotent and can be safely re-run if interrupted.
 */
export default class BackfillSysIdForDatasetItems
  implements IBackgroundMigration
{
  private isAborted = false;

  async validate(
    // eslint-disable-next-line no-unused-vars
    args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // validate that the background migration record exists
    const migration = await prisma.backgroundMigration.findUnique({
      where: { id: backgroundMigrationId },
    });

    if (!migration) {
      return {
        valid: false,
        invalidReason: "Background migration record does not exist",
      };
    }

    // Check that sys_id column exists
    const columnExists = await prisma.$queryRaw<{ exists: boolean }[]>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'dataset_items'
          AND column_name = 'sys_id'
        ) AS exists;
      `,
    );

    if (!columnExists[0]?.exists) {
      return {
        valid: false,
        invalidReason: "sys_id column does not exist on dataset_items table",
      };
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `Backfilling sys_id for dataset_items with ${JSON.stringify(args)}`,
    );

    const batchSize = Number(args.batchSize ?? 500);
    const delayBetweenBatchesMs = Number(args.delayBetweenBatchesMs ?? 500);

    let totalUpdated = 0;

    while (!this.isAborted) {
      const batchStart = Date.now();

      // Update batch of NULL sys_id rows (ordered for consistent processing)
      const result = await prisma.$executeRaw`
        UPDATE dataset_items
        SET sys_id = id::text
        WHERE (id, project_id) IN (
          SELECT id, project_id
          FROM dataset_items
          WHERE sys_id IS NULL
          LIMIT ${batchSize}
        );
      `;

      const rowsUpdated = Number(result);
      totalUpdated += rowsUpdated;

      logger.info(
        `Updated ${rowsUpdated} rows in ${Date.now() - batchStart}ms. Total: ${totalUpdated}`,
      );

      // Stop when batch is smaller than requested size (no more rows)
      if (rowsUpdated < batchSize) {
        logger.info(
          `Batch size (${rowsUpdated}) < requested (${batchSize}). Migration complete.`,
        );
        break;
      }

      // Delay between batches
      if (delayBetweenBatchesMs > 0 && !this.isAborted) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatchesMs),
        );
      }
    }

    const duration = Date.now() - start;
    logger.info(
      `Backfill ${this.isAborted ? "aborted" : "completed"}. Updated ${totalUpdated} rows in ${duration}ms`,
    );
  }

  abort(): Promise<void> {
    logger.info("Aborting dataset_items sys_id backfill migration...");
    this.isAborted = true;
    return Promise.resolve();
  }
}

async function main() {
  const args = parseArgs({
    options: {},
  });

  const migration = new BackfillSysIdForDatasetItems();
  const { valid, invalidReason } = await migration.validate(args.values);

  if (!valid) {
    logger.error(`[Background Migration] Validation failed: ${invalidReason}`);
    throw new Error(`Validation failed: ${invalidReason}`);
  }

  await migration.run(args.values);
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      logger.info("[Background Migration] Migration completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error(
        `[Background Migration] Migration execution failed: ${error}`,
      );
      process.exit(1); // Exit with an error code
    });
}
