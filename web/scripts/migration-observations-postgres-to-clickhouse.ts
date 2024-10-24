import "dotenv/config";
import { z } from "zod";
import { clickhouseClient, logger } from "@langfuse/shared/src/server";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { Observation } from "@prisma/client";

const MigrationObservationsArgs = z
  .object({
    batchSize: z.coerce.number().optional().default(5000),
    maxRowsToProcess: z.coerce.number().optional().default(Infinity),
    maxDate: z.coerce.date().optional().default(new Date()),
  })
  .strict();

async function addTemporaryColumnIfNotExists() {
  const columnExists = await prisma.$queryRaw<{ column_exists: boolean }[]>(
    Prisma.sql`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'observations'
                  AND column_name = 'tmp_migrated_to_clickhouse'
            ) AS column_exists;
        `,
  );
  if (!columnExists[0]?.column_exists) {
    await prisma.$executeRaw`
            ALTER TABLE observations ADD COLUMN tmp_migrated_to_clickhouse BOOLEAN DEFAULT FALSE;
        `;
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
        if (value !== true) i++;
      }
    }
    return MigrationObservationsArgs.parse(namedArgs);
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
    trace_id: row.traceId || null,
    project_id: row.projectId,
    type: row.type,
    parent_observation_id: row.parentObservationId || null,
    start_time:
      row.startTime?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    end_time: row.endTime?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    name: row.name,
    metadata: Object.entries(row.metadata || {}).map(([key, value]) => [
      key,
      value?.toString() ?? "",
    ]),
    level: row.level,
    status_message: row.statusMessage || null,
    version: row.version || null,
    input: row.input ? JSON.stringify(row.input) : null,
    output: row.output ? JSON.stringify(row.output) : null,
    unit: row.unit || null,
    prompt_id: row.promptId || null,
    input_cost: row.inputCost || null,
    output_cost: row.outputCost || null,
    total_cost: row.totalCost || null,
    created_at:
      row.createdAt?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    updated_at:
      row.updatedAt?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    event_ts:
      row.startTime?.toISOString().replace("T", " ").slice(0, -1) ?? null,
  };
};

const migrationObservationsPostgresToClickhouse = async () => {
  const args = parseArgs(process.argv.slice(2));
  const { batchSize, maxRowsToProcess, maxDate } = args;
  let processedRows = 0;

  await addTemporaryColumnIfNotExists();

  logger.info("Starting migration of observations from Postgres to Clickhouse");

  while (maxRowsToProcess > processedRows) {
    const observations = await prisma.$queryRaw<Array<Observation>>(Prisma.sql`
            SELECT id, trace_id, project_id, type, parent_observation_id, start_time, end_time, name, metadata, level, status_message, version, input, output, unit, prompt_id, input_cost, output_cost, total_cost, created_at, updated_at
            FROM public.observations
            WHERE tmp_migrated_to_clickhouse = FALSE AND created_at <= ${maxDate}
            LIMIT ${batchSize};
        `);

    if (observations.length === 0) {
      logger.info("No more observations to migrate. Exiting...");
      break;
    }

    const clickhouseObservations = observations.map(mapToClickHouseRow);
    const insertQuery = `INSERT INTO observations (id, trace_id, project_id, type, parent_observation_id, start_time, end_time, name, metadata, level, status_message, version, input, output, unit, prompt_id, input_cost, output_cost, total_cost, created_at, updated_at, event_ts) VALUES `;

    const values = clickhouseObservations
      .map(
        (row: any) => `(
      '${row.id}',
      ${row.trace_id ? `'${row.trace_id}'` : "NULL"},
      '${row.project_id}',
      '${row.type}',
      ${row.parent_observation_id ? `'${row.parent_observation_id}'` : "NULL"},
      ${row.start_time ? `'${row.start_time}'` : "NULL"},
      ${row.end_time ? `'${row.end_time}'` : "NULL"},
      '${row.name}',
      ${row.metadata ? `map(${row.metadata.map(([k, v]: any) => `'${k}', '${v}'`).join(", ")})` : "map()"},
      '${row.level}',
      ${row.status_message ? `'${row.status_message}'` : "NULL"},
      ${row.version ? `'${row.version}'` : "NULL"},
      ${row.input ? `'${row.input.replace(/'/g, "\\'")}'` : "NULL"},
      ${row.output ? `'${row.output.replace(/'/g, "\\'")}'` : "NULL"},
      ${row.unit ? `'${row.unit}'` : "NULL"},
      ${row.prompt_id ? `'${row.prompt_id}'` : "NULL"},
      ${row.input_cost || "NULL"},
      ${row.output_cost || "NULL"},
      ${row.total_cost || "NULL"},
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

    logger.info(
      `Inserted ${clickhouseObservations.length} observations into Clickhouse`,
    );

    await prisma.$executeRaw`
      UPDATE public.observations
      SET tmp_migrated_to_clickhouse = TRUE
      WHERE id IN (${Prisma.join(observations.map((observation) => observation.id))});
    `;

    processedRows += observations.length;
  }

  await prisma.$executeRaw`ALTER TABLE observations DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;

  logger.info("Finished migration of observations from Postgres to Clickhouse");
  process.exit(0);
};

migrationObservationsPostgresToClickhouse();
