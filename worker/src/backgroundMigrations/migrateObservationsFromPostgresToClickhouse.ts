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
      `Migrating observations from postgres to clickhouse with ${JSON.stringify(args)}`,
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

      const observations = await prisma.$queryRaw<
        Array<Record<string, any>>
      >(Prisma.sql`
        SELECT o.id, o.trace_id, o.project_id, o.type, o.parent_observation_id, o.start_time, o.end_time, o.name, o.metadata, o.level, o.status_message, o.version, o.input, o.output, o.unit, o.model, o.internal_model_id, o."modelParameters" as model_parameters, o.prompt_tokens, o.completion_tokens, o.total_tokens, o.completion_start_time, o.prompt_id, p.name as prompt_name, p.version as prompt_version, o.input_cost, o.output_cost, o.total_cost, o.calculated_input_cost, o.calculated_output_cost, o.calculated_total_cost, o.created_at, o.updated_at
        FROM observations o
        LEFT JOIN prompts p ON o.prompt_id = p.id
        WHERE o.tmp_migrated_to_clickhouse = FALSE AND o.created_at <= ${maxDate}
        ORDER BY o.created_at DESC
        LIMIT ${batchSize};
      `);
      if (observations.length === 0) {
        logger.info("No more observations to migrate. Exiting...");
        break;
      }

      batchFetchTimes.push(Date.now() - fetchStart);
      logger.info(
        `Got ${observations.length} records from Postgres in ${Date.now() - fetchStart}ms`,
      );

      const insertStart = Date.now();
      await clickhouseClient.insert({
        table: "observations",
        values: observations.map((observation) => ({
          id: observation.id,
          trace_id: observation.trace_id,
          project_id: observation.project_id,
          type: observation.type,
          parent_observation_id: observation.parent_observation_id,
          start_time:
            observation.start_time
              ?.toISOString()
              .replace("T", " ")
              .slice(0, -1) ?? null,
          end_time:
            observation.end_time
              ?.toISOString()
              .replace("T", " ")
              .slice(0, -1) ?? null,
          name: observation.name,
          metadata:
            typeof observation.metadata === "string"
              ? { metadata: observation.metadata }
              : Array.isArray(observation.metadata)
                ? { metadata: observation.metadata }
                : observation.metadata,
          level: observation.level,
          status_message: observation.status_message,
          version: observation.version,
          input: observation.input,
          output: observation.output,
          provided_model_name: observation.model,
          internal_model_id: observation.internal_model_id,
          model_parameters: observation.model_parameters,
          provided_usage_details: {},
          usage_details: {
            input: observation.prompt_tokens,
            output: observation.completion_tokens,
            total: observation.total_tokens,
          },
          provided_cost_details: {
            input: observation.input_cost,
            output: observation.output_cost,
            total: observation.total_cost,
          },
          cost_details: {
            input: observation.calculated_input_cost,
            output: observation.calculated_output_cost,
            total: observation.calculated_total_cost,
          },
          total_cost: observation.calculated_total_cost,
          completion_start_time:
            observation.completion_start_time
              ?.toISOString()
              .replace("T", " ")
              .slice(0, -1) ?? null,
          prompt_id: observation.prompt_id,
          prompt_name: observation.prompt_name,
          prompt_version: observation.prompt_version,
          created_at:
            observation.created_at
              ?.toISOString()
              .replace("T", " ")
              .slice(0, -1) ?? null,
          updatedAt:
            observation.updated_at
              ?.toISOString()
              .replace("T", " ")
              .slice(0, -1) ?? null,
        })),
        format: "JSONEachRow",
      });

      batchInsertTimes.push(Date.now() - insertStart);
      logger.info(
        `Inserted ${observations.length} observations into Clickhouse in ${Date.now() - insertStart}ms`,
      );

      await prisma.$executeRaw`
        UPDATE observations
        SET tmp_migrated_to_clickhouse = TRUE
        WHERE id IN (${Prisma.join(observations.map((observation) => observation.id))});
      `;

      processedRows += observations.length;
      batchProcessTimes.push(Date.now() - fetchStart);
      logger.info(`Processed batch in ${Date.now() - fetchStart}ms`);
    }

    if (this.isAborted) {
      logger.info(
        `Migration of observations from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    await prisma.$executeRaw`ALTER TABLE observations DROP COLUMN IF EXISTS tmp_migrated_to_clickhouse;`;
    logger.info(
      `Finished migration of observations from Postgres to Clickhouse in ${Date.now() - start}ms`,
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
