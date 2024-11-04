import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  convertPostgresTraceToInsert,
  logger,
} from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

export default class MigrateTracesFromPostgresToClickhouse
  implements IBackgroundMigration
{
  private isAborted = false;

  async validate(
    args: Record<string, unknown>,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    if (!env.CLICKHOUSE_URL) {
      return {
        valid: false,
        invalidReason: "Clickhouse URL must be configured to perform migration",
      };
    }
    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `Migrating traces from postgres to clickhouse with ${JSON.stringify(args)}`,
    );

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 5000);
    let maxDate = new Date((args.maxDate as string) ?? new Date());

    let processedRows = 0;
    while (!this.isAborted && processedRows < maxRowsToProcess) {
      const fetchStart = Date.now();

      const traces = await prisma.$queryRaw<
        Array<Record<string, any>>
      >(Prisma.sql`
        SELECT id, timestamp, name, user_id, metadata, release, version, project_id, public, bookmarked, tags, input, output, session_id, created_at, updated_at
        FROM traces
        WHERE created_at <= ${maxDate}
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
      await clickhouseClient.insert({
        table: "traces",
        values: traces.map(convertPostgresTraceToInsert),
        format: "JSONEachRow",
      });

      logger.info(
        `Inserted ${traces.length} traces into Clickhouse in ${Date.now() - insertStart}ms`,
      );

      maxDate = new Date(traces[traces.length - 1].created_at);

      processedRows += traces.length;
      logger.info(
        `Processed batch in ${Date.now() - fetchStart}ms. Oldest record in batch: ${maxDate}`,
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
      batchSize: { type: "string", short: "b", default: "5000" },
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
