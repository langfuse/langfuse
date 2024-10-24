import "dotenv/config";

import { z } from "zod";
import { clickhouseClient, logger } from "@langfuse/shared/src/server";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { Score } from "@prisma/client";

const MigrationScoresArgs = z
  .object({
    batchSize: z.coerce.number().optional().default(5_000),
    maxRowsToProcess: z.coerce.number().optional().default(Infinity), // Default to process all rows
    maxDate: z.coerce.date().optional().default(new Date()), // Default to today
  })
  .strict();

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

function parseArgs(args: string[]) {
  try {
    const namedArgs: Record<string, string | boolean> = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith("--")) {
        const key = args[i].slice(2);
        const value =
          args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
        namedArgs[key] = value;
        if (value !== true) i++; // Skip the next argument if it was used as a value
      }
    }

    return MigrationScoresArgs.parse(namedArgs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error("Validation error:", error.errors);
    } else {
      logger.error("An unexpected error occurred:", error);
    }
    process.exit(1);
  }
}

const mapToClickHouseRow = (row: any) => {
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

const migrationScoresPostgresToClickhouse = async () => {
  const args = parseArgs(process.argv.slice(2));
  const { batchSize, maxRowsToProcess, maxDate } = args;
  let processedRows = 0;

  await addTemporaryColumnIfNotExists();

  logger.info("Starting migration of scores from Postgres to Clickhouse");

  while (maxRowsToProcess > processedRows) {
    // Use queryRaw to get scores
    const scores = await prisma.$queryRaw<Array<Score>>(Prisma.sql`
      SELECT id, timestamp, project_id, trace_id, observation_id, name, value, source, comment, author_user_id, config_id, data_type, string_value, created_at, updated_at
      FROM public.scores
      WHERE tmp_migrated_to_clickhouse = FALSE AND created_at <= ${maxDate}
      LIMIT ${batchSize};
    `);

    if (scores.length === 0) {
      logger.info("No more scores to migrate. Exiting...");
      break;
    }

    const clickhouseScores = scores.map(mapToClickHouseRow);
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
      UPDATE public.scores
      SET tmp_migrated_to_clickhouse = TRUE
      WHERE id IN (${Prisma.join(scores.map((score) => score.id))});
    `;

    processedRows += scores.length;
  }

  await prisma.$executeRaw`ALTER TABLE scores DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;

  logger.info("Finished migration of scores from Postgres to Clickhouse");
  process.exit(0);
};

migrationScoresPostgresToClickhouse();
