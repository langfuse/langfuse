import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { parseArgs } from "node:util";
import { backfillValidToForDatasetItems } from "./utils/datasetItems";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "d4f5a6b7-c8d9-4e1f-a2b3-c4d5e6f7a8b8";

/**
 * Background migration to backfill valid_to timestamps for dataset_items.
 *
 * Background:
 * - Backfills historical data where old versions have valid_to = NULL
 * - Sets valid_to on old rows to equal the valid_from of the next version
 * - This enables proper temporal queries and ensures old versions are marked as superseded
 *
 * Performance Strategy:
 * - Processes one project at a time to leverage composite index (project_id, id, valid_from)
 * - Batches up to 100 distinct (id) pairs per project
 * - Fetches ALL versions for those IDs and computes LEAD() window function
 * - Window function only processes versions for the batch (not entire table)
 * - Cursor-based pagination prevents re-processing
 *
 */

const DEFAULT_BATCH_SIZE = 1000;

export default class BackfillValidToForDatasetItems
  implements IBackgroundMigration
{
  private isAborted = false;

  async validate(
    _args: Record<string, unknown>,
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

    // Check that valid_to column exists
    const columnExists = await prisma.$queryRaw<{ exists: boolean }[]>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'dataset_items'
          AND column_name = 'valid_to'
        ) AS exists;
      `,
    );

    if (!columnExists[0]?.exists) {
      return {
        valid: false,
        invalidReason: "valid_to column does not exist on dataset_items table",
      };
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `Backfilling valid_to for dataset_items with ${JSON.stringify(args)}`,
    );

    const batchSize = Number(args.batchSize ?? DEFAULT_BATCH_SIZE);
    const delayBetweenBatchesMs = Number(args.delayBetweenBatchesMs ?? 200);

    // @ts-ignore
    const initialMigrationState: {
      state:
        | {
            lastProcessedProjectId: string;
            lastProcessedId: string;
          }
        | {};
    } = await prisma.backgroundMigration.findUniqueOrThrow({
      where: { id: backgroundMigrationId },
      select: { state: true },
    });

    let lastProcessedProjectId =
      "lastProcessedProjectId" in initialMigrationState.state
        ? initialMigrationState.state.lastProcessedProjectId
        : "";
    let lastProcessedId =
      "lastProcessedId" in initialMigrationState.state
        ? initialMigrationState.state.lastProcessedId
        : "";

    while (!this.isAborted) {
      const result = await backfillValidToForDatasetItems(
        lastProcessedProjectId,
        lastProcessedId,
        batchSize,
      );

      if (result.completed) {
        break;
      }

      // Update cursor
      lastProcessedProjectId = result.lastProcessedProjectId!;
      lastProcessedId = result.lastProcessedId!;

      // Update migration state
      await prisma.backgroundMigration.update({
        where: { id: backgroundMigrationId },
        data: {
          state: { lastProcessedProjectId, lastProcessedId },
        },
      });

      // Delay between batches
      if (delayBetweenBatchesMs > 0 && !this.isAborted) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatchesMs),
        );
      }
    }

    const duration = Date.now() - start;
    logger.info(
      `Backfill ${this.isAborted ? "aborted" : "completed"} in ${duration}ms`,
    );
  }

  abort(): Promise<void> {
    logger.info("Aborting dataset_items valid_to backfill migration...");
    this.isAborted = true;
    return Promise.resolve();
  }
}

async function main() {
  const args = parseArgs({
    options: {
      batchSize: { type: "string", short: "b", default: "1000" },
      delayBetweenBatchesMs: { type: "string", short: "d", default: "200" },
    },
  });

  const migration = new BackfillValidToForDatasetItems();
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
