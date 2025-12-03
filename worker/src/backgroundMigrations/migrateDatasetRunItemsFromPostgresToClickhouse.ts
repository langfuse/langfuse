import { IBackgroundMigration } from "./IBackgroundMigration";
import { logger } from "@langfuse/shared/src/server";
import { env } from "../env";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
// In this case it is not used as we will skip this migration and run the RMT migration instead
// const backgroundMigrationId = "8d47f91b-3e5c-4a26-9f85-c12d6e4b9a3d";

export default class MigrateDatasetRunItemsFromPostgresToClickhouse
  implements IBackgroundMigration
{
  async validate(): Promise<{
    valid: boolean;
    invalidReason: string | undefined;
  }> {
    // Check if Clickhouse credentials are configured
    if (
      !env.CLICKHOUSE_URL ||
      !env.CLICKHOUSE_USER ||
      !env.CLICKHOUSE_PASSWORD
    ) {
      return {
        valid: false,
        invalidReason:
          "Clickhouse credentials must be configured to perform migration",
      };
    }

    // Return true as we will skip this migration and run the RMT migration instead
    return { valid: true, invalidReason: undefined };
  }

  async run(): Promise<void> {
    logger.info(
      `Migration of dataset run items from postgres to clickhouse skipped as we will run the RMT migration instead`,
    );
  }

  async abort(): Promise<void> {
    logger.info(
      `Aborting migration of dataset run items from Postgres to clickhouse`,
    );
  }
}

async function main() {
  const migration = new MigrateDatasetRunItemsFromPostgresToClickhouse();
  await migration.validate();
  await migration.run();
}

// If the script is being executed directly (not imported), run the main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`Migration execution failed: ${error}`, error);
      process.exit(1); // Exit with an error code
    });
}
