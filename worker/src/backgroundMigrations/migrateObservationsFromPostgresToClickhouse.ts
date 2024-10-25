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
        WHERE table_name = 'observations'
        AND column_name = 'tmp_migrated_to_clickhouse'
      ) AS column_exists;
    `,
  );
  if (!columnExists[0]?.column_exists) {
    await prisma.$executeRaw`ALTER TABLE observations ADD COLUMN tmp_migrated_to_clickhouse BOOLEAN DEFAULT FALSE;`;
    logger.info("Added temporary column tmp_migrated_to_clickhouse");
  } else {
    logger.info(
      "Temporary column tmp_migrated_to_clickhouse already exists. Continuing...",
    );
  }
}

export default class MigrateObservationsFromPostgresToClickhouse
  implements IBackgroundMigration
{
  private isAborted = false;

  private mapToClickHouseRow = (row: any) => {
    return {
      id: row.id,
      trace_id: row.traceId || null,
      project_id: row.projectId,
      type: row.type,
      parent_observation_id: row.parentObservationId || null,
      start_time:
        row.startTime?.toISOString().replace("T", " ").slice(0, -1) ?? null,
      end_time:
        row.endTime?.toISOString().replace("T", " ").slice(0, -1) ?? null,
      name: row.name,
      metadata: row.metadata ?? {},
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
      `Migrating observations from postgres to clickhouse with ${JSON.stringify(args)}`,
    );

    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 5000);
    const maxDate = new Date((args.maxDate as string) ?? new Date());

    await addTemporaryColumnIfNotExists();

    let processedRows = 0;
    while (!this.isAborted && processedRows < maxRowsToProcess) {
      const observations = await prisma.$queryRaw<Array<Trace>>(Prisma.sql`
        SELECT id, trace_id, project_id, type, parent_observation_id, start_time, end_time, name, metadata, level, status_message, version, input, output, unit, prompt_id, input_cost, output_cost, total_cost, created_at, updated_at
        FROM observations
        WHERE tmp_migrated_to_clickhouse = FALSE AND created_at <= ${maxDate}
        LIMIT ${batchSize};
      `);
      if (observations.length === 0) {
        logger.info("No more observations to migrate. Exiting...");
        break;
      }

      const clickhouseObservations = observations.map(this.mapToClickHouseRow);
      await clickhouseClient.insert({
        table: "observations",
        values: clickhouseObservations,
        format: "JSONEachRow",
      });

      logger.info(
        `Inserted ${clickhouseObservations.length} observations into Clickhouse`,
      );

      await prisma.$executeRaw`
        UPDATE observations
        SET tmp_migrated_to_clickhouse = TRUE
        WHERE id IN (${Prisma.join(observations.map((observation) => observation.id))});
      `;

      processedRows += observations.length;
    }

    if (this.isAborted) {
      logger.info(
        `Migration of observations from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    await prisma.$executeRaw`ALTER TABLE observations DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;
    logger.info(
      "Finished migration of observations from Postgres to CLickhouse",
    );
  }

  async abort(): Promise<void> {
    logger.info(
      `Aborting migration of observations from Postgres to clickhouse`,
    );
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

  const migration = new MigrateObservationsFromPostgresToClickhouse();
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
