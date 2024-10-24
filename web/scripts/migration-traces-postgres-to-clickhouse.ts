import "dotenv/config";

import { z } from "zod";
import { clickhouseClient, logger } from "@langfuse/shared/src/server";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { Trace } from "@prisma/client";

const MigrationTracesArgs = z
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

    return MigrationTracesArgs.parse(namedArgs);
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
    name: row.name,
    user_id: row.userId || null,
    metadata: Object.entries(row.metadata || {}).map(([key, value]) => [
      key,
      value?.toString() ?? "",
    ]),
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

const migrationTracesPostgresToClickhouse = async () => {
  const args = parseArgs(process.argv.slice(2));
  const { batchSize, maxRowsToProcess, maxDate } = args;
  let processedRows = 0;

  await addTemporaryColumnIfNotExists();

  logger.info("Starting migration of traces from Postgres to Clickhouse");

  while (maxRowsToProcess > processedRows) {
    // Use queryRaw to get traces
    const traces = await prisma.$queryRaw<Array<Trace>>(Prisma.sql`
      SELECT id, timestamp, name, user_id, metadata, release, version, project_id, public, bookmarked, tags, input, output, session_id, created_at, updated_at
      FROM public.traces
      WHERE tmp_migrated_to_clickhouse = FALSE AND created_at <= ${maxDate}
      LIMIT ${batchSize};
    `);

    if (traces.length === 0) {
      logger.info("No more traces to migrate. Exiting...");
      break;
    }

    const clickhouseTraces = traces.map(mapToClickHouseRow);
    const insertQuery = `INSERT INTO traces (id, timestamp, name, user_id, metadata, release, version, project_id, public, bookmarked, tags, input, output, session_id, created_at, updated_at, event_ts) VALUES `;

    const values = clickhouseTraces
      .map(
        (row: any) => `(
      '${row.id}',
      ${row.timestamp ? `'${row.timestamp}'` : "NULL"},
      '${row.name}',
      ${row.user_id ? `'${row.user_id}'` : "NULL"},
      ${row.metadata ? `map(${row.metadata.map(([k, v]: any) => `'${k}', '${v}'`).join(", ")})` : "map()"},
      ${row.release ? `'${row.release}'` : "NULL"},
      ${row.version ? `'${row.version}'` : "NULL"},
      '${row.project_id}',
      ${row.public ? "1" : "0"},
      ${row.bookmarked ? "1" : "0"},
      array(${row.tags.map((tag: string) => `'${tag}'`).join(", ")}),
      ${row.input ? `'${row.input.replace(/'/g, "\\'")}'` : "NULL"},
      ${row.output ? `'${row.output.replace(/'/g, "\\'")}'` : "NULL"},
      ${row.session_id ? `'${row.session_id}'` : "NULL"},
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

    logger.info(`Inserted ${clickhouseTraces.length} traces into Clickhouse`);

    await prisma.$executeRaw`
      UPDATE public.traces
      SET tmp_migrated_to_clickhouse = TRUE
      WHERE id IN (${Prisma.join(traces.map((trace) => trace.id))});
    `;

    processedRows += traces.length;
  }

  await prisma.$executeRaw`ALTER TABLE traces DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;

  logger.info("Finished migration of traces from Postgres to CLickhouse");
  process.exit(0);
};

migrationTracesPostgresToClickhouse();
