import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  convertPostgresScoreToInsert,
  logger,
} from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

async function addTemporaryColumnIfNotExists() {
  const columnExists = await prisma.$queryRaw<{ column_exists: boolean }[]>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'scores'
        AND column_name = 'tmp_migrated_to_clickhouse'
      ) AS column_exists;
    `,
  );
  if (!columnExists[0]?.column_exists) {
    await prisma.$executeRaw`ALTER TABLE scores ADD COLUMN tmp_migrated_to_clickhouse BOOLEAN DEFAULT FALSE;`;
    logger.info("Added temporary column tmp_migrated_to_clickhouse");
  } else {
    logger.info(
      "Temporary column tmp_migrated_to_clickhouse already exists. Continuing...",
    );
  }
}

export default class MigrateScoresFromPostgresToClickhouse
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
      `Migrating scores from postgres to clickhouse with ${JSON.stringify(args)}`,
    );

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 5000);
    const maxDate = new Date((args.maxDate as string) ?? new Date());

    await addTemporaryColumnIfNotExists();

    let processedRows = 0;
    while (!this.isAborted && processedRows < maxRowsToProcess) {
      const fetchStart = Date.now();

      const scores = await prisma.$queryRaw<
        Array<Record<string, any>>
      >(Prisma.sql`
        SELECT id, timestamp, project_id, trace_id, observation_id, name, value, source, comment, author_user_id, config_id, data_type, string_value, created_at, updated_at
        FROM scores
        WHERE tmp_migrated_to_clickhouse = FALSE AND created_at <= ${maxDate}
        ORDER BY created_at DESC
        LIMIT ${batchSize};
      `);
      if (scores.length === 0) {
        logger.info("No more scores to migrate. Exiting...");
        break;
      }

      logger.info(
        `Got ${scores.length} records from Postgres in ${Date.now() - fetchStart}ms`,
      );

      const insertStart = Date.now();
      await clickhouseClient.insert({
        table: "scores",
        values: scores.map(convertPostgresScoreToInsert),
        format: "JSONEachRow",
      });

      logger.info(
        `Inserted ${scores.length} scores into Clickhouse in ${Date.now() - insertStart}ms`,
      );

      await prisma.$executeRaw`
        UPDATE scores
        SET tmp_migrated_to_clickhouse = TRUE
        WHERE id IN (${Prisma.join(scores.map((score) => score.id))});
      `;

      processedRows += scores.length;
      logger.info(`Processed batch in ${Date.now() - fetchStart}ms`);
    }

    if (this.isAborted) {
      logger.info(
        `Migration of scores from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    await prisma.$executeRaw`ALTER TABLE scores DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;
    logger.info(
      `Finished migration of scores from Postgres to Clickhouse in ${Date.now() - start}ms`,
    );
  }

  async abort(): Promise<void> {
    logger.info(`Aborting migration of scores from Postgres to clickhouse`);
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

  const migration = new MigrateScoresFromPostgresToClickhouse();
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
      logger.error(`Migration execution failed: ${error}`);
      process.exit(1); // Exit with an error code
    });
}
