import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  findS3RefsByPrimaryKey,
  getLastEventLogPrimaryKey,
  insertIntoS3RefsTableFromEventLog,
  logger,
} from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table

type MigrationState = {
  offset: number;
};

const backgroundMigrationId = "c19b91d9-f9a2-468b-8209-95578f970c5b";

export default class MigrateEventLogToBlobStorageRefTable
  implements IBackgroundMigration
{
  private isAborted = false;
  private isFinished = false;

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
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

    // Check if ClickHouse traces table exists
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];
    if (
      !tableNames.some((r) => r.name === "event_log") ||
      !tableNames.some((r) => r.name === "blob_storage_file_log")
    ) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `ClickHouse event_log or blob_storage_file_log tables do not exist. Retrying in 10s...`,
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }

      // If all retries are exhausted, return as invalid
      return {
        valid: false,
        invalidReason:
          "ClickHouse event_log or blob_storage_file_log tables do not exist",
      };
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `Migrating from event_log table to blob_storage_file_log with ${JSON.stringify(args)}`,
    );

    // @ts-ignore
    const initialMigrationState: {
      state: MigrationState;
    } = await prisma.backgroundMigration.findUniqueOrThrow({
      where: { id: backgroundMigrationId },
      select: { state: true },
    });

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 200_000);

    const initialState = initialMigrationState.state.offset
      ? initialMigrationState.state
      : {
          offset: Number(args.offset ?? 0),
        };

    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: initialState },
    });
    let processedRows = 0;
    while (
      !this.isAborted &&
      !this.isFinished &&
      processedRows < maxRowsToProcess
    ) {
      const fetchStart = Date.now();

      // @ts-ignore
      const migrationState: { state: MigrationState } =
        await prisma.backgroundMigration.findUniqueOrThrow({
          where: { id: backgroundMigrationId },
          select: { state: true },
        });

      // ordered by time ascending.
      await insertIntoS3RefsTableFromEventLog(
        batchSize,
        migrationState.state.offset,
      );

      logger.info(
        `Inserted up to ${batchSize} records into blob_storage_file_log in ${Date.now() - fetchStart}ms`,
      );

      const lastEventLogPrimaryKey = await getLastEventLogPrimaryKey();

      if (!lastEventLogPrimaryKey) {
        logger.info("Event log table is empty. Exiting...");
        break;
      }

      const s3Refs = await findS3RefsByPrimaryKey(lastEventLogPrimaryKey);

      if (s3Refs.length > 0) {
        logger.info("No more event logs to migrate. Exiting...");
        this.isFinished = true;
      }

      await prisma.backgroundMigration.update({
        where: { id: backgroundMigrationId },
        data: {
          state: {
            offset: migrationState.state.offset + batchSize,
          },
        },
      });
    }

    if (this.isAborted) {
      logger.info(
        `Migration of event_log table to blob storage log aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    logger.info(
      `Finished migration of event_log table to blob storage log in ${Date.now() - start}ms`,
    );
  }

  async abort(): Promise<void> {
    logger.info(`Aborting migration of event_log table to blob storage log`);
    this.isAborted = true;
  }
}

async function main() {
  const args = parseArgs({
    options: {
      batchSize: { type: "string", short: "b", default: "1000" },
      maxRowsToProcess: { type: "string", short: "r", default: "Infinity" },
      maxDate: {
        type: "string",
        short: "d",
        default: new Date("1970-01-01T00:00:00.000Z").toISOString(),
      },
    },
  });

  const migration = new MigrateEventLogToBlobStorageRefTable();
  await migration.validate(args.values);
  await migration.run(args.values);
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
