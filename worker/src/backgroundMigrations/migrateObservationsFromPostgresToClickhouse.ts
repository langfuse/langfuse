import { IBackgroundMigration } from "./IBackgroundMigration";
import {
  clickhouseClient,
  convertPostgresObservationToInsert,
  logger,
} from "@langfuse/shared/src/server";
import { parseArgs } from "node:util";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { env } from "../env";

// This is hard-coded in our migrations and uniquely identifies the row in background_migrations table
const backgroundMigrationId = "7526e7c9-0026-4595-af2c-369dfd9176ec";

export default class MigrateObservationsFromPostgresToClickhouse
  implements IBackgroundMigration
{
  private isAborted = false;
  private isFinished = false;

  private async updateMaxDate(stateSuffix: string, maxDate: Date) {
    await prisma.$transaction(
      async (tx) => {
        // @ts-ignore
        const migrationState: { state: Record<string, string> } =
          await tx.backgroundMigration.findUniqueOrThrow({
            where: { id: backgroundMigrationId },
            select: { state: true },
          });
        migrationState.state[`maxDate${stateSuffix}`] = maxDate.toISOString();
        await tx.backgroundMigration.update({
          where: { id: backgroundMigrationId },
          data: { state: migrationState.state },
        });
      },
      {
        maxWait: 5000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async getMaxDate(stateSuffix: string): Promise<Date | undefined> {
    // @ts-ignore
    const migrationState: { state: Record<string, string | undefined> } =
      await prisma.backgroundMigration.findUniqueOrThrow({
        where: { id: backgroundMigrationId },
        select: { state: true },
      });

    return migrationState.state?.[`maxDate${stateSuffix}`]
      ? new Date(migrationState.state[`maxDate${stateSuffix}`] as string)
      : undefined;
  }

  async validate(
    args: Record<string, unknown>,
    attempts = 5,
  ): Promise<{ valid: boolean; invalidReason: string | undefined }> {
    // Check if Clickhouse credentials are configured
    if (
      !env.CLICKHOUSE_URL ||
      !env.CLICKHOUSE_USER ||
      !env.CLICKHOUSE_PASSWORD
    ) {
      return {
        valid: false,
        invalidReason:
          "Clickhouse credentials must be configured to perform migration",
      };
    }

    // Check if ClickHouse observations table exists
    const tables = await clickhouseClient().query({
      query: "SHOW TABLES",
    });
    const tableNames = (await tables.json()).data as { name: string }[];
    if (!tableNames.some((r) => r.name === "observations")) {
      // Retry if the table does not exist as this may mean migrations are still pending
      if (attempts > 0) {
        logger.info(
          `ClickHouse observations table does not exist. Retrying in 10s...`,
        );
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.validate(args, attempts - 1)), 10_000);
        });
      }

      // If all retries are exhausted, return as invalid
      return {
        valid: false,
        invalidReason: "ClickHouse observations table does not exist",
      };
    }

    return { valid: true, invalidReason: undefined };
  }

  async run(args: Record<string, unknown>): Promise<void> {
    const start = Date.now();
    logger.info(
      `Migrating observations from postgres to clickhouse with ${JSON.stringify(args)}`,
    );

    const stateSuffix = (args.stateSuffix as string) ?? "";
    const initialDate = await this.getMaxDate(stateSuffix);
    const maxRowsToProcess = Number(args.maxRowsToProcess ?? Infinity);
    const batchSize = Number(args.batchSize ?? 1000);
    const maxDate =
      initialDate ?? new Date((args.maxDate as string) ?? new Date());

    await this.updateMaxDate(stateSuffix, maxDate);

    let processedRows = 0;
    while (
      !this.isAborted &&
      !this.isFinished &&
      processedRows < maxRowsToProcess
    ) {
      const fetchStart = Date.now();

      const maxDate = await this.getMaxDate(stateSuffix);
      logger.info(`Max date: ${maxDate?.toISOString()}`);

      const observations = await prisma.$queryRaw<
        Array<Record<string, any>>
      >(Prisma.sql`
        SELECT o.id, o.trace_id, o.project_id, o.type, o.parent_observation_id, o.start_time, o.end_time, o.name, o.metadata, o.level, o.status_message, o.version, o.input, o.output, o.unit, o.model, o.internal_model_id, o."modelParameters" as model_parameters, o.prompt_tokens, o.completion_tokens, o.total_tokens, o.completion_start_time, o.prompt_id, p.name as prompt_name, p.version as prompt_version, o.input_cost, o.output_cost, o.total_cost, o.calculated_input_cost, o.calculated_output_cost, o.calculated_total_cost, o.created_at, o.updated_at
        FROM observations o
        LEFT JOIN prompts p ON o.prompt_id = p.id
        WHERE o.created_at <= ${maxDate}
        ORDER BY o.created_at DESC
        LIMIT ${batchSize};
      `);
      if (observations.length === 0) {
        logger.info("No more observations to migrate. Exiting...");
        break;
      }

      logger.info(
        `Got ${observations.length} records from Postgres in ${Date.now() - fetchStart}ms`,
      );

      const insertStart = Date.now();
      await clickhouseClient().insert({
        table: "observations",
        values: observations.map(convertPostgresObservationToInsert),
        format: "JSONEachRow",
      });

      logger.info(
        `Inserted ${observations.length} observations into Clickhouse in ${Date.now() - insertStart}ms`,
      );

      await this.updateMaxDate(
        stateSuffix,
        new Date(observations[observations.length - 1].created_at),
      );

      if (observations.length < batchSize) {
        logger.info("No more observations to migrate. Exiting...");
        this.isFinished = true;
      }

      processedRows += observations.length;
      logger.info(
        `Processed batch in ${Date.now() - fetchStart}ms. Oldest record in batch: ${new Date(observations[observations.length - 1].created_at).toISOString()}`,
      );
    }

    if (this.isAborted) {
      logger.info(
        `Migration of observations from Postgres to Clickhouse aborted after processing ${processedRows} rows. Skipping cleanup.`,
      );
      return;
    }

    logger.info(
      `Finished migration of observations from Postgres to Clickhouse in ${Date.now() - start}ms`,
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
      batchSize: { type: "string", short: "b", default: "1000" },
      maxRowsToProcess: { type: "string", short: "r", default: "Infinity" },
      maxDate: {
        type: "string",
        short: "d",
        default: new Date().toISOString(),
      },
      // State prefix can be used to start multiple migrations at once.
      // We add it to the end of the `maxDate` state key which makes the runs unique and restartable.
      stateSuffix: { type: "string", short: "s", default: "" },
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
