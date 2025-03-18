import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  convertPostgresTraceToInsert,
  logger,
} from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "5960f22a-748f-480c-b2f3-bc4f9d5d84bc";

export default class MigrateTracesFromPostgresToClickhouse
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
    if (!tableNames.some((r) => r.name === "traces")) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `ClickHouse traces table does not exist. Retrying in 10s...`,
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }

      // If all retries are exhausted, return as invalid
      return {
        valid: false,
        invalidReason: "ClickHouse traces table does not exist",
      };
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `Migrating traces from postgres to clickhouse with ${JSON.stringify(args)}`,
    );

    // @ts-ignore
    const initialMigrationState: { state: { maxDate: string | undefined } } =
      await prisma.backgroundMigration.findUniqueOrThrow({
        where: { id: backgroundMigrationId },
        select: { state: true },
      });

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 1000);
    const maxDate = initialMigrationState.state?.maxDate
      ? new Date(initialMigrationState.state.maxDate)
      : new Date((args.maxDate as string) ?? new Date());

    await prisma.backgroundMigration.update({
      where: { id: backgroundMigrationId },
      data: { state: { maxDate } },
    });

    let processedRows = 0;
    while (
      !this.isAborted &&
      !this.isFinished &&
      processedRows < maxRowsToProcess
    ) {
      const fetchStart = Date.now();

      // @ts-ignore
      const migrationState: { state: { maxDate: string } } =
        await prisma.backgroundMigration.findUniqueOrThrow({
          where: { id: backgroundMigrationId },
          select: { state: true },
        });

      const traces = await prisma.$queryRaw<
        Array<Record<string, any>>
      >(Prisma.sql`
        SELECT id, timestamp, name, user_id, metadata, release, version, project_id, public, bookmarked, tags, input, output, session_id, created_at, updated_at
        FROM traces
        WHERE created_at <= ${new Date(migrationState.state.maxDate)}
        ORDER BY created_at DESC
        LIMIT ${batchSize};
      `);
      if (traces.length === 0) {
        logger.info("No more traces to migrate. Exiting...");
        break;
      }

      logger.info(
        `Got ${traces.length} records from Postgres in ${Date.now() - fetchStart}ms`,
      );

      const insertStart = Date.now();
      await clickhouseClient().insert({
        table: "traces",
        values: traces.map(convertPostgresTraceToInsert),
        format: "JSONEachRow",
      });

      logger.info(
        `Inserted ${traces.length} traces into Clickhouse in ${Date.now() - insertStart}ms`,
      );

      await prisma.backgroundMigration.update({
        where: { id: backgroundMigrationId },
        data: {
          state: {
            maxDate: new Date(traces[traces.length - 1].created_at),
          },
        },
      });

      if (traces.length < batchSize) {
        logger.info("No more traces to migrate. Exiting...");
        this.isFinished = true;
      }

      processedRows += traces.length;
      logger.info(
        `Processed batch in ${Date.now() - fetchStart}ms. Oldest record in batch: ${new Date(traces[traces.length - 1].created_at).toISOString()}`,
      );
    }

    if (this.isAborted) {
      logger.info(
        `Migration of traces from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    logger.info(
      `Finished migration of traces from Postgres to Clickhouse in ${Date.now() - start}ms`,
    );
  }

  async abort(): Promise<void> {
    logger.info(`Aborting migration of traces from Postgres to clickhouse`);
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
        default: new Date().toISOString(),
      },
    },
  });

  const migration = new MigrateTracesFromPostgresToClickhouse();
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
