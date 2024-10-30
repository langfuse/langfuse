import { IBackgroundMigration } from "./IBackgroundMigration";
import { clickhouseClient, logger } from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

async function addTemporaryColumnIfNotExists() {
  const columnExists = await prisma.$queryRaw<{ column_exists: boolean }[]>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'traces'
        AND column_name = 'tmp_migrated_to_clickhouse'
      ) AS column_exists;
    `,
  );
  if (!columnExists[0]?.column_exists) {
    await prisma.$executeRaw`ALTER TABLE traces ADD COLUMN tmp_migrated_to_clickhouse BOOLEAN DEFAULT FALSE;`;
    logger.info("Added temporary column tmp_migrated_to_clickhouse");
  } else {
    logger.info(
      "Temporary column tmp_migrated_to_clickhouse already exists. Continuing...",
    );
  }
}

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
    const maxDate = new Date((args.maxDate as string) ?? new Date());

    await addTemporaryColumnIfNotExists();

    let processedRows = 0;

    const batchFetchTimes = [];
    const batchInsertTimes = [];
    const batchProcessTimes = [];

    while (!this.isAborted && processedRows < maxRowsToProcess) {
      const fetchStart = Date.now();

      const traces = await prisma.$queryRaw<
        Array<Record<string, any>>
      >(Prisma.sql`
        SELECT id, timestamp, name, user_id, metadata, release, version, project_id, public, bookmarked, tags, input, output, session_id, created_at, updated_at
        FROM traces
        WHERE tmp_migrated_to_clickhouse = FALSE AND created_at <= ${maxDate}
        ORDER BY created_at DESC
        LIMIT ${batchSize};
      `);
      if (traces.length === 0) {
        logger.info("No more traces to migrate. Exiting...");
        break;
      }

      batchFetchTimes.push(Date.now() - fetchStart);
      logger.info(
        `Got ${traces.length} records from Postgres in ${Date.now() - fetchStart}ms`,
      );

      const insertStart = Date.now();
      await clickhouseClient.insert({
        table: "traces",
        values: traces.map((trace) => ({
          id: trace.id,
          timestamp:
            trace.timestamp?.toISOString().replace("T", " ").slice(0, -1) ??
            null,
          name: trace.name,
          user_id: trace.user_id,
          metadata: trace.metadata, // TODO: we may have to apply the same conversion as for observations. Let's try without.
          release: trace.release,
          version: trace.version,
          project_id: trace.project_id,
          public: trace.public,
          bookmarked: trace.bookmarked,
          tags: trace.tags,
          input: trace.input,
          output: trace.output,
          session_id: trace.session_id,
          created_at:
            trace.created_at?.toISOString().replace("T", " ").slice(0, -1) ??
            null,
          updated_at:
            trace.updated_at?.toISOString().replace("T", " ").slice(0, -1) ??
            null,
        })),
        format: "JSONEachRow",
      });

      batchInsertTimes.push(Date.now() - insertStart);
      logger.info(
        `Inserted ${traces.length} traces into Clickhouse in ${Date.now() - insertStart}ms`,
      );

      await prisma.$executeRaw`
        UPDATE traces
        SET tmp_migrated_to_clickhouse = TRUE
        WHERE id IN (${Prisma.join(traces.map((trace) => trace.id))});
      `;

      processedRows += traces.length;
      batchProcessTimes.push(Date.now() - fetchStart);
      logger.info(`Processed batch in ${Date.now() - fetchStart}ms`);
    }

    if (this.isAborted) {
      logger.info(
        `Migration of traces from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    await prisma.$executeRaw`ALTER TABLE traces DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;
    logger.info(
      `Finished migration of traces from Postgres to Clickhouse in ${Date.now() - start}ms`,
    );

    const fetchTimeMedian = batchFetchTimes.sort((a, b) => a - b)[
      Math.floor(batchFetchTimes.length / 2)
    ];
    const fetchTimeP95 = batchFetchTimes.sort((a, b) => a - b)[
      Math.floor(batchFetchTimes.length * 0.95)
    ];
    const insertTimeMedian = batchInsertTimes.sort((a, b) => a - b)[
      Math.floor(batchInsertTimes.length / 2)
    ];
    const insertTimeP95 = batchInsertTimes.sort((a, b) => a - b)[
      Math.floor(batchInsertTimes.length * 0.95)
    ];
    const processTimeMedian = batchProcessTimes.sort((a, b) => a - b)[
      Math.floor(batchProcessTimes.length / 2)
    ];
    const processTimeP95 = batchProcessTimes.sort((a, b) => a - b)[
      Math.floor(batchProcessTimes.length * 0.95)
    ];
    const processTimeTotal = Date.now() - start;

    logger.info(
      `Batch fetch time: median=${fetchTimeMedian}ms, p95=${fetchTimeP95}ms`,
    );
    logger.info(
      `Batch insert time: median=${insertTimeMedian}ms, p95=${insertTimeP95}ms`,
    );
    logger.info(
      `Batch process time: median=${processTimeMedian}ms, p95=${processTimeP95}ms`,
    );
    logger.info(
      `Total processing time: ${processTimeTotal}ms for ${processedRows} rows`,
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
