import { IBackgroundMigration } from "./IBackgroundMigration";
import { clickhouseClient, logger } from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { env } from "../env";
import { Trace } from "@prisma/client";

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

  private mapToClickHouseRow = (row: any) => {
    return {
      id: row.id,
      timestamp:
        row.timestamp?.toISOString().replace("T", " ").slice(0, -1) ?? null,
      name: row.name,
      user_id: row.userId || null,
      metadata: row.metadata ?? {},
      release: row.release || null,
      version: row.version || null,
      project_id: row.projectId,
      public: row.public,
      bookmarked: row.bookmarked,
      tags: row.tags || [],
      input: row.input ? JSON.stringify(row.input) : null,
      output: row.output ? JSON.stringify(row.output) : null,
      session_id: row.sessionId || null,
      created_at:
        row.createdAt?.toISOString().replace("T", " ").slice(0, -1) ?? null,
      updated_at:
        row.updatedAt?.toISOString().replace("T", " ").slice(0, -1) ?? null,
      event_ts:
        row.timestamp.toISOString().replace("T", " ").slice(0, -1) ?? null,
    };
  };

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
    logger.info(
      `Migrating traces from postgres to clickhouse with ${JSON.stringify(args)}`,
    );

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 5000);
    const maxDate = new Date((args.maxDate as string) ?? new Date());

    await addTemporaryColumnIfNotExists();

    let processedRows = 0;
    while (!this.isAborted && processedRows < maxRowsToProcess) {
      const traces = await prisma.$queryRaw<Array<Trace>>(Prisma.sql`
        SELECT id, timestamp, name, user_id, metadata, release, version, project_id, public, bookmarked, tags, input, output, session_id, created_at, updated_at
        FROM traces
        WHERE tmp_migrated_to_clickhouse = FALSE AND created_at <= ${maxDate}
        LIMIT ${batchSize};
      `);
      if (traces.length === 0) {
        logger.info("No more traces to migrate. Exiting...");
        break;
      }

      const clickhouseTraces = traces.map(this.mapToClickHouseRow);
      await clickhouseClient.insert({
        table: "traces",
        values: clickhouseTraces,
        format: "JSONEachRow",
      });

      logger.info(`Inserted ${clickhouseTraces.length} traces into Clickhouse`);

      await prisma.$executeRaw`
        UPDATE traces
        SET tmp_migrated_to_clickhouse = TRUE
        WHERE id IN (${Prisma.join(traces.map((trace) => trace.id))});
      `;

      processedRows += traces.length;
    }

    if (this.isAborted) {
      logger.info(
        `Migration of traces from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    await prisma.$executeRaw`ALTER TABLE traces DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;
    logger.info("Finished migration of traces from Postgres to CLickhouse");
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
