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

  private mapToClickHouseRow = (row: any) => {
    return {
      id: row.id,
      timestamp:
        row.timestamp?.toISOString().replace("T", " ").slice(0, -1) ?? null,
      project_id: row.projectId,
      trace_id: row.traceId,
      observation_id: row.observationId || null,
      name: row.name,
      value: row.value ?? null,
      source: row.source,
      comment: row.comment || null,
      author_user_id: row.authorUserId || null,
      config_id: row.configId || null,
      data_type: row.dataType,
      string_value: row.stringValue || null,
      created_at:
        row.createdAt?.toISOString().replace("T", " ").slice(0, -1) ?? null,
      updated_at:
        row.updatedAt?.toISOString().replace("T", " ").slice(0, -1) ?? null,
      event_ts:
        row.timestamp?.toISOString().replace("T", " ").slice(0, -1) ?? null,
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
      `Migrating scores from postgres to clickhouse with ${JSON.stringify(args)}`,
    );

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 5000);
    const maxDate = new Date((args.maxDate as string) ?? new Date());

    await addTemporaryColumnIfNotExists();

    let processedRows = 0;
    while (!this.isAborted && processedRows < maxRowsToProcess) {
      const scores = await prisma.$queryRaw<Array<Trace>>(Prisma.sql`
        SELECT id, timestamp, project_id, trace_id, observation_id, name, value, source, comment, author_user_id, config_id, data_type, string_value, created_at, updated_at
        FROM scores
        WHERE tmp_migrated_to_clickhouse = FALSE AND created_at <= ${maxDate}
        LIMIT ${batchSize};
      `);
      if (scores.length === 0) {
        logger.info("No more scores to migrate. Exiting...");
        break;
      }

      const clickhouseScores = scores.map(this.mapToClickHouseRow);
      const insertQuery = `INSERT INTO scores (id, timestamp, project_id, trace_id, observation_id, name, value, source, comment, author_user_id, config_id, data_type, string_value, created_at, updated_at, event_ts) VALUES `;

      const values = clickhouseScores
        .map(
          (row: any) => `(
            '${row.id}',
            ${row.timestamp ? `'${row.timestamp}'` : "NULL"},
            '${row.project_id}',
            '${row.trace_id}',
            ${row.observation_id ? `'${row.observation_id}'` : "NULL"},
            '${row.name}',
            ${row.value !== null ? row.value : "NULL"},
            '${row.source}',
            ${row.comment ? `'${row.comment.replace(/'/g, "\\'")}'` : "NULL"},
            ${row.author_user_id ? `'${row.author_user_id}'` : "NULL"},
            ${row.config_id ? `'${row.config_id}'` : "NULL"},
            '${row.data_type}',
            ${row.string_value ? `'${row.string_value.replace(/'/g, "\\'")}'` : "NULL"},
            ${row.created_at ? `'${row.created_at}'` : "NULL"},
            ${row.updated_at ? `'${row.updated_at}'` : "NULL"},
            ${row.event_ts ? `'${row.event_ts}'` : "NULL"}
          )`,
        )
        .join(",");

      const query = insertQuery + values;
      await clickhouseClient.command({
        query,
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      });

      logger.info(`Inserted ${clickhouseScores.length} scores into Clickhouse`);

      await prisma.$executeRaw`
        UPDATE scores
        SET tmp_migrated_to_clickhouse = TRUE
        WHERE id IN (${Prisma.join(scores.map((score) => score.id))});
      `;

      processedRows += scores.length;
    }

    if (this.isAborted) {
      logger.info(
        `Migration of scores from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    await prisma.$executeRaw`ALTER TABLE scores DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;
    logger.info("Finished migration of scores from Postgres to CLickhouse");
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
