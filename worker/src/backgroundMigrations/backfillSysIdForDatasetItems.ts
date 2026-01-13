import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
// Note that we keep this for reference such that we do not violate the unique constraint on the background_migrations table
// const backgroundMigrationId = "d4f5a6b7-c8d9-4e1f-a2b3-c4d5e6f7a8b9";

/**
 * Background migration to backfill sys_id for dataset_items.
 *
 * Background:
 * - This migration is no longer needed as we have migrated to the new versioning/temporal table support
 *
 */
export default class BackfillSysIdForDatasetItems
  implements IBackgroundMigration
{
  private isAborted = false;

  async validate(
    _args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    return { valid: true, invalidReason: undefined };
  }

  async run(_args: Record<string, unknown>): Promise<void> {
    logger.info(
      `Migration will be skipped as we no longer need to backfill sys_id for dataset_items`,
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
